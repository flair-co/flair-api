import {Transform} from 'class-transformer';
import {IsIn, IsInt, Min} from 'class-validator';

import {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS} from '@core/pagination/pagination.constants';
import {transformStrictDecimalInteger} from '@core/pagination/pagination.transform';

export {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS};

export class TransactionQueryPaginationDto {
	@Transform(transformStrictDecimalInteger)
	@IsInt()
	@Min(0)
	pageIndex: number;

	@Transform(transformStrictDecimalInteger)
	@IsInt()
	@IsIn(PAGE_SIZE_OPTIONS)
	pageSize: number;
}
