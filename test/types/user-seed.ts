import {AuthMethodType} from '@modules/auth-method/constants/auth-method.enum';

type AuthMethodBase = {
  type: AuthMethodType;
};

type AuthMethodLocal = AuthMethodBase & {
  type: AuthMethodType.LOCAL;
  password: string;
};

type AuthMethodGoogle = AuthMethodBase & {
  type: AuthMethodType.GOOGLE;
  providerId: string;
};

type AuthMethod = AuthMethodLocal | AuthMethodGoogle;

export type UserSeed = {
  name: string;
  email: string;
  isEmailVerified: boolean;
  authMethods: AuthMethod[];
};
