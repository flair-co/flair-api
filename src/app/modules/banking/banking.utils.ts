export function getBalancePreference(balanceType: string): number {
	const normalizedType = balanceType.toLowerCase();
	if (normalizedType.includes('available')) return 2;
	if (normalizedType.includes('booked')) return 1;
	return 0;
}

export function truncate(value: string | null | undefined, length: number): string | null {
	return value ? value.slice(0, length) : null;
}
