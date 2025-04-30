import {faker} from '@faker-js/faker';
import {Server} from 'net';
import request from 'supertest';

import {AuthMethodType} from '@modules/auth-method/constants/auth-method.enum';
import {PasswordSetDto} from '@modules/auth/api/dtos/password-set-dto';

import {
  GOOGLE_ONLY_USER_EMAIL,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from '../../setup/constants';
import {getApp} from '../../setup/e2e.setup';
import {createSession} from '../../utils/create-session.util';

describe('AuthController - Set password', () => {
  let httpServer: Server;

  beforeAll(() => {
    httpServer = getApp().getHttpServer();
  });

  describe('/auth/set-password (POST)', () => {
    it('should set password for a logged-in Google-only user and allow login with new password', async () => {
      const agent = await createSession(httpServer, GOOGLE_ONLY_USER_EMAIL);

      const newPassword = faker.internet.password({length: 12});
      const setPasswordDto: PasswordSetDto = {password: newPassword};

      await agent
        .post('/auth/set-password')
        .send(setPasswordDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Password set.');
        });

      await agent.post('/auth/logout').expect(200);

      const loginAgent = request.agent(httpServer);
      await loginAgent
        .post('/auth/login')
        .send({email: GOOGLE_ONLY_USER_EMAIL, password: newPassword})
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toEqual(GOOGLE_ONLY_USER_EMAIL);
        });

      await loginAgent
        .get('/users/me')
        .expect(200)
        .expect((res) => {
          expect(res.body.authMethods).toEqual(
            expect.arrayContaining([expect.objectContaining({type: AuthMethodType.LOCAL})]),
          );
        });
    });

    it('should fail with 409 Conflict if user already has a password set', async () => {
      const agent = request.agent(httpServer);
      await agent
        .post('/auth/login')
        .send({email: VERIFIED_USER_EMAIL, password: VERIFIED_USER_PASSWORD})
        .expect(200);

      const setPasswordDto: PasswordSetDto = {
        password: faker.internet.password({length: 12}),
      };

      await agent
        .post('/auth/set-password')
        .send(setPasswordDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toMatch(/User already has a password set/i);
        });
    });

    it('should fail with 401 Unauthorized if user is not logged in', async () => {
      const setPasswordDto: PasswordSetDto = {
        password: faker.internet.password({length: 12}),
      };

      await request(httpServer).post('/auth/set-password').send(setPasswordDto).expect(401);
    });

    it('should fail with 400 Bad Request if new password is too short', async () => {
      const agent = await createSession(httpServer, GOOGLE_ONLY_USER_EMAIL);
      const setPasswordDto: PasswordSetDto = {password: 'short'};

      await agent
        .post('/auth/set-password')
        .send(setPasswordDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/password must be longer than or equal to 8 characters/i),
            ]),
          );
        });
    });

    it('should fail with 400 Bad Request if new password is missing', async () => {
      const agent = await createSession(httpServer, GOOGLE_ONLY_USER_EMAIL);
      const setPasswordDto: Partial<PasswordSetDto> = {};

      await agent
        .post('/auth/set-password')
        .send(setPasswordDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/password should not be empty/i)]),
          );
        });
    });
  });
});
