import {Body, Controller, HttpCode, Post, Req, UseGuards} from '@nestjs/common';
import {ApiResponse} from '@nestjs/swagger';
import {Throttle, minutes} from '@nestjs/throttler';
import {Request} from 'express';
import {User} from 'src/app/modules/user/user.entity';

import {CurrentUser} from '../decorators/current-user.decorator';
import {Public} from '../decorators/public.decorator';
import {LocalLogInGuard} from '../guards/local-login.guard';
import {AuthService} from '../services/auth.service';
import {EmailVerifyDto} from './email-verify.dto';
import {LogInDto} from './login.dto';
import {SignUpDto} from './signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @Public()
  @UseGuards(LocalLogInGuard)
  @Post('login')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User has been successfully logged in.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 401, description: 'Invalid credentials.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async logIn(@Body() _dto: LogInDto, @CurrentUser() user: User) {
    return user;
  }

  @Throttle({default: {limit: 6, ttl: minutes(1)}})
  @Post('logout')
  @HttpCode(200)
  @ApiResponse({status: 200, description: 'User has been successfully logged out.'})
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
  @ApiResponse({status: 201, description: 'The user has been successfully created.'})
  @ApiResponse({status: 400, description: 'Validation of the request body failed.'})
  @ApiResponse({status: 409, description: 'A user with this email already exists.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async signUp(@Body() dto: SignUpDto, @Req() request: Request) {
    const user = await this.authService.registerUser(dto);

    await new Promise<void>((resolve) => {
      request.logIn(user, () => {
        resolve();
      });
    });
    return user;
  }

  @Throttle({default: {limit: 3, ttl: minutes(1)}})
  @Post('send-verification-email')
  @ApiResponse({status: 200, description: 'Verification email sent successfully.'})
  @ApiResponse({status: 400, description: 'Email is already verified.'})
  @ApiResponse({status: 401, description: 'User is not logged in.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async sendVerificationEmail(@CurrentUser() user: User): Promise<void> {
    await this.authService.sendVerificationEmail(user);
  }

  @Throttle({default: {limit: 3, ttl: minutes(1)}})
  @Public()
  @Post('verify-email')
  @ApiResponse({status: 200, description: 'Email has been successfully verified.'})
  @ApiResponse({status: 400, description: 'Invalid or expired verification token.'})
  @ApiResponse({status: 429, description: 'Too many requests. Try again later.'})
  async verifyEmail(@Body() dto: EmailVerifyDto) {
    return this.authService.verifyEmail(dto.email, dto.token);
  }
}
