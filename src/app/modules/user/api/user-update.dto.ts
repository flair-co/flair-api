import {IsString, Length} from 'class-validator';

import {Account} from '../user.entity';

export class UserUpdateDto {
	@IsString()
	@Length(1, 255)
	username: Account['username'];
}
