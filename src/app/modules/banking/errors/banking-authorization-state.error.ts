export type BankingAuthorizationStateErrorCode =
	'storage_unavailable' | 'write_failed' | 'state_expired' | 'state_invalid';

export class BankingAuthorizationStateError extends Error {
	constructor(public readonly code: BankingAuthorizationStateErrorCode) {
		super(code);
		this.name = 'BankingAuthorizationStateError';
	}
}
