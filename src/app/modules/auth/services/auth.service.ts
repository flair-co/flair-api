import {Injectable} from '@nestjs/common';
import argon2 from 'argon2';
import {plainToInstance} from 'class-transformer';
import {Request} from 'express';

import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';

import {ChangePasswordDto} from '../api/dtos/change-password.dto';
import {SignUpDto} from '../api/dtos/signup.dto';
import {EmailVerifierService} from './email-verifier.service';
import {SessionService} from './session.service';

@Injectable()
export class AuthService {
	constructor(
		private readonly emailVerifierService: EmailVerifierService,
		private readonly accountService: AccountService,
		private readonly sessionService: SessionService,
	) {}

	async signUp({fullName, email, password}: SignUpDto, request: Request) {
		await this.accountService.validateEmailIsUnique(email);

		const hash = await argon2.hash(password);
		const user = await this.accountService.save(fullName, email, hash);

		await this.emailVerifierService.sendWelcomeEmail(user);
		await this.logIn(user, request);
		return plainToInstance(Account, user);
	}

	async logOut(request: Request) {
		await new Promise<void>((resolve) => {
			request.logOut({keepSessionInfo: false}, () => {
				resolve();
			});
			request.session.destroy(() => {
				resolve();
			});
		});
		return {message: 'User logged out.'};
	}

	async logIn(user: Account, request: Request) {
		await new Promise<void>((resolve) => {
			request.logIn(user, () => {
				resolve();
			});
		});
		await this.sessionService.initializeSessionMetadata(request);
		return {message: 'User logged in.'};
	}

	async changePassword(user: Account, dto: ChangePasswordDto) {
		await this.accountService.verifyPassword(user.password, dto.currentPassword);

		const hash = await argon2.hash(dto.newPassword);
		await this.accountService.update(user.id, {password: hash});
		return {message: 'Password changed.'};
	}
}
