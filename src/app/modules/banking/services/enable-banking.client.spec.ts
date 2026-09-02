import {ConfigurationService} from '@core/config/config.service';

import {EnableBankingClient} from './enable-banking.client';

describe('EnableBankingClient account data', () => {
	let client: EnableBankingClient;
	let fetchMock: jest.SpyInstance;

	beforeEach(() => {
		const values: Record<string, string> = {
			ENABLE_BANKING_API_URL: 'https://api.example.test',
			ENABLE_BANKING_APPLICATION_ID: 'application-id',
			ENABLE_BANKING_PRIVATE_KEY_B64: Buffer.from('test-key').toString('base64'),
		};
		const config = {
			get: (key: string) => values[key],
		} as unknown as ConfigurationService;
		client = new EnableBankingClient(config);
		jest.spyOn(client as unknown as {createJwt: () => string}, 'createJwt').mockReturnValue('test.jwt');
		fetchMock = jest.spyOn(globalThis, 'fetch');
	});

	afterEach(() => {
		fetchMock.mockRestore();
	});

	it('maps account balances without retaining the provider response', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					balances: [
						{
							name: 'Available',
							balance_type: 'AVAILABLE',
							balance_amount: {currency: 'eur', amount: '12.34'},
							last_change_date_time: '2026-08-26T12:00:00Z',
							reference_date: '2026-08-26',
						},
					],
				}),
				{status: 200, headers: {'content-type': 'application/json'}},
			),
		);

		await expect(client.getAccountBalances('account-id')).resolves.toEqual([
			{
				name: 'Available',
				balanceType: 'AVAILABLE',
				amount: '12.34',
				currency: 'EUR',
				lastChangeDateTime: '2026-08-26T12:00:00Z',
				referenceDate: '2026-08-26',
				lastCommittedTransaction: undefined,
			},
		]);
	});

	it('follows continuation keys while mapping transaction pages', async () => {
		fetchMock
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						transactions: [
							{
								transaction_id: 'transaction-1',
								entry_reference: 'entry-1',
								transaction_amount: {currency: 'EUR', amount: '2.50'},
								credit_debit_indicator: 'DBIT',
								status: 'BOOK',
								transaction_date: '2026-08-24',
								booking_date: '2026-08-26',
								creditor: {name: 'Shop'},
								bank_transaction_code: {
									code: 'PMNT',
									sub_code: 'CARD',
									description: 'Card payment',
								},
								balance_after_transaction: {currency: 'EUR', amount: '100.50'},
								exchange_rate: {
									unit_currency: 'USD',
									exchange_rate: '0.9234',
									rate_type: 'SPOT',
									instructed_amount: {currency: 'USD', amount: '2.71'},
								},
								reference_number: 'reference-1',
								reference_number_schema: 'RF',
								remittance_information: ['Groceries'],
							},
						],
						continuation_key: 'next-page',
					}),
					{status: 200, headers: {'content-type': 'application/json'}},
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						transactions: [
							{
								transaction_id: 'transaction-2',
								transaction_amount: {currency: 'EUR', amount: '5.00'},
								credit_debit_indicator: 'CRDT',
								status: 'BOOK',
								value_date: '2026-08-25',
								debtor: {name: 'Employer'},
							},
						],
					}),
					{status: 200, headers: {'content-type': 'application/json'}},
				),
			);

		const transactions = await client.getAccountTransactions('account-id', {strategy: 'longest'});

		expect(transactions).toEqual([
			expect.objectContaining({
				providerTransactionId: 'transaction-1',
				entryReference: 'entry-1',
				currency: 'EUR',
				counterpartyName: 'Shop',
				remittanceInformation: 'Groceries',
				transactionDate: '2026-08-24',
				bankTransactionCode: 'PMNT',
				bankTransactionSubCode: 'CARD',
				bankTransactionDescription: 'Card payment',
				balanceAfterAmount: '100.50',
				balanceAfterCurrency: 'EUR',
				instructedAmount: '2.71',
				instructedCurrency: 'USD',
				exchangeRate: '0.9234',
				exchangeRateUnitCurrency: 'USD',
				exchangeRateType: 'SPOT',
				referenceNumber: 'reference-1',
				referenceNumberScheme: 'RF',
			}),
			expect.objectContaining({
				providerTransactionId: 'transaction-2',
				currency: 'EUR',
				counterpartyName: 'Employer',
			}),
		]);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
		expect(firstUrl.pathname).toBe('/accounts/account-id/transactions');
		expect(firstUrl.searchParams.get('strategy')).toBe('longest');
		expect(firstUrl.searchParams.has('continuation_key')).toBe(false);

		const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));
		expect(secondUrl.searchParams.get('continuation_key')).toBe('next-page');
	});

	it('ignores malformed optional transaction metadata while retaining the transaction', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					transactions: [
						{
							transaction_amount: {currency: 'EUR', amount: '4.00'},
							transaction_date: 123,
							balance_after_transaction: {currency: 'EUR', amount: 'not-a-number'},
							exchange_rate: {
								unit_currency: 'US D',
								exchange_rate: 'invalid',
								instructed_amount: {currency: 'USDD', amount: '1.00'},
							},
							reference_number: 123,
						},
					],
				}),
				{status: 200, headers: {'content-type': 'application/json'}},
			),
		);

		await expect(client.getAccountTransactions('account-id', {strategy: 'default'})).resolves.toEqual([
			expect.objectContaining({
				amount: '4.00',
				transactionDate: undefined,
				balanceAfterAmount: undefined,
				balanceAfterCurrency: undefined,
				instructedAmount: undefined,
				instructedCurrency: undefined,
				exchangeRate: undefined,
				exchangeRateUnitCurrency: undefined,
				referenceNumber: undefined,
			}),
		]);
	});
});
