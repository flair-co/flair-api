import {ConflictException, Injectable, UnauthorizedException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {Repository} from 'typeorm';

import {ChangePasswordDto} from '@modules/auth/api/dtos/change-password.dto';
import {User} from '@modules/user/user.entity';

import {AuthMethod} from './auth-method.entity';
import {AuthMethodType} from './constants/auth-method.enum';

@Injectable()
export class AuthMethodService {
  constructor(
    @InjectRepository(AuthMethod)
    private readonly authMethodRepository: Repository<AuthMethod>,
  ) {}

  async findByProvider(type: AuthMethodType, providerId: NonNullable<AuthMethod['providerId']>) {
    return this.authMethodRepository.findOne({where: {type, providerId}, relations: ['user']});
  }

  async findLocalMethodByUserId(userId: User['id']) {
    return await this.authMethodRepository.findOneBy({userId, type: AuthMethodType.LOCAL});
  }

  async createLocalMethod(userId: User['id'], password: string): Promise<AuthMethod> {
    const passwordHash = await argon2.hash(password);
    return await this.authMethodRepository.save({
      userId,
      type: AuthMethodType.LOCAL,
      providerId: null,
      password: passwordHash,
    });
  }

  async createOAuthMethod(
    userId: User['id'],
    providerId: NonNullable<AuthMethod['providerId']>,
    type: Exclude<AuthMethodType, AuthMethodType.LOCAL>,
  ): Promise<AuthMethod> {
    return await this.authMethodRepository.save({
      userId,
      type,
      providerId,
      password: null,
    });
  }

  async verifyLocalPassword(userId: User['id'], password: string) {
    const localMethod = await this.findLocalMethodByUserId(userId);

    if (!localMethod || !localMethod.password) {
      throw new UnauthorizedException('Local authentication method is not set up for this user.');
    }

    const isPasswordValid = await argon2.verify(localMethod.password, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return localMethod;
  }

  async changePassword(userId: User['id'], dto: ChangePasswordDto) {
    const localMethod = await this.verifyLocalPassword(userId, dto.currentPassword);
    localMethod.password = await argon2.hash(dto.newPassword);

    await this.authMethodRepository.save(localMethod);
    return {message: 'Password changed.'};
  }

  async setPassword(userId: User['id'], newPassword: NonNullable<AuthMethod['password']>) {
    const existingLocalMethod = await this.findLocalMethodByUserId(userId);
    if (existingLocalMethod) {
      throw new ConflictException('User already has a password set.');
    }

    await this.createLocalMethod(userId, newPassword);
    return {message: 'Password set.'};
  }
}
