import {IsNotEmpty, IsString, Length} from 'class-validator';

import {AuthMethod} from '@modules/auth-method/auth-method.entity';

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  currentPassword: NonNullable<AuthMethod['password']>;

  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  newPassword: NonNullable<AuthMethod['password']>;
}
