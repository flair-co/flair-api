import {Transform, TransformFnParams, Type} from 'class-transformer';
import {
	IsArray,
	IsDateString,
	IsEnum,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';

const transformOptionalNumber = ({value}: TransformFnParams) => (value === undefined ? undefined : Number(value));

export const DEFAULT_BANK_TRANSACTION_PAGE_INDEX = 0;
export const DEFAULT_BANK_TRANSACTION_PAGE_SIZE = 10;
export const BANK_TRANSACTION_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];
export const MAX_BANK_TRANSACTION_PAGE_SIZE = 50;

export enum BankTransactionSortField {
	BOOKING_DATE = 'bookingDate',
	AMOUNT = 'amount',
}

export enum BankTransactionSortOrder {
	ASC = 'ASC',
	DESC = 'DESC',
}

export class BankTransactionPaginationQueryDto {
	@IsOptional()
	@Transform(transformOptionalNumber)
	@IsInt()
	@Min(0)
	pageIndex: number = DEFAULT_BANK_TRANSACTION_PAGE_INDEX;

	@IsOptional()
	@Transform(transformOptionalNumber)
	@IsInt()
	@Min(1)
	@IsIn(BANK_TRANSACTION_PAGE_SIZE_OPTIONS)
	@Max(MAX_BANK_TRANSACTION_PAGE_SIZE)
	pageSize: number = DEFAULT_BANK_TRANSACTION_PAGE_SIZE;
}

export class BankTransactionSortQueryDto {
	@IsEnum(BankTransactionSortField)
	by: BankTransactionSortField;

	@IsEnum(BankTransactionSortOrder)
	order: BankTransactionSortOrder;
}

export class BankTransactionBookingDateFilterDto {
	@IsOptional()
	@IsDateString({strict: true})
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	from?: string;

	@IsOptional()
	@IsDateString({strict: true})
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	to?: string;
}

export class BankTransactionFilterQueryDto {
	@IsOptional()
	@ValidateNested()
	@Type(() => BankTransactionBookingDateFilterDto)
	bookingDate?: BankTransactionBookingDateFilterDto;

	@IsOptional()
	@IsArray()
	@IsUUID('4', {each: true})
	externalAccountIds?: string[];

	@IsOptional()
	@IsString()
	@MaxLength(100)
	search?: string;
}

export class BankTransactionQueryDto {
	@IsOptional()
	@ValidateNested()
	@Type(() => BankTransactionPaginationQueryDto)
	pagination?: BankTransactionPaginationQueryDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => BankTransactionSortQueryDto)
	sort?: BankTransactionSortQueryDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => BankTransactionFilterQueryDto)
	filter?: BankTransactionFilterQueryDto;
}
