import {Transform} from 'class-transformer';
import {IsInt, IsOptional, Min} from 'class-validator';

import {DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE} from '@core/pagination/pagination.constants';
import {transformStrictDecimalInteger} from '@core/pagination/pagination.transform';

export class PaginationDto {
	@IsOptional()
	@Transform(transformStrictDecimalInteger)
	@IsInt()
	@Min(0)
	pageIndex: number = DEFAULT_PAGE_INDEX;

	@IsOptional()
	@Transform(transformStrictDecimalInteger)
	@IsInt()
	@Min(1)
	pageSize: number = DEFAULT_PAGE_SIZE;
}
