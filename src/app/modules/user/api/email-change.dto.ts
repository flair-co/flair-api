import {IsEmail, IsNotEmpty, Length} from 'class-validator';

import {User} from '../user.entity';

export class ChangeEmailRequestDto {
  @IsNotEmpty()
  @IsEmail()
  @Length(1, 255)
  newEmail: User['email'];
}
