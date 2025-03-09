import {IsEmail, IsNotEmpty, IsUUID, Length} from 'class-validator';

import {User} from '@modules/user/user.entity';

export class EmailVerifyDto {
  @IsNotEmpty()
  @IsEmail()
  @Length(1, 255)
  email: User['email'];

  @IsUUID(4)
  @IsNotEmpty()
  token: string;
}
