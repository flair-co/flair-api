import {GenerativeModel} from '@google/generative-ai';
import {Injectable} from '@nestjs/common';
import crypto from 'node:crypto';

import {TransactionPartial} from '@modules/transaction/transaction-mapper/services/transaction-mapper.interface';
import {Transaction} from '@modules/transaction/transaction.entity';

import {Category} from '../constants/category.enum';

const BATCH_SIZE = 100;

type CategorizedTransactionPartial = TransactionPartial & {category: Transaction['category']};
type TransactionToCategorize = TransactionPartial & {correlationId: string};

@Injectable()
export class TransactionCategorizerService {
	private static readonly validCategories = new Set<string>(Object.values(Category));

	constructor(private readonly model: GenerativeModel) {}

	async categorize(transactions: TransactionPartial[]) {
		if (transactions.length === 0) return [];

		const categorizedTransactions: CategorizedTransactionPartial[] = [];
		const transactionsWithId: TransactionToCategorize[] = transactions.map((transaction) => ({
			...transaction,
			correlationId: crypto.randomUUID(),
		}));

		for (let i = 0; i < transactionsWithId.length; i += BATCH_SIZE) {
			const batch = transactionsWithId.slice(i, i + BATCH_SIZE);
			try {
				const processedBatch = await this._processBatch(batch);
				categorizedTransactions.push(...processedBatch);
			} catch (error) {
				const failedBatch = batch.map((transaction) => {
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const {correlationId, ...rest} = transaction;
					return {...rest, category: Category.OTHER};
				});
				categorizedTransactions.push(...failedBatch);
			}
		}

		return categorizedTransactions;
	}

	private async _processBatch(batch: TransactionToCategorize[]) {
		const fieldsToInclude: (keyof TransactionToCategorize)[] = [
			'correlationId',
			'description',
			'amount',
			'currency',
		];
		const serializedTransactions = JSON.stringify(batch, fieldsToInclude);
		const result = await this.model.generateContent(serializedTransactions);
		const categorizedBatch: {correlationId: string; category: string}[] = JSON.parse(result.response.text());

		const categories = new Map(categorizedBatch.map((item) => [item.correlationId, item.category]));

		return batch.map(({correlationId, ...rest}) => {
			const rawCategory = categories.get(correlationId);
			const isValidCategory = rawCategory && TransactionCategorizerService.validCategories.has(rawCategory);

			const category = isValidCategory ? (rawCategory as Category) : Category.OTHER;
			return {...rest, category};
		});
	}
}
