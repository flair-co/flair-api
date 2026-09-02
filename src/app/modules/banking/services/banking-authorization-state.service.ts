import {Inject, Injectable} from '@nestjs/common';
import Redis from 'ioredis';
import {randomBytes} from 'node:crypto';

import {REDIS} from '@core/redis/redis.constants';

import {BankingAuthorizationStateError} from '../errors/banking-authorization-state.error';

const STATE_TTL_SECONDS = 10 * 60;
const STATE_KEY_PREFIX = 'banking:authorization:';

export type BankingAuthorizationState = {
	accountId: string;
	connectionId: string;
	aspspName: string;
	aspspCountry: string;
	authorizationId?: string;
	expiresAt: number;
};

@Injectable()
export class BankingAuthorizationStateService {
	constructor(@Inject(REDIS) private readonly redis: Redis) {}

	async create(input: Omit<BankingAuthorizationState, 'expiresAt'>): Promise<string> {
		const state = randomBytes(32).toString('base64url');
		const value: BankingAuthorizationState = {
			...input,
			expiresAt: Date.now() + STATE_TTL_SECONDS * 1000,
		};

		const result = await this.runRedisOperation(() =>
			this.redis.set(this.getKey(state), JSON.stringify(value), 'EX', STATE_TTL_SECONDS, 'NX'),
		);
		if (result !== 'OK') throw new BankingAuthorizationStateError('write_failed');

		return state;
	}

	async setAuthorizationId(state: string, authorizationId: string): Promise<void> {
		const key = this.getKey(state);
		const currentValue = await this.runRedisOperation(() => this.redis.get(key));
		const ttl = await this.runRedisOperation(() => this.redis.ttl(key));

		if (!currentValue || ttl <= 0) {
			throw new BankingAuthorizationStateError('state_expired');
		}

		const parsedValue = this.parse(currentValue);
		if (!parsedValue) {
			throw new BankingAuthorizationStateError('state_invalid');
		}

		const result = await this.runRedisOperation(() =>
			this.redis.set(key, JSON.stringify({...parsedValue, authorizationId}), 'EX', Math.max(ttl, 1), 'XX'),
		);
		if (result !== 'OK') throw new BankingAuthorizationStateError('state_expired');
	}

	async consume(state: string | undefined): Promise<BankingAuthorizationState | null> {
		if (!state || state.length > 256) return null;

		const value = (await this.runRedisOperation(() => this.redis.call('GETDEL', this.getKey(state)))) as
			| string
			| null;
		if (!value) return null;

		const parsedValue = this.parse(value);
		if (!parsedValue || parsedValue.expiresAt <= Date.now()) return null;

		return parsedValue;
	}

	async delete(state: string): Promise<void> {
		await this.runRedisOperation(() => this.redis.del(this.getKey(state)));
	}

	private async runRedisOperation<T>(operation: () => Promise<T>): Promise<T> {
		try {
			return await operation();
		} catch {
			throw new BankingAuthorizationStateError('storage_unavailable');
		}
	}

	private parse(value: string): BankingAuthorizationState | null {
		try {
			const parsed = JSON.parse(value) as Partial<BankingAuthorizationState>;

			if (
				typeof parsed.accountId !== 'string' ||
				typeof parsed.connectionId !== 'string' ||
				typeof parsed.aspspName !== 'string' ||
				typeof parsed.aspspCountry !== 'string' ||
				typeof parsed.expiresAt !== 'number' ||
				(parsed.authorizationId !== undefined && typeof parsed.authorizationId !== 'string')
			) {
				return null;
			}

			return parsed as BankingAuthorizationState;
		} catch {
			return null;
		}
	}

	private getKey(state: string): string {
		return `${STATE_KEY_PREFIX}${state}`;
	}
}
