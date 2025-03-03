import {Expose} from 'class-transformer';
import {IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Length, MaxLength} from 'class-validator';

import {Bank} from '@core/transaction-mapper/constants/bank.enum';
import {currencyCodes} from '@core/transaction-mapper/constants/currency-codes';

import {Account} from '../account.entity';

export class AccountCreateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  alias: Account['alias'];

  @IsEnum(Bank)
  bank: Account['bank'];

  @IsNotEmpty()
  @IsString()
  @Length(3, 3)
  @IsIn(currencyCodes)
  @Expose()
  currency: Account['currency'];
}
