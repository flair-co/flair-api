import Redis from 'ioredis';
import {DataSource, Repository} from 'typeorm';

import {BankConnection} from '../bank-connection.entity';
import {BankSyncRun} from '../bank-sync-run.entity';
import {ExternalAccountBalance} from '../external-account-balance.entity';
import {ExternalAccount} from '../external-account.entity';
import {ExternalTransaction} from '../external-transaction.entity';
import {BankingEncryptionService} from './banking-encryption.service';
import {BankingSyncService} from './banking-sync.service';
import {EnableBankingClient} from './enable-banking.client';

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
};

function deferred<T>(): Deferred<T> {
	let resolve!: Deferred<T>['resolve'];
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return {promise, resolve};
}

describe('BankingSyncService', () => {
	it('does not lock an unauthorized connection while ownership is being resolved', async () => {
		const connection = {
			id: 'connection-id',
			status: 'AUTHORIZED',
			providerSessionId: 'encrypted-session',
			consentValidUntil: new Date(Date.now() + 60_000),
		} as BankConnection;
		const run = {
			id: 'run-id',
			status: 'RUNNING',
			requestedFrom: null,
			requestedTo: '2026-09-03',
			accountsFetched: 0,
			balancesFetched: 0,
			transactionsFetched: 0,
			errorMessage: null,
		} as BankSyncRun;
		const completedRun = {...run, status: 'SUCCEEDED', finishedAt: new Date()};
		const unauthorizedLookupStarted = deferred<void>();
		const releaseUnauthorizedLookup = deferred<void>();
		const locks = new Map<string, string>();

		const redisMock = {
			set: jest.fn((key: string, token: string) => {
				if (locks.has(key)) return Promise.resolve(null);
				locks.set(key, token);
				return Promise.resolve('OK');
			}),
			eval: jest.fn((_script: string, _keyCount: number, key: string, token: string) => {
				if (locks.get(key) === token) locks.delete(key);
				return Promise.resolve(1);
			}),
		};
		const bankConnectionRepositoryMock = {
			findOne: jest.fn(),
			update: jest.fn().mockResolvedValue(undefined),
		};
		const externalAccountRepositoryMock = {
			find: jest.fn().mockResolvedValue([]),
		};
		const bankSyncRunRepositoryMock = {
			findOne: jest.fn().mockResolvedValue(null),
			create: jest.fn().mockReturnValue(run),
			save: jest.fn().mockResolvedValue(run),
			findOneBy: jest.fn().mockResolvedValue(completedRun),
			update: jest.fn().mockResolvedValue(undefined),
		};
		const externalTransactionRepositoryMock = {};
		const persistenceRepositories = {
			bankConnection: {update: jest.fn().mockResolvedValue(undefined)},
			bankSyncRun: {update: jest.fn().mockResolvedValue(undefined)},
			balance: {insert: jest.fn().mockResolvedValue(undefined)},
			externalTransaction: {upsert: jest.fn().mockResolvedValue(undefined)},
			externalAccount: {update: jest.fn().mockResolvedValue(undefined)},
		};
		const transactionManager = {
			getRepository: jest.fn((entity: unknown) => {
				if (entity === BankConnection) return persistenceRepositories.bankConnection;
				if (entity === BankSyncRun) return persistenceRepositories.bankSyncRun;
				if (entity === ExternalAccountBalance) return persistenceRepositories.balance;
				if (entity === ExternalTransaction) return persistenceRepositories.externalTransaction;
				return persistenceRepositories.externalAccount;
			}),
		};
		const dataSourceMock = {
			transaction: jest.fn(),
		};
		dataSourceMock.transaction.mockImplementation(
			async (callback: (manager: typeof transactionManager) => unknown) => callback(transactionManager),
		);
		const enableBankingClientMock = {};
		const encryptionServiceMock = {
			decrypt: jest.fn().mockReturnValue('provider-session'),
		};
		const service = new BankingSyncService(
			bankConnectionRepositoryMock as unknown as Repository<BankConnection>,
			externalAccountRepositoryMock as unknown as Repository<ExternalAccount>,
			bankSyncRunRepositoryMock as unknown as Repository<BankSyncRun>,
			externalTransactionRepositoryMock as unknown as Repository<ExternalTransaction>,
			redisMock as unknown as Redis,
			dataSourceMock as unknown as DataSource,
			enableBankingClientMock as unknown as EnableBankingClient,
			encryptionServiceMock as unknown as BankingEncryptionService,
		);

		bankConnectionRepositoryMock.findOne.mockImplementation(async (options: {where: {account: {id: string}}}) => {
			if (options.where.account.id === 'attacker-account-id') {
				unauthorizedLookupStarted.resolve();
				await releaseUnauthorizedLookup.promise;
				return null;
			}
			return connection;
		});

		const unauthorizedSync = service.synchronize('attacker-account-id', connection.id);
		await unauthorizedLookupStarted.promise;

		expect(redisMock.set).not.toHaveBeenCalled();

		await expect(service.synchronize('owner-account-id', connection.id)).resolves.toMatchObject({
			status: 'SUCCEEDED',
		});

		releaseUnauthorizedLookup.resolve();
		await expect(unauthorizedSync).rejects.toMatchObject({status: 404});
		expect(redisMock.set).toHaveBeenCalledTimes(1);
		expect(redisMock.eval).toHaveBeenCalledTimes(1);
		expect(locks.size).toBe(0);
	});
});
