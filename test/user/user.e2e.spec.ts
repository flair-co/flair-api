import request from 'supertest';

import {User} from '@modules/user/user.entity';

import {
  UNVERIFIED_USER_EMAIL,
  UNVERIFIED_USER_PASSWORD,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from '../setup/constants';
import {getApp} from '../setup/e2e.setup';

describe('UserController - /me', () => {
  let httpServer: any;

  beforeAll(async () => {
    httpServer = getApp().getHttpServer();
  });

  describe('/users/me (GET)', () => {
    it('should return the current VERIFIED authenticated user', async () => {
      const agent = request.agent(httpServer);

      await agent
        .post('/auth/login')
        .send({
          email: VERIFIED_USER_EMAIL,
          password: VERIFIED_USER_PASSWORD,
        })
        .expect(200);

      const response = await agent.get('/users/me').expect(200);

      const user: User = response.body;
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toEqual(VERIFIED_USER_EMAIL);
      expect(user.name).toEqual('Verified User');
      expect(user.isEmailVerified).toBe(true);
      expect(user.createdAt).toBeDefined();
      expect(user.password).toBeUndefined();
      expect(user.bankAccounts).toBeUndefined();
    });

    it('should return the current UNVERIFIED authenticated user', async () => {
      const agent = request.agent(httpServer);

      await agent
        .post('/auth/login')
        .send({
          email: UNVERIFIED_USER_EMAIL,
          password: UNVERIFIED_USER_PASSWORD,
        })
        .expect(200);

      const response = await agent.get('/users/me').expect(200);

      const user: User = response.body;
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toEqual(UNVERIFIED_USER_EMAIL);
      expect(user.name).toEqual('Unverified User');
      expect(user.isEmailVerified).toBe(false);
      expect(user.createdAt).toBeDefined();
      expect(user.password).toBeUndefined();
      expect(user.bankAccounts).toBeUndefined();
    });

    it('should return 401 Unauthorized if the user is not authenticated', async () => {
      await request(httpServer).get('/users/me').expect(401);
    });
  });
});
