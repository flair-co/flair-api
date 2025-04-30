import {IsNotEmpty, IsString, Length} from 'class-validator';

import {AuthMethod} from '@modules/auth-method/auth-method.entity';

export class PasswordSetDto {
  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  password: NonNullable<AuthMethod['password']>;
}
