import {EnableBankingBalance} from './enable-banking.types';
import {BankingSyncService} from './services/banking-sync.service';

const selectPreferredBalance = (balances: EnableBankingBalance[]) => {
	const service = Object.create(BankingSyncService.prototype) as BankingSyncService;
	return (
		service as unknown as {
			selectPreferredBalance: (items: EnableBankingBalance[]) => EnableBankingBalance | undefined;
		}
	).selectPreferredBalance(balances);
};

describe('BankingSyncService preferred balance selection', () => {
	it('prefers an available closing balance over a booked closing balance', () => {
		const available: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '120.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
		};
		const booked: EnableBankingBalance = {
			balanceType: 'CLBD',
			amount: '100.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
		};

		expect(selectPreferredBalance([booked, available])).toBe(available);
		expect(selectPreferredBalance([available, booked])).toBe(available);
	});

	it('uses the latest change when duplicate balance types share a reference date', () => {
		const earlier: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '100.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
			lastChangeDateTime: '2026-08-26T10:00:00Z',
		};
		const later: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '120.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
			lastChangeDateTime: '2026-08-26T12:00:00Z',
		};

		expect(selectPreferredBalance([earlier, later])).toBe(later);
		expect(selectPreferredBalance([later, earlier])).toBe(later);
	});

	it('uses a stable field tie-breaker when duplicate balances have the same dates', () => {
		const first: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '100.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
			lastChangeDateTime: '2026-08-26T12:00:00Z',
			lastCommittedTransaction: 'transaction-1',
		};
		const second: EnableBankingBalance = {
			balanceType: 'CLAV',
			amount: '100.00',
			currency: 'EUR',
			referenceDate: '2026-08-26',
			lastChangeDateTime: '2026-08-26T12:00:00Z',
			lastCommittedTransaction: 'transaction-2',
		};

		expect(selectPreferredBalance([first, second])).toBe(second);
		expect(selectPreferredBalance([second, first])).toBe(second);
	});
});
