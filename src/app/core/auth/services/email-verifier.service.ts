import {REDIS} from '@config/redis/redis.constants';
import {MailerService} from '@nestjs-modules/mailer';
import {Injectable} from '@nestjs/common';
import {Inject} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import ms from 'ms';
import {RedisClientType} from 'redis';

import {User} from '@modules/user/user.entity';

@Injectable()
export class EmailVerifierService {
  private readonly EXPIRATION: number;
  private readonly REDIS_KEY: string;
  private readonly WEB_BASE_URL: string;

  constructor(
    @Inject(REDIS) private readonly redisClient: RedisClientType,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {
    this.EXPIRATION = ms(this.configService.get('EMAIL_VERIFICATION_EXPIRATION') as string);
    this.REDIS_KEY = this.configService.get('EMAIL_VERIFICATION_REDIS_KEY') as string;
    this.WEB_BASE_URL = this.configService.get('WEB_BASE_URL') as string;
  }

  async sendVerificationEmail(user: User, token: string) {
    const {name, email} = user;
    const verificationUrl = this.createUrl(token, email);

    await this.mailerService.sendMail({
      to: email,
      subject: 'Verify your email',
      template: './verify-email',
      context: {name, verificationUrl},
    });
  }

  async createUrl(token: string, email: User['email']) {
    const url = new URL('/verify', this.WEB_BASE_URL);
    url.search = new URLSearchParams({token, email}).toString();
    return url.toString();
  }

  async createToken(email: User['email']) {
    const key = `${this.REDIS_KEY}:${email}`;
    const token = crypto.randomUUID();
    await this.redisClient.set(key, token, {EX: this.EXPIRATION});
    return token;
  }

  async isTokenValid(email: User['email'], token: string) {
    const key = `${this.REDIS_KEY}:${email}`;
    const storedToken = await this.redisClient.get(key);
    return storedToken === token;
  }

  async removeToken(email: User['email']) {
    const key = `${this.REDIS_KEY}:${email}`;
    await this.redisClient.del(key);
  }
}
