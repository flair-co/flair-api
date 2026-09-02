import {Transform} from 'class-transformer';
import {IsIn, IsInt, Min} from 'class-validator';

import {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS} from '@core/pagination/pagination.constants';

export {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS};

export class TransactionQueryPaginationDto {
	@Transform(({value}) => parseInt(value, 10))
	@IsInt()
	@Min(0)
	pageIndex: number;

	@Transform(({value}) => parseInt(value, 10))
	@IsInt()
	@IsIn(PAGE_SIZE_OPTIONS)
	pageSize: number;
}
