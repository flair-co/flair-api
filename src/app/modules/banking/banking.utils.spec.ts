import {getBalancePreference} from './banking.utils';

describe('getBalancePreference', () => {
	it.each([
		['CLAV', 2],
		['FWAV', 2],
		['ITAV', 2],
		['OPAV', 2],
		['AVAILABLE', 2],
		['CLBD', 1],
		['ITBD', 1],
		['OPBD', 1],
		['PRCD', 1],
		['BOOKED', 1],
		['INFO', 0],
		['OTHR', 0],
		['XPCD', 0],
		['UNKNOWN', 0],
	])('maps balance type %s to preference %s', (balanceType, expectedPreference) => {
		expect(getBalancePreference(balanceType)).toBe(expectedPreference);
	});

	it('normalizes balance type codes before looking them up', () => {
		expect(getBalancePreference(' clav ')).toBe(2);
		expect(getBalancePreference('closing_available')).toBe(2);
		expect(getBalancePreference('Booked')).toBe(1);
	});

	it('returns the neutral preference for unknown balance types', () => {
		expect(getBalancePreference('NOT_AVAILABLE')).toBe(0);
		expect(getBalancePreference('__proto__')).toBe(0);
	});
});
