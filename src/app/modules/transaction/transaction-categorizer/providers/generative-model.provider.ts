import {
	FunctionDeclarationSchemaType,
	GenerationConfig,
	GenerativeModel,
	GoogleGenerativeAI,
} from '@google/generative-ai';
import {Provider} from '@nestjs/common';

import {ConfigurationService} from '@core/config/config.service';

import {Category} from '../constants/category.enum';

export const GenerativeModelProvider: Provider = {
	provide: GenerativeModel,
	inject: [ConfigurationService],
	useFactory: async (configService: ConfigurationService) => {
		const apiKey = configService.get('GEMINI_API_KEY');

		return new GoogleGenerativeAI(apiKey).getGenerativeModel({
			model: 'gemini-1.5-flash',
			systemInstruction,
			generationConfig,
		});
	},
};

const systemInstruction =
	`For each transaction in the provided array, categorize it based on the description, amount ` +
	`and currency. Return only the 'category' field, and ensure that the categories are returned ` +
	`in the same order as the transactions provided. Use only the following categories: ` +
	`${Object.values(Category)}. If present, use merchant names hidden within the description to ` +
	`determine the category. Descriptions may be in different languages; consider translations ` +
	`and common patterns. If a category cannot be determined, provide your best guess, and avoid ` +
	`returning 'OTHER' unless absolutely necessary.`;

const generationConfig: GenerationConfig = {
	responseMimeType: 'application/json',
	responseSchema: {
		type: FunctionDeclarationSchemaType.ARRAY,
		description: 'Array of transaction categories',
		items: {
			type: FunctionDeclarationSchemaType.STRING,
			description: 'Transaction category',
			properties: {},
		},
	},
};
