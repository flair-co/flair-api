import {Body, Controller, Get, Patch} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

import {CurrentUser} from '@modules/auth/decorators/current-user.decorator';
import {SkipEmailVerification} from '@modules/auth/decorators/skip-email-verification.decorator';

import {Account} from '../user.entity';
import {UserService} from '../user.service';
import {UserUpdateDto} from './user-update.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Get('me')
	@SkipEmailVerification()
	findOne(@CurrentUser() user: Account) {
		return this.userService.findById(user.id);
	}

	@Patch('me')
	update(@Body() dto: UserUpdateDto, @CurrentUser() user: Account) {
		return this.userService.update(user.id, {username: dto.username});
	}
}
