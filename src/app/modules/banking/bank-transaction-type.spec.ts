import {BANK_TRANSACTION_TYPES, normalizeBankTransactionType} from './bank-transaction-type';

describe('normalizeBankTransactionType', () => {
	it.each([
		[
			'card classifications',
			{code: 'PMNT', subCode: 'CARD', description: 'Card payment'},
			BANK_TRANSACTION_TYPES.CARD_PAYMENT,
		],
		[
			'transfer classifications',
			{code: 'PMNT', subCode: 'TRANSFER', description: 'SEPA transfer'},
			BANK_TRANSACTION_TYPES.TRANSFER,
		],
		['direct debit classifications', {description: 'Direct debit'}, BANK_TRANSACTION_TYPES.DIRECT_DEBIT],
		[
			'cash withdrawal classifications',
			{description: 'ATM cash withdrawal'},
			BANK_TRANSACTION_TYPES.CASH_WITHDRAWAL,
		],
		['fee classifications', {description: 'Bank fee'}, BANK_TRANSACTION_TYPES.FEE],
		['interest classifications', {description: 'Interest payment'}, BANK_TRANSACTION_TYPES.INTEREST],
		['salary classifications', {description: 'Salary payment'}, BANK_TRANSACTION_TYPES.SALARY],
		['refund classifications', {description: 'Refund'}, BANK_TRANSACTION_TYPES.REFUND],
	])('%s', (_label, classification, expected) => {
		expect(normalizeBankTransactionType(classification)).toBe(expected);
	});

	it('uses OTHER when the provider classification is absent or unknown', () => {
		expect(normalizeBankTransactionType({})).toBe(BANK_TRANSACTION_TYPES.OTHER);
		expect(normalizeBankTransactionType({code: 'ZZZZ', subCode: 'UNKNOWN', description: 'Something else'})).toBe(
			BANK_TRANSACTION_TYPES.OTHER,
		);
	});
});
