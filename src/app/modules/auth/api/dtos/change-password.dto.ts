import {IsNotEmpty, IsString, Length} from 'class-validator';

import {Account} from '@modules/user/user.entity';

export class ChangePasswordDto {
	@IsNotEmpty()
	@IsString()
	@Length(8, 255)
	currentPassword: Account['password'];

	@IsNotEmpty()
	@IsString()
	@Length(8, 255)
	newPassword: Account['password'];
}
