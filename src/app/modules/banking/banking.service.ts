import {
	BadGatewayException,
	BadRequestException,
	HttpException,
	Injectable,
	InternalServerErrorException,
	Logger,
	ServiceUnavailableException,
} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DataSource, Repository} from 'typeorm';

import {ConfigurationService} from '@core/config/config.service';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';

import {
	BANKING_AUTHORIZATION_START_FAILED,
	BANKING_SELECTED_BANK_UNAVAILABLE,
	BANKING_SERVICE_UNAVAILABLE,
	BANKING_SUPPORTED_BANKS_UNAVAILABLE,
} from './api/constants/banking-messages.constants';
import {BankConnectionAuthorizeDto} from './api/dtos/bank-connection-authorize.dto';
import {BankConnectionCallbackDto} from './api/dtos/bank-connection-callback.dto';
import {BankConnectionResponseDto, ExternalAccountResponseDto} from './api/dtos/bank-connection-response.dto';
import {BankConnectionCallbackResult} from './bank-connection-callback-result';
import {BankConnection} from './bank-connection.entity';
import {getBalancePreference, truncate} from './banking.utils';
import {EnableBankingAccount, EnableBankingSession} from './enable-banking.types';
import {BankingAuthorizationStateError} from './errors/banking-authorization-state.error';
import {BankingEncryptionError} from './errors/banking-encryption.error';
import {ExternalAccountBalance} from './external-account-balance.entity';
import {ExternalAccount} from './external-account.entity';
import {BankingAuthorizationStateService} from './services/banking-authorization-state.service';
import {BankingEncryptionService} from './services/banking-encryption.service';
import {EnableBankingClient, EnableBankingClientError} from './services/enable-banking.client';

const PROVIDER = 'enable-banking';
const PENDING_AUTHORIZATION = 'PENDING_AUTHORIZATION';
const AUTHORIZED = 'AUTHORIZED';
const CANCELLED = 'CANCELLED';
const FAILED = 'FAILED';

@Injectable()
export class BankingService {
	private readonly logger = new Logger(BankingService.name);

	constructor(
		@InjectRepository(BankConnection)
		private readonly bankConnectionRepository: Repository<BankConnection>,
		@InjectRepository(ExternalAccount)
		private readonly externalAccountRepository: Repository<ExternalAccount>,
		@InjectRepository(ExternalAccountBalance)
		private readonly externalAccountBalanceRepository: Repository<ExternalAccountBalance>,
		private readonly accountService: AccountService,
		private readonly configurationService: ConfigurationService,
		private readonly dataSource: DataSource,
		private readonly enableBankingClient: EnableBankingClient,
		private readonly authorizationStateService: BankingAuthorizationStateService,
		private readonly encryptionService: BankingEncryptionService,
	) {}

	async startAuthorization(
		accountId: Account['id'],
		dto: BankConnectionAuthorizeDto,
	): Promise<{authorizationUrl: string}> {
		const aspspName = dto.aspspName.trim();
		const aspspCountry = dto.aspspCountry.toUpperCase();
		const aspsps = await this.getAspsps(aspspCountry);
		const aspsp = aspsps.find((candidate) => candidate.name === aspspName && candidate.country === aspspCountry);

		if (!aspsp) {
			throw new BadRequestException(BANKING_SELECTED_BANK_UNAVAILABLE);
		}

		const account = await this.accountService.findById(accountId);
		const connection = await this.bankConnectionRepository.save(
			this.bankConnectionRepository.create({
				account,
				provider: PROVIDER,
				aspspName: aspsp.name,
				aspspCountry: aspsp.country,
				status: PENDING_AUTHORIZATION,
			}),
		);

		let state: string | undefined;

		try {
			state = await this.authorizationStateService.create({
				accountId: account.id,
				connectionId: connection.id,
				aspspName: aspsp.name,
				aspspCountry: aspsp.country,
			});

			const authorization = await this.enableBankingClient.startAuthorization({
				state,
				redirectUrl: this.configurationService.get('ENABLE_BANKING_REDIRECT_URL'),
				psuId: account.id,
				aspsp: {name: aspsp.name, country: aspsp.country},
				validUntil: new Date(Date.now() + aspsp.maximumConsentValiditySeconds * 1000).toISOString(),
			});

			await this.authorizationStateService.setAuthorizationId(state, authorization.authorizationId);

			return {authorizationUrl: authorization.url};
		} catch (error) {
			if (state) await this.authorizationStateService.delete(state).catch(() => undefined);
			await this.bankConnectionRepository.update({id: connection.id}, {status: FAILED});

			throw this.toAuthorizationStartException(error);
		}
	}

