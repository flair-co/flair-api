import {REDIS} from '@config/redis/redis.constants';
import {MailerService} from '@nestjs-modules/mailer';
import {BadRequestException, Injectable} from '@nestjs/common';
import {Inject} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import ms from 'ms';
import crypto from 'node:crypto';
import {RedisClientType} from 'redis';

import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

@Injectable()
export class EmailVerifierService {
  private readonly EXPIRATION: number;
  private readonly REDIS_KEY: string;
  private readonly WEB_BASE_URL: string;

  constructor(
    @Inject(REDIS) private readonly redisClient: RedisClientType,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    private readonly userService: UserService,
  ) {
    this.EXPIRATION = ms(this.configService.get('EMAIL_VERIFICATION_EXPIRATION') as string);
    this.REDIS_KEY = this.configService.get('EMAIL_VERIFICATION_REDIS_KEY') as string;
    this.WEB_BASE_URL = this.configService.get('WEB_BASE_URL') as string;
  }

  async verify(code: string) {
    const email = await this.getEmailByCode(code);
    if (!email) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const user = await this.userService.findByEmail(email).catch(() => {
      throw new BadRequestException('Invalid or expired verification code.');
    });

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified.');
    }

    const updatedUser = await this.userService.update(user.id, {isEmailVerified: true});
    await this.removeCode(code);

    return updatedUser;
  }

  async sendWelcomeEmail(user: User) {
    const code = await this.createCode(user.email);
    const verificationUrl = await this.createUrl(code);

    await this.mailerService.sendMail({
      to: user.email,
      subject: `Welcome to Flair - ${code} is your verification code`,
      template: './welcome',
      context: {name: user.name, verificationUrl, code},
    });
  }

  async resendEmail(user: User) {
    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified.');
    }

    const code = await this.createCode(user.email);
    const verificationUrl = await this.createUrl(code);

    await this.mailerService.sendMail({
      to: user.email,
      subject: `${code} is your verification code`,
      template: './verify-email',
      context: {name: user.name, verificationUrl, code},
    });
  }

  async createUrl(code: string) {
    const url = new URL('/verify', this.WEB_BASE_URL);
    url.search = new URLSearchParams({code}).toString();
    return url.toString();
  }

  async createCode(email: User['email']) {
    let code: string;
    let exists = true;

    while (exists) {
      code = crypto.randomInt(100000, 999999).toString();
      const existingEmail = await this.getEmailByCode(code);
      exists = existingEmail !== null;

      if (!exists) {
        const key = `${this.REDIS_KEY}:${code}`;
        await this.redisClient.set(key, email, {EX: this.EXPIRATION});
        return code;
      }
    }
    return code!;
  }

  async getEmailByCode(code: string) {
    const key = `${this.REDIS_KEY}:${code}`;
    return this.redisClient.get(key);
  }

  async removeCode(code: string) {
    const key = `${this.REDIS_KEY}:${code}`;
    await this.redisClient.del(key);
  }
}
