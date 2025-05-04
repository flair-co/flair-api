import {IsString, Length} from 'class-validator';

import {Account} from '../user.entity';

export class AccountUpdateDto {
	@IsString()
	@Length(1, 255)
	fullName: Account['fullName'];
}
