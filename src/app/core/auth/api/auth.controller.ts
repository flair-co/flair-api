import {Body, Controller, HttpCode, Post, Req, UseGuards} from '@nestjs/common';
import {ApiResponse} from '@nestjs/swagger';
import {Throttle, minutes} from '@nestjs/throttler';
import {Request} from 'express';
import {User} from 'src/app/modules/user/user.entity';

import {UserService} from '@modules/user/user.service';

import {CurrentUser} from '../decorators/current-user.decorator';
import {Public} from '../decorators/public.decorator';
import {SkipEmailVerification} from '../decorators/skip-email-verification.decorator';
import {LocalLogInGuard} from '../guards/local-login.guard';
import {EmailVerifierService} from '../services/email-verifier.service';
import {EmailVerifyDto} from './email-verify.dto';
import {LogInDto} from './login.dto';
import {SignUpDto} from './signup.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly emailVerifierService: EmailVerifierService,
  ) {}

  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @Public()
  @UseGuards(LocalLogInGuard)
  @Post('login')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User logged in.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'Invalid credentials.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async logIn(@Body() _dto: LogInDto, @CurrentUser() user: User) {
    return user;
  }

  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @Post('logout')
  @SkipEmailVerification()
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User logged out.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async logOut(@Req() request: Request) {
    await new Promise<void>((resolve) => {
      request.logOut({keepSessionInfo: false}, () => {
        resolve();
      });
      request.session.destroy(() => {
        resolve();
      });
    });
  }

  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @Public()
  @Post('signup')
  @SkipEmailVerification()
  @HttpCode(201)
  @ApiResponse({status: 201, description: 'User created.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 409, description: 'A user with this email already exists.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async signUp(@Body() dto: SignUpDto, @Req() request: Request) {
    const user = await this.userService.save(dto);
    await this.emailVerifierService.sendWelcomeEmail(user);

    await new Promise<void>((resolve) => {
      request.logIn(user, () => {
        resolve();
      });
    });
    return user;
  }

  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @Post('resend')
  @SkipEmailVerification()
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'Verification email sent.'})
  @ApiResponse({status: 400, description: 'Email is already verified.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async resendVerificationEmail(@CurrentUser() user: User) {
    await this.emailVerifierService.resendEmail(user);
  }

  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @Public()
  @Post('verify')
  @SkipEmailVerification()
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'Email verified.'})
  @ApiResponse({status: 400, description: 'Invalid or expired verification code.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async verifyEmail(@Body() dto: EmailVerifyDto, @Req() request: Request) {
    const user = await this.emailVerifierService.verify(dto.code);

    if (!request.isAuthenticated()) {
      await new Promise<void>((resolve) => {
        request.logIn(user, () => {
          resolve();
        });
      });
    }
    return user;
  }
}
