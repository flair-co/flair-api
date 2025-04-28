import {IsEmail, IsNotEmpty, IsString, Length, MaxLength, MinLength} from 'class-validator';

import {AuthMethod} from '@modules/auth-method/auth-method.entity';
import {User} from '@modules/user/user.entity';

export class LogInDto {
  @IsNotEmpty()
  @IsEmail()
  @Length(1, 255)
  email: User['email'];

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: NonNullable<AuthMethod['password']>;
}
