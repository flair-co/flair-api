import {MailerService as NestJSMailer} from '@nestjs-modules/mailer';
import {Injectable} from '@nestjs/common';

@Injectable()
export class MailerService {
  constructor(private readonly mailer: NestJSMailer) {}

  async sendWelcomeEmail(to: string, name: string) {
    await this.mailer.sendMail({
      to,
      subject: 'Welcome to Flair',
      template: './welcome',
      context: {name, verificationLink: 'https://example.com/'},
    });
  }
}
