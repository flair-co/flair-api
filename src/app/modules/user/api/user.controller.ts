import {Body, Controller, Get, Patch} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {CurrentUser} from '@modules/auth/decorators/current-user.decorator';
import {SkipEmailVerification} from '@modules/auth/decorators/skip-email-verification.decorator';

import {Account} from '../account.entity';
import {UserService} from '../user.service';
import {AccountUpdateDto} from './user-update.dto';

type IdealUserContext = {
	account: {accountId: Account['id']}; // just {id: Account['id']} -> no reason to store all the account info
};

@ApiTags('Users')
@Controller('users')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Get('me')
	@SkipEmailVerification()
	findOne(@CurrentUser() user: Account) {
		return this.userService.findById(user.id);
	}

	// Type of the user parameter should become User
	@Patch('me')
	update(@Body() {fullName}: AccountUpdateDto, @CurrentUser() user: Account) {
		// Users should not have an ID, this const is a replacement for something like user.account.id
		// TODO: A user class should be implemented
		const idealUserContext: IdealUserContext = {account: {accountId: user.id}}; // this will be temporary until a solution is implemented
		const {accountId} = idealUserContext.account; // this will become user.account once implemented
		return this.userService.update(accountId, {fullName});
	}
}
