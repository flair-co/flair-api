import {createHash} from 'node:crypto';
import {Repository} from 'typeorm';

import {BankConnectionCallbackDto} from './api/dtos/bank-connection-callback.dto';
import {BankConnection} from './bank-connection.entity';
import {BankingService} from './banking.service';
import {BankingAuthorizationStateService} from './services/banking-authorization-state.service';

function hashState(state: string): string {
	return createHash('sha256').update(state).digest('hex');
}

describe('BankingService authorization state lifecycle', () => {
	it('marks the matching pending connection failed when an expired state is consumed', async () => {
		const bankConnectionRepository = {
			update: jest.fn().mockResolvedValue({affected: 1}),
		};
		const authorizationStateService = {
			consumeWithStatus: jest.fn().mockResolvedValue(null),
		};
		const service = new BankingService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			authorizationStateService as unknown as BankingAuthorizationStateService,
			{} as never,
		);
		const query: BankConnectionCallbackDto = {state: 'expired-state', code: 'late-provider-code'};

		await expect(service.handleCallback(query)).resolves.toBe('error');

		expect(bankConnectionRepository.update).toHaveBeenCalledWith(
			{authorizationStateHash: hashState(query.state as string), status: 'PENDING_AUTHORIZATION'},
			{status: 'FAILED', authorizationStateHash: null},
		);
	});

	it('does not expire a pending connection when a callback state was already consumed', async () => {
		const bankConnectionRepository = {
			update: jest.fn().mockResolvedValue({affected: 1}),
		};
		const authorizationStateService = {
			consumeWithStatus: jest.fn().mockResolvedValue({status: 'already_consumed'}),
		};
		const service = new BankingService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			authorizationStateService as unknown as BankingAuthorizationStateService,
			{} as never,
		);

		await expect(service.handleCallback({state: 'already-consumed-state', code: 'replayed-code'})).resolves.toBe(
			'error',
		);

		expect(bankConnectionRepository.update).not.toHaveBeenCalled();
	});

	it('binds the pending connection to the created authorization state', async () => {
		const account = {id: 'account-id'};
		const connection = {id: 'connection-id'};
		const bankConnectionRepository = {
			create: jest.fn().mockReturnValue(connection),
			save: jest.fn().mockResolvedValue(connection),
			update: jest.fn().mockResolvedValue({affected: 1}),
		};
		const authorizationStateService = {
			create: jest.fn().mockResolvedValue('created-state'),
			setAuthorizationId: jest.fn().mockResolvedValue(undefined),
			delete: jest.fn().mockResolvedValue(undefined),
		};
		const service = new BankingService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			{} as never,
			{} as never,
			{findById: jest.fn().mockResolvedValue(account)} as never,
			{get: jest.fn().mockReturnValue('https://web.example.test')} as never,
			{} as never,
			{
				getAspsps: jest
					.fn()
					.mockResolvedValue([{name: 'ABN AMRO', country: 'NL', maximumConsentValiditySeconds: 600}]),
				startAuthorization: jest.fn().mockResolvedValue({
					url: 'https://auth.example.test',
					authorizationId: 'authorization-id',
				}),
			} as never,
			authorizationStateService as unknown as BankingAuthorizationStateService,
			{} as never,
		);

		await expect(
			service.startAuthorization('account-id', {aspspName: 'ABN AMRO', aspspCountry: 'NL'}),
		).resolves.toEqual({
			authorizationUrl: 'https://auth.example.test',
		});

		expect(bankConnectionRepository.update).toHaveBeenCalledWith(
			{id: connection.id, status: 'PENDING_AUTHORIZATION'},
			{authorizationStateHash: hashState('created-state')},
		);
	});

	it('transitions a matching pending connection when a consumed callback is cancelled', async () => {
		const state = {
			accountId: 'account-id',
			connectionId: 'connection-id',
			aspspName: 'ABN AMRO',
			aspspCountry: 'NL',
			expiresAt: Date.now() + 60_000,
		};
		const bankConnectionRepository = {
			findOne: jest.fn().mockResolvedValue({
				id: state.connectionId,
				status: 'PENDING_AUTHORIZATION',
			}),
			update: jest.fn().mockResolvedValue({affected: 1}),
		};
		const authorizationStateService = {
			consumeWithStatus: jest.fn().mockResolvedValue({status: 'consumed', state}),
		};
		const service = new BankingService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			authorizationStateService as unknown as BankingAuthorizationStateService,
			{} as never,
		);
		const callbackState = 'cancelled-state';

		await expect(service.handleCallback({state: callbackState, error: 'access_denied'})).resolves.toBe('cancelled');

		expect(bankConnectionRepository.findOne).toHaveBeenCalledWith({
			where: {
				id: state.connectionId,
				account: {id: state.accountId},
				status: 'PENDING_AUTHORIZATION',
				authorizationStateHash: hashState(callbackState),
			},
		});
		expect(bankConnectionRepository.update).toHaveBeenCalledWith(
			{
				id: state.connectionId,
				status: 'PENDING_AUTHORIZATION',
				authorizationStateHash: hashState(callbackState),
			},
			{status: 'CANCELLED', authorizationStateHash: null},
		);
	});

	it('does not change a completed connection when the same callback is replayed', async () => {
		const callbackState = 'replayed-state';
		const state = {
			accountId: 'account-id',
			connectionId: 'connection-id',
			aspspName: 'ABN AMRO',
			aspspCountry: 'NL',
			expiresAt: Date.now() + 60_000,
		};
		const connection = {
			id: state.connectionId,
			status: 'PENDING_AUTHORIZATION',
			authorizationStateHash: hashState(callbackState),
		};
		const bankConnectionRepository = {
			findOne: jest.fn((options: {where: {status: string; authorizationStateHash: string}}) =>
				Promise.resolve(
					options.where.status === connection.status &&
						options.where.authorizationStateHash === connection.authorizationStateHash
						? connection
						: null,
				),
			),
			update: jest.fn(
				(
					criteria: {status: string; authorizationStateHash: string},
					changes: {status: string; authorizationStateHash: null},
				) => {
					if (
						criteria.status !== connection.status ||
						criteria.authorizationStateHash !== connection.authorizationStateHash
					) {
						return Promise.resolve({affected: 0});
					}
					Object.assign(connection, changes);
					return Promise.resolve({affected: 1});
				},
			),
		};
		const authorizationStateService = {
			consumeWithStatus: jest.fn().mockResolvedValueOnce({status: 'consumed', state}).mockResolvedValue(null),
		};
		const service = new BankingService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			authorizationStateService as unknown as BankingAuthorizationStateService,
			{} as never,
		);

		await expect(service.handleCallback({state: callbackState, error: 'access_denied'})).resolves.toBe('cancelled');
		await expect(service.handleCallback({state: callbackState, error: 'access_denied'})).resolves.toBe('error');

		expect(connection).toMatchObject({status: 'CANCELLED', authorizationStateHash: null});
		expect(bankConnectionRepository.update).toHaveBeenCalledTimes(2);
	});

	it('does not expire a newer authorization state for the same connection', async () => {
		const expiredState = 'expired-state';
		const newerState = 'newer-state';
		const connection = {
			id: 'connection-id',
			status: 'PENDING_AUTHORIZATION',
			authorizationStateHash: hashState(newerState),
		};
		const bankConnectionRepository = {
			update: jest
				.fn()
				.mockImplementation((criteria: {status: string; authorizationStateHash: string}) =>
					Promise.resolve(
						criteria.status === connection.status &&
							criteria.authorizationStateHash === connection.authorizationStateHash
							? {affected: 1}
							: {affected: 0},
					),
				),
		};
		const authorizationStateService = {
			consumeWithStatus: jest.fn().mockResolvedValue(null),
		};
		const service = new BankingService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			authorizationStateService as unknown as BankingAuthorizationStateService,
			{} as never,
		);

		await expect(service.handleCallback({state: expiredState, code: 'late-provider-code'})).resolves.toBe('error');

		expect(connection).toMatchObject({
			status: 'PENDING_AUTHORIZATION',
			authorizationStateHash: hashState(newerState),
		});
		expect(bankConnectionRepository.update).toHaveBeenCalledWith(
			{authorizationStateHash: hashState(expiredState), status: 'PENDING_AUTHORIZATION'},
			{status: 'FAILED', authorizationStateHash: null},
		);
	});

	it('does not authorize a callback after the pending state is replaced during the callback race', async () => {
		const callbackState = 'racing-state';
		const state = {
			accountId: 'account-id',
			connectionId: 'connection-id',
			aspspName: 'ABN AMRO',
			aspspCountry: 'NL',
			expiresAt: Date.now() + 60_000,
		};
		const connection = {
			id: state.connectionId,
			status: 'PENDING_AUTHORIZATION',
			authorizationStateHash: hashState(callbackState),
		};
		const transactionConnectionRepository = {
			findOneBy: jest.fn().mockResolvedValue(connection),
			update: jest.fn().mockResolvedValue({affected: 0}),
		};
		const transactionExternalAccountRepository = {};
		const bankConnectionRepository = {
			findOne: jest.fn().mockResolvedValue(connection),
			update: jest.fn().mockResolvedValue({affected: 0}),
		};
		const dataSource = {
			transaction: jest.fn(async (callback: (manager: unknown) => Promise<void>) =>
				callback({
					getRepository: jest.fn((entity: unknown) =>
						entity === BankConnection
							? transactionConnectionRepository
							: transactionExternalAccountRepository,
					),
				}),
			),
		};
		const authorizationStateService = {
			consumeWithStatus: jest.fn().mockResolvedValue({status: 'consumed', state}),
		};
		const service = new BankingService(
			bankConnectionRepository as unknown as Repository<BankConnection>,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			dataSource as never,
			{
				createSession: jest.fn().mockResolvedValue({
					sessionId: 'provider-session',
					consentValidUntil: '2030-01-01T00:00:00.000Z',
					aspsp: {name: 'ABN AMRO', country: 'NL'},
					accounts: [],
				}),
			} as never,
			authorizationStateService as unknown as BankingAuthorizationStateService,
			{encrypt: jest.fn().mockReturnValue('encrypted-session')} as never,
		);

		await expect(service.handleCallback({state: callbackState, code: 'provider-code'})).resolves.toBe('error');

		expect(transactionConnectionRepository.update).toHaveBeenCalledWith(
			{id: state.connectionId, status: 'PENDING_AUTHORIZATION', authorizationStateHash: hashState(callbackState)},
			expect.objectContaining({status: 'AUTHORIZED', authorizationStateHash: null}),
		);
		expect(bankConnectionRepository.update).toHaveBeenCalledWith(
			{id: state.connectionId, status: 'PENDING_AUTHORIZATION', authorizationStateHash: hashState(callbackState)},
			{status: 'FAILED', authorizationStateHash: null},
		);
	});
});
