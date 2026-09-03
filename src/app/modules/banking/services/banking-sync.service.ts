import {
	ConflictException,
	Inject,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import Redis from 'ioredis';
import {createHash, randomUUID} from 'node:crypto';
import {DataSource, Repository} from 'typeorm';

import {REDIS} from '@core/redis/redis.constants';
import {Account} from '@modules/account/account.entity';

import {
	BANKING_CONNECTION_NOT_AUTHORIZED,
	BANKING_CONNECTION_NOT_FOUND,
	BANKING_CONNECTION_SESSION_UNAVAILABLE,
	BANKING_CONSENT_EXPIRED,
	BANKING_FAILED_SYNC_ERROR,
	BANKING_INTERNAL_ERROR,
	BANKING_PARTIAL_SYNC_ERROR,
	BANKING_PERSISTENCE_SYNC_ERROR,
	BANKING_SERVICE_UNAVAILABLE,
	BANKING_SYNC_ALREADY_IN_PROGRESS,
} from '../api/constants/banking-messages.constants';
import {
	BankSyncRunResponseDto,
	ExternalTransactionResponseDto,
	ExternalTransactionsResponseDto,
} from '../api/dtos/bank-connection-response.dto';
import {BankConnection} from '../bank-connection.entity';
import {BankSyncRun} from '../bank-sync-run.entity';
import {normalizeBankTransactionType} from '../bank-transaction-type';
import {getBalancePreference, truncate} from '../banking.utils';
import {
	EnableBankingBalance,
	EnableBankingTransaction,
	EnableBankingTransactionFetchOptions,
} from '../enable-banking.types';
import {BankingEncryptionError} from '../errors/banking-encryption.error';
import {ExternalAccountBalance} from '../external-account-balance.entity';
import {ExternalAccount} from '../external-account.entity';
import {ExternalTransaction} from '../external-transaction.entity';
import {BankingEncryptionService} from './banking-encryption.service';
import {EnableBankingClient, EnableBankingClientError} from './enable-banking.client';

const AUTHORIZED = 'AUTHORIZED';
const EXPIRED = 'EXPIRED';
const RUNNING = 'RUNNING';
const SUCCEEDED = 'SUCCEEDED';
const FAILED = 'FAILED';
const PARTIAL = 'PARTIAL';

const INCREMENTAL_OVERLAP_DAYS = 7;
const SYNC_LOCK_TTL_SECONDS = 15 * 60;
const SYNC_LOCK_PREFIX = 'banking:sync:';

type AccountFetchResult = {
	externalAccount: ExternalAccount;
	balances: EnableBankingBalance[];
	transactions: EnableBankingTransaction[];
	balancesSucceeded: boolean;
	transactionsSucceeded: boolean;
};

type SyncFetchResult = {
	accounts: AccountFetchResult[];
	hasFailure: boolean;
	hasSuccessfulEndpoint: boolean;
	connectionExpired: boolean;
};

@Injectable()
export class BankingSyncService {
	private readonly logger = new Logger(BankingSyncService.name);

	constructor(
		@InjectRepository(BankConnection)
		private readonly bankConnectionRepository: Repository<BankConnection>,
		@InjectRepository(ExternalAccount)
		private readonly externalAccountRepository: Repository<ExternalAccount>,
		@InjectRepository(BankSyncRun)
		private readonly bankSyncRunRepository: Repository<BankSyncRun>,
		@InjectRepository(ExternalTransaction)
		private readonly externalTransactionRepository: Repository<ExternalTransaction>,
		@Inject(REDIS)
		private readonly redis: Redis,
		private readonly dataSource: DataSource,
		private readonly enableBankingClient: EnableBankingClient,
		private readonly encryptionService: BankingEncryptionService,
	) {}

	async synchronize(accountId: Account['id'], connectionId: BankConnection['id']): Promise<BankSyncRunResponseDto> {
		const connection = await this.findOwnedConnection(accountId, connectionId);
		const lockToken = randomUUID();
		await this.acquireLock(connectionId, lockToken);

		try {
			await this.validateConnection(connection);

			const externalAccounts = await this.externalAccountRepository.find({
				where: {bankConnection: {id: connection.id}, isActive: true},
				order: {createdAt: 'ASC'},
			});
			const previousSuccessfulRun = await this.findPreviousSuccessfulRun(connection.id);
			const requestedTo = this.toDateOnly(new Date()) as string;
			const requestedFrom = previousSuccessfulRun
				? this.subtractDays(previousSuccessfulRun.requestedTo ?? requestedTo, INCREMENTAL_OVERLAP_DAYS)
				: null;
			const transactionOptions: EnableBankingTransactionFetchOptions = previousSuccessfulRun
				? {strategy: 'default', dateFrom: requestedFrom ?? undefined, dateTo: requestedTo}
				: {strategy: 'longest'};

			const run = await this.bankSyncRunRepository.save(
				this.bankSyncRunRepository.create({
					bankConnection: {id: connection.id},
					status: RUNNING,
					requestedFrom,
					requestedTo,
				}),
			);

			let fetchResult: SyncFetchResult;
			try {
				fetchResult = await this.fetchAccounts(externalAccounts, transactionOptions);
			} catch {
				fetchResult = {
					accounts: [],
					hasFailure: true,
					hasSuccessfulEndpoint: false,
					connectionExpired: false,
				};
			}

			const status = this.getRunStatus(fetchResult);
			const finishedAt = new Date();

			try {
				await this.persistSync(connection, run, fetchResult, status, finishedAt);
			} catch {
				await this.markPersistenceFailure(connection.id, run.id);
				throw new InternalServerErrorException(BANKING_PERSISTENCE_SYNC_ERROR);
			}

			const completedRun = await this.bankSyncRunRepository.findOneBy({id: run.id});
			if (!completedRun) throw new InternalServerErrorException(BANKING_PERSISTENCE_SYNC_ERROR);

			return this.toSyncRunResponse(completedRun);
		} finally {
			try {
				await this.releaseLock(connectionId, lockToken);
			} catch {
				this.logger.warn('Bank synchronization lock release failed.');
			}
		}
	}

	async findTransactions(
		accountId: Account['id'],
		connectionId: BankConnection['id'],
		limit: number,
	): Promise<ExternalTransactionsResponseDto> {
		await this.findOwnedConnection(accountId, connectionId);

		const query = this.externalTransactionRepository
			.createQueryBuilder('transaction')
			.innerJoin('transaction.externalAccount', 'externalAccount')
			.innerJoin('externalAccount.bankConnection', 'connection')
			.innerJoin('connection.account', 'account')
			.where('connection.id = :connectionId', {connectionId})
			.andWhere('account.id = :accountId', {accountId})
			.orderBy('transaction.bookingDate', 'DESC', 'NULLS LAST')
			.addOrderBy('transaction.valueDate', 'DESC', 'NULLS LAST')
			.addOrderBy('transaction.createdAt', 'DESC')
			.take(limit);

		const [transactions, total] = await query.getManyAndCount();
		return {
			transactions: transactions.map((transaction) => this.toTransactionResponse(transaction)),
			total,
		};
	}

	private async findOwnedConnection(accountId: Account['id'], connectionId: BankConnection['id']) {
		const connection = await this.bankConnectionRepository.findOne({
			where: {id: connectionId, account: {id: accountId}},
		});
		if (!connection) throw new NotFoundException(BANKING_CONNECTION_NOT_FOUND);
		return connection;
	}

	private async validateConnection(connection: BankConnection): Promise<void> {
		if (connection.status !== AUTHORIZED) {
			throw new ConflictException(BANKING_CONNECTION_NOT_AUTHORIZED);
		}

		if (!connection.providerSessionId) {
			throw new ConflictException(BANKING_CONNECTION_SESSION_UNAVAILABLE);
		}

		try {
			this.encryptionService.decrypt(connection.providerSessionId);
		} catch (error) {
			if (error instanceof BankingEncryptionError) {
				throw new ConflictException(BANKING_CONNECTION_SESSION_UNAVAILABLE);
			}
			throw new InternalServerErrorException(BANKING_INTERNAL_ERROR);
		}

		if (!connection.consentValidUntil || connection.consentValidUntil.getTime() <= Date.now()) {
			await this.bankConnectionRepository.update(
				{id: connection.id},
				{status: EXPIRED, lastSyncError: BANKING_CONSENT_EXPIRED},
			);
			throw new ConflictException(BANKING_CONSENT_EXPIRED);
		}
	}

	private async findPreviousSuccessfulRun(connectionId: BankConnection['id']): Promise<BankSyncRun | null> {
		return this.bankSyncRunRepository.findOne({
			where: {bankConnection: {id: connectionId}, status: SUCCEEDED},
			order: {finishedAt: 'DESC'},
		});
	}

	private async fetchAccounts(
		externalAccounts: ExternalAccount[],
		transactionOptions: EnableBankingTransactionFetchOptions,
	): Promise<SyncFetchResult> {
		const accounts: AccountFetchResult[] = [];
		let hasFailure = false;
		let hasSuccessfulEndpoint = false;
		let connectionExpired = false;

		for (const externalAccount of externalAccounts) {
			let balances: EnableBankingBalance[] = [];
			let transactions: EnableBankingTransaction[] = [];
			let balancesSucceeded = false;
			let transactionsSucceeded = false;

			try {
				balances = await this.enableBankingClient.getAccountBalances(externalAccount.providerAccountId);
				balancesSucceeded = true;
				hasSuccessfulEndpoint = true;
			} catch (error) {
				hasFailure = true;
				connectionExpired ||= this.isExpiredSessionError(error);
			}

			if (connectionExpired) break;

			try {
				transactions = await this.enableBankingClient.getAccountTransactions(
					externalAccount.providerAccountId,
					transactionOptions,
				);
				transactionsSucceeded = true;
				hasSuccessfulEndpoint = true;
			} catch (error) {
				hasFailure = true;
				connectionExpired ||= this.isExpiredSessionError(error);
			}

			accounts.push({
				externalAccount,
				balances,
				transactions,
				balancesSucceeded,
				transactionsSucceeded,
			});

			if (connectionExpired) break;
		}

		return {accounts, hasFailure, hasSuccessfulEndpoint, connectionExpired};
	}

	private getRunStatus(fetchResult: SyncFetchResult): string {
		if (!fetchResult.hasFailure) return SUCCEEDED;
		return fetchResult.hasSuccessfulEndpoint ? PARTIAL : FAILED;
	}

	private async persistSync(
		connection: BankConnection,
		run: BankSyncRun,
		fetchResult: SyncFetchResult,
		status: string,
		finishedAt: Date,
	): Promise<void> {
		const errorMessage = fetchResult.connectionExpired
			? BANKING_CONSENT_EXPIRED
			: status === PARTIAL
				? BANKING_PARTIAL_SYNC_ERROR
				: status === FAILED
					? BANKING_FAILED_SYNC_ERROR
					: null;

		await this.dataSource.transaction(async (manager) => {
			const connectionRepository = manager.getRepository(BankConnection);
			const runRepository = manager.getRepository(BankSyncRun);
			const balanceRepository = manager.getRepository(ExternalAccountBalance);
			const externalTransactionRepository = manager.getRepository(ExternalTransaction);
			const externalAccountRepository = manager.getRepository(ExternalAccount);
			const observedAt = new Date();

			for (const accountResult of fetchResult.accounts) {
				if (accountResult.balancesSucceeded && accountResult.balances.length > 0) {
					await balanceRepository.insert(
						accountResult.balances.map((balance) =>
							this.toBalanceValues(accountResult.externalAccount, run, balance, observedAt),
						),
					);
				}

				if (accountResult.transactionsSucceeded && accountResult.transactions.length > 0) {
					await externalTransactionRepository.upsert(
						accountResult.transactions.map((transaction) =>
							this.toExternalTransactionValues(accountResult.externalAccount, transaction),
						),
						['externalAccountId', 'dedupeKey'],
					);
				}

				if (accountResult.balancesSucceeded && accountResult.balances.length > 0) {
					const preferredBalance = this.selectPreferredBalance(accountResult.balances);
					if (preferredBalance) {
						await externalAccountRepository.update(
							{id: accountResult.externalAccount.id},
							{
								currentBalanceAmount: preferredBalance.amount,
								currentBalanceType: truncate(preferredBalance.balanceType, 32),
								balanceUpdatedAt: this.toDateTime(preferredBalance.lastChangeDateTime) ?? observedAt,
							},
						);
					}
				}
			}

			await runRepository.update(
				{id: run.id},
				{
					status,
					finishedAt,
					accountsFetched: fetchResult.accounts.filter(
						(account) => account.balancesSucceeded || account.transactionsSucceeded,
					).length,
					balancesFetched: fetchResult.accounts.reduce(
						(count, account) => count + (account.balancesSucceeded ? account.balances.length : 0),
						0,
					),
					transactionsFetched: fetchResult.accounts.reduce(
						(count, account) => count + (account.transactionsSucceeded ? account.transactions.length : 0),
						0,
					),
					errorMessage,
				},
			);

			await connectionRepository.update(
				{id: connection.id},
				{
					status: fetchResult.connectionExpired ? EXPIRED : connection.status,
					lastSyncedAt: status === SUCCEEDED || status === PARTIAL ? finishedAt : connection.lastSyncedAt,
					lastSyncError: errorMessage,
				},
			);
		});
	}

	private async markPersistenceFailure(connectionId: string, runId: string): Promise<void> {
		await this.bankSyncRunRepository.update(
			{id: runId},
			{status: FAILED, finishedAt: new Date(), errorMessage: BANKING_PERSISTENCE_SYNC_ERROR},
		);
		await this.bankConnectionRepository.update({id: connectionId}, {lastSyncError: BANKING_PERSISTENCE_SYNC_ERROR});
	}

	private toBalanceValues(
		externalAccount: ExternalAccount,
		run: BankSyncRun,
		balance: EnableBankingBalance,
		observedAt: Date,
	) {
		return {
			externalAccountId: externalAccount.id,
			bankSyncRunId: run.id,
			name: truncate(balance.name, 255),
			balanceType: truncate(balance.balanceType, 32) ?? 'UNKNOWN',
			amount: balance.amount,
			currency: balance.currency.toUpperCase(),
			lastChangeDateTime: this.toDateTime(balance.lastChangeDateTime),
			referenceDate: this.toDateOnly(balance.referenceDate),
			lastCommittedTransaction: truncate(balance.lastCommittedTransaction, 255),
			observedAt,
		};
	}

	private toExternalTransactionValues(externalAccount: ExternalAccount, transaction: EnableBankingTransaction) {
		const amount = this.toSignedAmount(transaction.amount, transaction.creditDebitIndicator);
		const currency = transaction.currency.toUpperCase();
		const description = truncate(transaction.description, 500);
		const counterpartyName = truncate(transaction.counterpartyName, 255);
		const remittanceInformation = truncate(transaction.remittanceInformation, 10_000);
		const transactionDate = this.toDateOnly(transaction.transactionDate);
		const bookingDate = this.toDateOnly(transaction.bookingDate);
		const valueDate = this.toDateOnly(transaction.valueDate);
		const providerTransactionId = truncate(transaction.providerTransactionId, 255);
		const entryReference = truncate(transaction.entryReference, 255);
		const creditDebitIndicator = truncate(transaction.creditDebitIndicator, 8);
		const bankTransactionCode = truncate(transaction.bankTransactionCode, 64);
		const bankTransactionSubCode = truncate(transaction.bankTransactionSubCode, 64);
		const bankTransactionDescription = truncate(transaction.bankTransactionDescription, 255);
		const hasBalanceAfter = Boolean(transaction.balanceAfterAmount && transaction.balanceAfterCurrency);
		const hasInstructedAmount = Boolean(transaction.instructedAmount && transaction.instructedCurrency);
		const hasExchangeRate = Boolean(transaction.exchangeRate && transaction.exchangeRateUnitCurrency);

		return {
			externalAccountId: externalAccount.id,
			providerTransactionId,
			entryReference,
			dedupeKey: this.createDedupeKey({
				providerTransactionId,
				entryReference,
				bookingDate,
				valueDate,
				amount,
				currency,
				creditDebitIndicator,
				description,
				counterpartyName,
				remittanceInformation,
			}),
			transactionDate,
			bookingDate,
			valueDate,
			amount,
			currency,
			creditDebitIndicator,
			transactionType: normalizeBankTransactionType({
				code: bankTransactionCode ?? undefined,
				subCode: bankTransactionSubCode ?? undefined,
				description: bankTransactionDescription ?? undefined,
			}),
			transactionStatus: truncate(transaction.status, 32),
			bankTransactionCode,
			bankTransactionSubCode,
			bankTransactionDescription,
			description,
			counterpartyName,
			merchantCategoryCode: truncate(transaction.merchantCategoryCode, 16),
			remittanceInformation,
			balanceAfterAmount: hasBalanceAfter ? transaction.balanceAfterAmount : null,
			balanceAfterCurrency: hasBalanceAfter ? transaction.balanceAfterCurrency?.toUpperCase() : null,
			instructedAmount: hasInstructedAmount ? transaction.instructedAmount : null,
			instructedCurrency: hasInstructedAmount ? transaction.instructedCurrency?.toUpperCase() : null,
			exchangeRate: hasExchangeRate ? transaction.exchangeRate : null,
			exchangeRateUnitCurrency: hasExchangeRate ? transaction.exchangeRateUnitCurrency?.toUpperCase() : null,
			exchangeRateType: truncate(transaction.exchangeRateType, 16),
			referenceNumber: truncate(transaction.referenceNumber, 255),
			referenceNumberScheme: truncate(transaction.referenceNumberScheme, 32),
		};
	}

	private toTransactionResponse(transaction: ExternalTransaction): ExternalTransactionResponseDto {
		return {
			id: transaction.id,
			bookingDate: transaction.bookingDate,
			valueDate: transaction.valueDate,
			amount: transaction.amount,
			currency: transaction.currency,
			creditDebitIndicator: transaction.creditDebitIndicator,
			transactionStatus: transaction.transactionStatus,
			description: transaction.description,
			counterpartyName: transaction.counterpartyName,
			merchantCategoryCode: transaction.merchantCategoryCode,
			remittanceInformation: transaction.remittanceInformation,
		};
	}

	private toSyncRunResponse(run: BankSyncRun): BankSyncRunResponseDto {
		return {
			id: run.id,
			status: run.status,
			startedAt: run.startedAt,
			finishedAt: run.finishedAt,
			requestedFrom: run.requestedFrom,
			requestedTo: run.requestedTo,
			accountsFetched: run.accountsFetched,
			balancesFetched: run.balancesFetched,
			transactionsFetched: run.transactionsFetched,
			errorMessage: run.errorMessage,
		};
	}

	private selectPreferredBalance(balances: EnableBankingBalance[]): EnableBankingBalance | undefined {
		return [...balances].sort((left, right) => {
			const preferenceDifference =
				getBalancePreference(right.balanceType) - getBalancePreference(left.balanceType);
			if (preferenceDifference !== 0) return preferenceDifference;
			return (right.referenceDate ?? right.lastChangeDateTime ?? '').localeCompare(
				left.referenceDate ?? left.lastChangeDateTime ?? '',
			);
		})[0];
	}

	private createDedupeKey(values: Record<string, string | null>): string {
		const identity = values.providerTransactionId
			? `transaction:${values.providerTransactionId}`
			: values.entryReference
				? `entry:${values.entryReference}`
				: Object.entries(values)
						.map(([key, value]) => `${key}:${this.normalizeForHash(value)}`)
						.join('|');

		return createHash('sha256').update(identity).digest('hex');
	}

	private normalizeForHash(value: string | null): string {
		return value?.trim().toLowerCase() ?? '';
	}

	private toSignedAmount(amount: string, creditDebitIndicator?: string): string {
		const normalizedAmount = amount.trim();
		const isNegative = normalizedAmount.startsWith('-');
		const unsignedAmount = normalizedAmount.replace(/^[+-]/, '');

		if (creditDebitIndicator === 'DBIT' && !isNegative) return `-${unsignedAmount}`;
		if (creditDebitIndicator === 'CRDT' && isNegative) return unsignedAmount;
		return normalizedAmount;
	}

	private toDateTime(value: string | undefined): Date | null {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	private toDateOnly(value: Date | string | undefined): string | null {
		if (!value) return null;
		if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
			const date = new Date(`${value}T00:00:00.000Z`);
			return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
		}

		const date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
	}

	private subtractDays(value: string, days: number): string {
		const date = new Date(`${value}T00:00:00.000Z`);
		date.setUTCDate(date.getUTCDate() - days);
		return this.toDateOnly(date) as string;
	}

	private isExpiredSessionError(error: unknown): boolean {
		if (!(error instanceof EnableBankingClientError)) return false;
		const code = error.code.toLowerCase();
		return (
			error.providerStatus === 401 ||
			error.providerStatus === 403 ||
			code.includes('session') ||
			code.includes('consent') ||
			code.includes('revok') ||
			code.includes('expired')
		);
	}

	private async acquireLock(connectionId: string, token: string): Promise<void> {
		let result: string | null;
		try {
			result = await this.redis.set(
				`${SYNC_LOCK_PREFIX}${connectionId}`,
				token,
				'EX',
				SYNC_LOCK_TTL_SECONDS,
				'NX',
			);
		} catch {
			throw new ServiceUnavailableException(BANKING_SERVICE_UNAVAILABLE);
		}

		if (result !== 'OK') throw new ConflictException(BANKING_SYNC_ALREADY_IN_PROGRESS);
	}

	private async releaseLock(connectionId: string, token: string): Promise<void> {
		await this.redis.eval(
			"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
			1,
			`${SYNC_LOCK_PREFIX}${connectionId}`,
			token,
		);
	}
}
