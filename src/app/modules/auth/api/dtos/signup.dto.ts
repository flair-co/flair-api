import {IsEmail, IsNotEmpty, IsString, Length} from 'class-validator';

import {Account} from '@modules/user/user.entity';

export class SignUpDto {
	@IsNotEmpty()
	@IsString()
	@Length(1, 255)
	username: Account['username'];

	@IsNotEmpty()
	@IsEmail()
	@Length(1, 255)
	email: Account['email'];

	@IsNotEmpty()
	@IsString()
	@Length(8, 255)
	password: Account['password'];
}
