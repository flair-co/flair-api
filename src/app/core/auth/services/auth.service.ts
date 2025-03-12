import {MailerService} from '@nestjs-modules/mailer';
import {BadRequestException, Injectable} from '@nestjs/common';

import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {SignUpDto} from '../api/signup.dto';
import {EmailVerifierService} from './email-verifier.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly emailVerifierService: EmailVerifierService,
    private readonly userService: UserService,
    private readonly mailerService: MailerService,
  ) {}

  async registerUser(dto: SignUpDto) {
    const user = await this.userService.save(dto);
    const {email, name} = user;

    const token = await this.emailVerifierService.createToken(email);
    const verificationUrl = await this.emailVerifierService.createUrl(token, email);

    await this.mailerService.sendMail({
      to: email,
      subject: 'Welcome to Flair',
      template: './welcome',
      context: {name, verificationUrl},
    });

    return user;
  }

  async sendVerificationEmail(user: User) {
    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified.');
    }

    const token = await this.emailVerifierService.createToken(user.email);
    const verificationUrl = await this.emailVerifierService.createUrl(token, user.email);

    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Verify your email',
      template: './verify-email',
      context: {name: user.name, verificationUrl},
    });
  }

  async verifyEmail(email: User['email'], token: string) {
    const isValid = await this.emailVerifierService.isTokenValid(email, token);
    if (!isValid) {
      throw new BadRequestException('Invalid or expired verification token.');
    }

    const user = await this.userService.findByEmail(email).catch(() => {
      throw new BadRequestException('Invalid or expired verification token.');
    });

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified.');
    }

    await this.userService.update(user.id, {isEmailVerified: true});
    await this.emailVerifierService.removeToken(user.email);
  }
}
