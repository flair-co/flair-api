import Redis from 'ioredis';

import {BankingAuthorizationStateService} from './banking-authorization-state.service';

describe('BankingAuthorizationStateService', () => {
	let redis: {
		set: jest.Mock;
		get: jest.Mock;
		ttl: jest.Mock;
		call: jest.Mock;
		del: jest.Mock;
	};
	let service: BankingAuthorizationStateService;

	beforeEach(() => {
		redis = {
			set: jest.fn(),
			get: jest.fn(),
			ttl: jest.fn(),
			call: jest.fn(),
			del: jest.fn(),
		};
		service = new BankingAuthorizationStateService(redis as unknown as Redis);
	});

	it('creates an opaque state with the configured TTL', async () => {
		redis.set.mockResolvedValue('OK');

		const state = await service.create({
			accountId: 'account-id',
			connectionId: 'connection-id',
			aspspName: 'ABN AMRO',
			aspspCountry: 'NL',
		});

		expect(state).toEqual(expect.any(String));
		expect(state.length).toBeGreaterThan(30);
		expect(redis.set).toHaveBeenCalledWith(
			expect.stringContaining('banking:authorization:'),
			expect.any(String),
			'EX',
			600,
			'NX',
		);

		const serializedState = redis.set.mock.calls[0][1] as string;
		expect(JSON.parse(serializedState)).toEqual(
			expect.objectContaining({
				accountId: 'account-id',
				connectionId: 'connection-id',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
			}),
		);
	});

	it('converts Redis failures into a typed storage error', async () => {
		redis.set.mockRejectedValue(new Error('Redis is unavailable'));

		await expect(
			service.create({
				accountId: 'account-id',
				connectionId: 'connection-id',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
			}),
		).rejects.toMatchObject({
			code: 'storage_unavailable',
		});
	});

	it('reports a failed state write when Redis does not acknowledge it', async () => {
		redis.set.mockResolvedValue(null);

		await expect(
			service.create({
				accountId: 'account-id',
				connectionId: 'connection-id',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
			}),
		).rejects.toMatchObject({
			code: 'write_failed',
		});
	});

	it('consumes a valid state only once', async () => {
		redis.call.mockResolvedValue(
			JSON.stringify({
				accountId: 'account-id',
				connectionId: 'connection-id',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
				expiresAt: Date.now() + 60_000,
			}),
		);

		await expect(service.consume('state-value')).resolves.toEqual(
			expect.objectContaining({accountId: 'account-id', connectionId: 'connection-id'}),
		);
		expect(redis.call).toHaveBeenCalledWith('GETDEL', 'banking:authorization:state-value');
	});

	it('treats missing or malformed state as an invalid callback without throwing', async () => {
		redis.call.mockResolvedValueOnce(null).mockResolvedValueOnce('{not-json');

		await expect(service.consume('missing-state')).resolves.toBeNull();
		await expect(service.consume('malformed-state')).resolves.toBeNull();
	});

	it('converts callback-state Redis failures into a typed storage error', async () => {
		redis.call.mockRejectedValue(new Error('Redis is unavailable'));

		await expect(service.consume('state-value')).rejects.toMatchObject({
			code: 'storage_unavailable',
		});
	});

	it('updates the authorization id while retaining the remaining TTL', async () => {
		redis.get.mockResolvedValue(
			JSON.stringify({
				accountId: 'account-id',
				connectionId: 'connection-id',
				aspspName: 'ABN AMRO',
				aspspCountry: 'NL',
				expiresAt: Date.now() + 60_000,
			}),
		);
		redis.ttl.mockResolvedValue(500);
		redis.set.mockResolvedValue('OK');

		await service.setAuthorizationId('state-value', 'authorization-id');

		expect(redis.set).toHaveBeenCalledWith(
			'banking:authorization:state-value',
			expect.stringContaining('authorization-id'),
			'EX',
			500,
			'XX',
		);
	});
});
