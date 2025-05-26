import {BadRequestException, ConflictException, Injectable} from '@nestjs/common';
import {Inject} from '@nestjs/common';
import Redis from 'ioredis';
import ms from 'ms';

import {ConfigurationService} from '@core/config/config.service';
import {EmailService} from '@core/email/email.service';
import {REDIS} from '@core/redis/redis.constants';
import {Account} from '@modules/account/account.entity';
import {AccountService} from '@modules/account/account.service';

import {
	EMAIL_ALREADY_IN_USE,
	EMAIL_ALREADY_VERIFIED,
	EMAIL_CHANGE_SUCCESS,
	EMAIL_INVALID_TOKEN,
	EMAIL_VERIFICATION_SENT,
} from '../api/constants/api-messages.constants';

@Injectable()
export class EmailVerifierService {
	private readonly EXPIRATION;
	private readonly REDIS_KEY;
	private readonly WEB_BASE_URL;

	constructor(
		@Inject(REDIS) private readonly redisClient: Redis,
		private readonly configService: ConfigurationService,
		private readonly emailService: EmailService,
		private readonly accountService: AccountService,
	) {
		this.EXPIRATION = this.configService.get('EMAIL_VERIFICATION_EXPIRATION');
		this.REDIS_KEY = this.configService.get('EMAIL_VERIFICATION_REDIS_KEY');
		this.WEB_BASE_URL = this.configService.get('WEB_BASE_URL');
	}

	async checkEmailAvailability(email: Account['email']) {
		const existingAccount = await this.accountService.findByEmail(email);
		if (existingAccount) {
			throw new ConflictException(EMAIL_ALREADY_IN_USE);
		}
	}

	async verify(code: string, email: Account['email']) {
		const account = await this._validateCode(code, email);

		if (account.isEmailVerified) {
			throw new BadRequestException(EMAIL_ALREADY_VERIFIED);
		}

		const updatedAccount = await this.accountService.update(account.id, {isEmailVerified: true});
		await this._removeCode(code);
		return updatedAccount;
	}

	async sendWelcomeEmail(account: Account) {
		const {email, name, isEmailVerified} = account;

		if (isEmailVerified) {
			throw new BadRequestException(EMAIL_ALREADY_VERIFIED);
		}

		const code = await this._createCode(email);
		const verificationUrl = await this._createUrl(code, email);
		const expiration = ms(ms(this.EXPIRATION), {long: true});

		await this.emailService.send({
			to: email,
			subject: 'Welcome to Flair - Please confirm your email',
			template: 'welcome',
			context: {name, verificationUrl, code, expiration},
		});

		return {message: EMAIL_VERIFICATION_SENT};
	}

	async requestEmailChange(account: Account, newEmail: Account['email']) {
		await this.accountService.validateEmailIsUnique(newEmail);

		const code = await this._createCode(newEmail);
		const verificationUrl = await this._createUrl(code, newEmail);
		const expiration = ms(ms(this.EXPIRATION), {long: true});

		await this.emailService.send({
			to: newEmail,
			subject: 'Verify your new email with Flair',
			template: 'verify-new-email',
			context: {name: account.name, verificationUrl, expiration},
		});
		return {message: EMAIL_VERIFICATION_SENT};
	}

	async verifyEmailChange(code: string, newEmail: Account['email']) {
		const account = await this._validateCode(code, newEmail);

		await this.accountService.validateEmailIsUnique(newEmail);
		await this.accountService.update(account.id, {email: newEmail});

		await this._removeCode(code);
		return {message: EMAIL_CHANGE_SUCCESS};
	}

	private async _createUrl(code: string, email: Account['email']) {
		const url = new URL('/verify-email', this.WEB_BASE_URL);
		url.search = new URLSearchParams({email, code}).toString();
		return url.toString();
	}

	private async _createCode(email: Account['email']) {
		while (true) {
			const code = Array.from({length: 6}, () => Math.floor(Math.random() * 10)).join('');
			const key = `${this.REDIS_KEY}:${code}`;

			try {
				await this._getEmailByCode(code);
			} catch {
				const expirationSeconds = Math.floor(ms(this.EXPIRATION) / 1000);
				await this.redisClient.set(key, email, 'EX', expirationSeconds);
				return code;
			}
		}
	}

	private async _validateCode(code: string, email: Account['email']) {
		const expectedEmail = await this._getEmailByCode(code);
		if (expectedEmail !== email) {
			throw new BadRequestException(EMAIL_INVALID_TOKEN);
		}

		const account = await this.accountService.findByEmail(email);
		if (!account) {
			throw new BadRequestException(EMAIL_INVALID_TOKEN);
		}
		return account;
	}

	private async _getEmailByCode(code: string) {
		const key = `${this.REDIS_KEY}:${code}`;
		const email = await this.redisClient.get(key);

		if (!email) {
			throw new BadRequestException(EMAIL_INVALID_TOKEN);
		}
		return email;
	}

	private async _removeCode(code: string) {
		const key = `${this.REDIS_KEY}:${code}`;
		await this.redisClient.del(key);
	}
}
