import {INestApplication} from '@nestjs/common';
import {getRepositoryToken} from '@nestjs/typeorm';
import argon2 from 'argon2';
import {UserSeed} from 'test/types/user-seed';
import {Repository} from 'typeorm';

import {AuthMethod} from '@modules/auth-method/auth-method.entity';
import {AuthMethodType} from '@modules/auth-method/constants/auth-method.enum';
import {User} from '@modules/user/user.entity';

import {
  GOOGLE_AND_LOCAL_USER_EMAIL,
  GOOGLE_AND_LOCAL_USER_PASSWORD,
  GOOGLE_AND_LOCAL_USER_PROVIDER_ID,
  GOOGLE_ONLY_USER_EMAIL,
  GOOGLE_ONLY_USER_PROVIDER_ID,
  PW_CHANGE_USER_EMAIL,
  PW_CHANGE_USER_PASSWORD,
  UNVERIFIED_USER_EMAIL,
  UNVERIFIED_USER_PASSWORD,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from './constants';

export async function seedDatabase(app: INestApplication) {
  const userRepository = app.get<Repository<User>>(getRepositoryToken(User));
  const authMethodRepository = app.get<Repository<AuthMethod>>(getRepositoryToken(AuthMethod));

  const usersToSeed: UserSeed[] = [
    {
      name: 'Verified user',
      email: VERIFIED_USER_EMAIL,
      isEmailVerified: true,
      authMethods: [{type: AuthMethodType.LOCAL, password: VERIFIED_USER_PASSWORD}],
    },
    {
      name: 'Unverified user',
      email: UNVERIFIED_USER_EMAIL,
      isEmailVerified: false,
      authMethods: [{type: AuthMethodType.LOCAL, password: UNVERIFIED_USER_PASSWORD}],
    },
    {
      name: 'Password change user',
      email: PW_CHANGE_USER_EMAIL,
      isEmailVerified: true,
      authMethods: [{type: AuthMethodType.LOCAL, password: PW_CHANGE_USER_PASSWORD}],
    },
    {
      name: 'Google only user',
      email: GOOGLE_ONLY_USER_EMAIL,
      isEmailVerified: true,
      authMethods: [{type: AuthMethodType.GOOGLE, providerId: GOOGLE_ONLY_USER_PROVIDER_ID}],
    },
    {
      name: 'Google and local User',
      email: GOOGLE_AND_LOCAL_USER_EMAIL,
      isEmailVerified: true,
      authMethods: [
        {type: AuthMethodType.GOOGLE, providerId: GOOGLE_AND_LOCAL_USER_PROVIDER_ID},
        {type: AuthMethodType.LOCAL, password: GOOGLE_AND_LOCAL_USER_PASSWORD},
      ],
    },
  ];

  for (const user of usersToSeed) {
    const userEntity = userRepository.create({
      name: user.name,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
    });
    const savedUser = await userRepository.save(userEntity);

    for (const method of user.authMethods) {
      let authMethodEntity: Partial<AuthMethod>;

      switch (method.type) {
        case AuthMethodType.LOCAL:
          const hashedPassword = await argon2.hash(method.password);
          authMethodEntity = {
            userId: savedUser.id,
            type: AuthMethodType.LOCAL,
            password: hashedPassword,
            providerId: null,
          };
          break;

        case AuthMethodType.GOOGLE:
          authMethodEntity = {
            userId: savedUser.id,
            type: AuthMethodType.GOOGLE,
            providerId: method.providerId,
            password: null,
          };
          break;
      }
      await authMethodRepository.save(authMethodEntity);
    }
  }
}
