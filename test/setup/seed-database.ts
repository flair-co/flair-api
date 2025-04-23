import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {Repository} from 'typeorm';

import {User} from '@modules/user/user.entity';

import {
  PW_CHANGE_USER_EMAIL,
  PW_CHANGE_USER_PASSWORD,
  UNVERIFIED_USER_EMAIL,
  UNVERIFIED_USER_PASSWORD,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from './constants';

export async function seedDatabase(app: INestApplication) {
  const userRepository = app.get<Repository<User>>(getRepositoryToken(User));

  const verifiedPasswordHash = await argon2.hash(VERIFIED_USER_PASSWORD);
  const unverifiedPasswordHash = await argon2.hash(UNVERIFIED_USER_PASSWORD);
  const pwChangePasswordHash = await argon2.hash(PW_CHANGE_USER_PASSWORD);

  const verifiedUser = await userRepository.save({
    name: 'Verified User',
    email: VERIFIED_USER_EMAIL,
    password: verifiedPasswordHash,
  });
  await userRepository.update({id: verifiedUser.id}, {isEmailVerified: true});

  await userRepository.save({
    name: 'Unverified User',
    email: UNVERIFIED_USER_EMAIL,
    password: unverifiedPasswordHash,
  });

  const pwChangeUser = await userRepository.save({
    name: 'Password Change User',
    email: PW_CHANGE_USER_EMAIL,
    password: pwChangePasswordHash,
  });
  await userRepository.update({id: pwChangeUser.id}, {isEmailVerified: true});
}
