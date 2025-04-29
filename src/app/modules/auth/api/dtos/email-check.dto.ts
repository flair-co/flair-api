import {IsEmail, IsNotEmpty, Length} from 'class-validator';

import {User} from '@modules/user/user.entity';

export class EmailCheckDto {
  @IsNotEmpty()
  @IsEmail()
  @Length(1, 255)
  email: User['email'];
}