	async findAll(accountId: Account['id']): Promise<BankConnectionResponseDto[]> {
		const connections = await this.bankConnectionRepository
			.createQueryBuilder('connection')
			.where('connection.accountId = :accountId', {accountId})
			.orderBy('connection.createdAt', 'DESC')
			.getMany();

		const externalAccountsByConnection = await Promise.all(
			connections.map(async (connection) => {
				const externalAccounts = await this.externalAccountRepository.find({
					where: {bankConnection: {id: connection.id}},
					order: {createdAt: 'ASC'},
				});
				const accountsWithBalances = await Promise.all(
					externalAccounts.map(async (externalAccount) => {
						const latestBalances = await this.findLatestBalances(externalAccount.id);
						return [externalAccount, latestBalances] as const;
					}),
				);
				return [connection.id, accountsWithBalances] as const;
			}),
		);
		const externalAccountsMap = new Map(externalAccountsByConnection);

		return connections.map((connection) => ({
			id: connection.id,
			provider: connection.provider,
			aspspName: connection.aspspName,
			aspspCountry: connection.aspspCountry,
			status: connection.status,
			consentValidUntil: connection.consentValidUntil,
			lastSyncedAt: connection.lastSyncedAt,
			externalAccounts: (externalAccountsMap.get(connection.id) ?? []).map(([externalAccount, latestBalances]) =>
				this.toExternalAccountResponse(externalAccount, latestBalances),
			),
		}));
	}

	async handleCallback(query: BankConnectionCallbackDto): Promise<BankConnectionCallbackResult> {
		try {
			return await this.handleCallbackInternal(query);
		} catch (error) {
			this.logger.warn(`Banking authorization callback failed: ${this.getSafeErrorCode(error)}`);
			return 'error';
		}
	}

	private async handleCallbackInternal(query: BankConnectionCallbackDto): Promise<BankConnectionCallbackResult> {
		const state = await this.authorizationStateService.consume(query.state);
		if (!state) return 'error';

		const connection = await this.bankConnectionRepository.findOne({
			where: {id: state.connectionId, account: {id: state.accountId}},
		});
		if (!connection || connection.status !== PENDING_AUTHORIZATION) return 'error';

		if (query.error) {
			const status = this.isCancellation(query.error) ? CANCELLED : FAILED;
			await this.bankConnectionRepository.update({id: connection.id}, {status});
			return status === CANCELLED ? 'cancelled' : 'error';
		}

		if (!query.code) {
			await this.bankConnectionRepository.update({id: connection.id}, {status: FAILED});
			return 'error';
		}

		try {
			const session = await this.enableBankingClient.createSession(query.code);
			await this.persistAuthorizedSession(connection.id, session);
			return 'connected';
		} catch (error) {
			this.logger.warn(`Enable Banking authorization failed: ${this.getSafeErrorCode(error)}`);
			await this.bankConnectionRepository.update({id: connection.id}, {status: FAILED});
			return 'error';
		}
	}

	private async persistAuthorizedSession(connectionId: string, session: EnableBankingSession): Promise<void> {
		const consentValidUntil = new Date(session.consentValidUntil);
		if (Number.isNaN(consentValidUntil.getTime())) {
			throw new EnableBankingClientError('invalid_provider_response');
		}

		await this.dataSource.transaction(async (manager) => {
			const connectionRepository = manager.getRepository(BankConnection);
			const externalAccountRepository = manager.getRepository(ExternalAccount);
			const connection = await connectionRepository.findOneBy({id: connectionId});

			if (!connection || connection.status !== PENDING_AUTHORIZATION) {
				throw new Error('Bank connection is no longer pending.');
			}

			await connectionRepository.update(
				{id: connectionId},
				{
					providerSessionId: this.encryptionService.encrypt(session.sessionId),
					status: AUTHORIZED,
					aspspName: session.aspsp.name,
					aspspCountry: session.aspsp.country,
					consentValidUntil,
					lastSyncError: null,
				},
			);

			for (const account of session.accounts) {
				if (!account.uid) continue;

				const values = this.toExternalAccountValues(account);
				let externalAccount = await externalAccountRepository.findOne({
					where: {bankConnection: {id: connectionId}, providerAccountId: account.uid},
				});

				if (!externalAccount) {
					externalAccount = await externalAccountRepository.findOne({
						where: {bankConnection: {id: connectionId}, identificationHash: account.identificationHash},
					});
				}

				if (!externalAccount) {
					externalAccount = externalAccountRepository.create({
						bankConnection: {id: connectionId},
						...values,
					});
				} else {
					Object.assign(externalAccount, values);
				}

				await externalAccountRepository.save(externalAccount);
			}
		});
	}

