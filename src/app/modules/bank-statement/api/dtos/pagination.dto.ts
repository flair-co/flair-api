import {Transform} from 'class-transformer';
import {IsInt, IsOptional, Min} from 'class-validator';

import {transformStrictDecimalInteger} from '@core/pagination/pagination.transform';

export class PaginationDto {
	@IsOptional()
	@Transform(transformStrictDecimalInteger)
	@IsInt()
	@Min(0)
	pageIndex: number = 0;

	@IsOptional()
	@Transform(transformStrictDecimalInteger)
	@IsInt()
	@Min(1)
	pageSize: number = 10;
}
