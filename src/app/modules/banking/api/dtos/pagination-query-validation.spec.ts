import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import 'reflect-metadata';

import {BankConnectionTransactionsQueryDto} from './bank-connection-transactions-query.dto';
import {BankTransactionPaginationQueryDto} from './bank-transaction-query.dto';

async function validateQuery<T extends object>(type: new () => T, query: Record<string, string>) {
	return validate(plainToInstance(type, query));
}

describe('BankConnectionTransactionsQueryDto', () => {
	it.each([
		['the minimum limit', '1'],
		['the maximum limit', '100'],
	])('accepts %s', async (_case, limit) => {
		const errors = await validateQuery(BankConnectionTransactionsQueryDto, {limit});

		expect(errors).toHaveLength(0);
	});

	it.each([
		['a suffix', '10oops'],
		['scientific notation', '1e2'],
		['leading whitespace', ' 10'],
		['trailing whitespace', '10 '],
		['a plus sign', '+10'],
		['a negative sign', '-1'],
		['zero', '0'],
		['a value above the maximum', '101'],
	])('rejects %s', async (_case, limit) => {
		const errors = await validateQuery(BankConnectionTransactionsQueryDto, {limit});

		expect(errors).not.toHaveLength(0);
	});

	it('accepts an omitted limit and applies the default', async () => {
		const dto = plainToInstance(BankConnectionTransactionsQueryDto, {});

		expect(dto.limit).toBe(25);
		expect(await validate(dto)).toHaveLength(0);
	});
});

describe('BankTransactionPaginationQueryDto', () => {
	it.each([
		['page index zero', {pageIndex: '0'}],
		['a positive page index', {pageIndex: '1'}],
		['the minimum page size', {pageSize: '10'}],
		['the maximum page size', {pageSize: '50'}],
	])('accepts %s', async (_case, query) => {
		const errors = await validateQuery(BankTransactionPaginationQueryDto, query);

		expect(errors).toHaveLength(0);
	});

	it.each([
		['a suffix in the page index', {pageIndex: '1oops'}],
		['scientific notation in the page size', {pageSize: '1e1'}],
		['whitespace in the page index', {pageIndex: ' 1'}],
		['a plus sign in the page size', {pageSize: '+10'}],
		['a negative page index', {pageIndex: '-1'}],
		['zero page size', {pageSize: '0'}],
		['a page size above the allowed range', {pageSize: '51'}],
	])('rejects %s', async (_case, query) => {
		const errors = await validateQuery(BankTransactionPaginationQueryDto, query);

		expect(errors).not.toHaveLength(0);
	});
});