	private async getAspsps(country: string) {
		try {
			return await this.enableBankingClient.getAspsps(country);
		} catch (error) {
			throw this.toProviderException(error, BANKING_SUPPORTED_BANKS_UNAVAILABLE);
		}
	}

	private toExternalAccountValues(account: EnableBankingAccount) {
		return {
			providerAccountId: account.uid as string,
			identificationHash: account.identificationHash,
			name: truncate(account.name, 255),
			details: truncate(account.details, 255),
			currency: account.currency.toUpperCase(),
			cashAccountType: truncate(account.cashAccountType, 32),
			usage: truncate(account.usage, 16),
		};
	}

	private async findLatestBalances(externalAccountId: string): Promise<ExternalAccountBalance[]> {
		return this.externalAccountBalanceRepository
			.createQueryBuilder('balance')
			.distinctOn(['balance.balanceType'])
			.where('balance.externalAccountId = :externalAccountId', {externalAccountId})
			.orderBy('balance.balanceType', 'ASC')
			.addOrderBy('balance.observedAt', 'DESC')
			.addOrderBy('balance.id', 'DESC')
			.getMany();
	}

	private toExternalAccountResponse(
		account: ExternalAccount,
		latestBalances: ExternalAccountBalance[],
	): ExternalAccountResponseDto {
		const primaryBalance = this.selectPreferredBalance(latestBalances);

		return {
			id: account.id,
			name: account.name,
			details: account.details,
			alias: account.alias,
			currency: account.currency,
			cashAccountType: account.cashAccountType,
			usage: account.usage,
			maskedIdentifier: account.maskedIdentifier,
			currentBalanceAmount: account.currentBalanceAmount,
			currentBalanceType: account.currentBalanceType,
			balanceUpdatedAt: account.balanceUpdatedAt,
			isActive: account.isActive,
			latestBalances: latestBalances.map((balance) => ({
				name: balance.name,
				balanceType: balance.balanceType,
				amount: balance.amount,
				currency: balance.currency,
				lastChangeDateTime: balance.lastChangeDateTime,
				referenceDate: balance.referenceDate,
				observedAt: balance.observedAt,
				isPrimary: primaryBalance?.id === balance.id,
			})),
		};
	}

	private selectPreferredBalance(balances: ExternalAccountBalance[]): ExternalAccountBalance | undefined {
		return [...balances].sort((left, right) => {
			const rankDifference = getBalancePreference(right.balanceType) - getBalancePreference(left.balanceType);
			if (rankDifference !== 0) return rankDifference;
			return right.observedAt.getTime() - left.observedAt.getTime();
		})[0];
	}

	private isCancellation(error: string): boolean {
		return ['access_denied', 'cancelled', 'user_cancelled', 'user_canceled'].includes(error.toLowerCase());
	}

	private toProviderException(error: unknown, message: string): BadGatewayException {
		if (error instanceof BadGatewayException) return error;
		return new BadGatewayException(message);
	}

	private toAuthorizationStartException(error: unknown): HttpException {
		if (error instanceof BadRequestException) return error;

		if (error instanceof BankingAuthorizationStateError) {
			if (error.code === 'storage_unavailable' || error.code === 'write_failed') {
				return new ServiceUnavailableException(BANKING_SERVICE_UNAVAILABLE);
			}

			return new InternalServerErrorException(BANKING_AUTHORIZATION_START_FAILED);
		}

		if (error instanceof EnableBankingClientError) {
			return new BadGatewayException(BANKING_AUTHORIZATION_START_FAILED);
		}

		return new InternalServerErrorException(BANKING_AUTHORIZATION_START_FAILED);
	}

	private getSafeErrorCode(error: unknown): string {
		if (error instanceof EnableBankingClientError) return `provider_${this.toLogSafeCode(error.code)}`;
		if (error instanceof BankingAuthorizationStateError) return `authorization_state_${error.code}`;
		if (error instanceof BankingEncryptionError) return `encryption_${error.code}`;
		return 'internal_error';
	}

	private toLogSafeCode(value: string): string {
		return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
	}
}
