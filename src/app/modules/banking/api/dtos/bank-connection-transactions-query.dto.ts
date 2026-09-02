import {Transform} from 'class-transformer';
import {IsInt, IsOptional, Max, Min} from 'class-validator';

export const DEFAULT_BANK_CONNECTION_TRANSACTION_LIMIT = 25;
export const MAX_BANK_CONNECTION_TRANSACTION_LIMIT = 100;

export class BankConnectionTransactionsQueryDto {
	@IsOptional()
	@Transform(({value}) => (value === undefined ? undefined : parseInt(value, 10)))
	@IsInt()
	@Min(1)
	@Max(MAX_BANK_CONNECTION_TRANSACTION_LIMIT)
	limit: number = DEFAULT_BANK_CONNECTION_TRANSACTION_LIMIT;
}
