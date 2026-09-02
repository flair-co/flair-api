export const BANK_TRANSACTION_TYPES = {
	CARD_PAYMENT: 'CARD_PAYMENT',
	TRANSFER: 'TRANSFER',
	DIRECT_DEBIT: 'DIRECT_DEBIT',
	CASH_WITHDRAWAL: 'CASH_WITHDRAWAL',
	FEE: 'FEE',
	INTEREST: 'INTEREST',
	SALARY: 'SALARY',
	REFUND: 'REFUND',
	OTHER: 'OTHER',
} as const;

export type BankTransactionType = (typeof BANK_TRANSACTION_TYPES)[keyof typeof BANK_TRANSACTION_TYPES];

type BankTransactionClassification = {
	code?: string;
	subCode?: string;
	description?: string;
};

export function normalizeBankTransactionType({
	code,
	subCode,
	description,
}: BankTransactionClassification): BankTransactionType {
	const classification = [code, subCode, description]
		.filter((value): value is string => Boolean(value))
		.join(' ')
		.toLowerCase();

	if (/(direct\s*debit|incasso|machtiging)/.test(classification)) {
		return BANK_TRANSACTION_TYPES.DIRECT_DEBIT;
	}
	if (/(cash|atm|geldopname|cash\s*withdrawal|withdrawal)/.test(classification)) {
		return BANK_TRANSACTION_TYPES.CASH_WITHDRAWAL;
	}
	if (/(fee|charge|commission|kosten|provisie)/.test(classification)) {
		return BANK_TRANSACTION_TYPES.FEE;
	}
	if (/(interest|rente)/.test(classification)) {
		return BANK_TRANSACTION_TYPES.INTEREST;
	}
	if (/(salary|payroll|wage|salaris|loon)/.test(classification)) {
		return BANK_TRANSACTION_TYPES.SALARY;
	}
	if (/(refund|reimburse|terugbetaling|reversal)/.test(classification)) {
		return BANK_TRANSACTION_TYPES.REFUND;
	}
	if (/(card|kaart|pos|purchase|merchant)/.test(classification)) {
		return BANK_TRANSACTION_TYPES.CARD_PAYMENT;
	}
	if (/(transfer|overboeking|overschrijving|wire|sepa)/.test(classification)) {
		return BANK_TRANSACTION_TYPES.TRANSFER;
	}

	return BANK_TRANSACTION_TYPES.OTHER;
}
