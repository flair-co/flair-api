import {IsNotEmpty, IsString, Length} from 'class-validator';

import {AuthMethod} from '@modules/auth-method/auth-method.entity';

export class SetPasswordDto {
  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  newPassword: NonNullable<AuthMethod['password']>;
}
