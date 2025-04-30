import {Server} from 'net';
import request from 'supertest';

import {AuthMethodType} from '@modules/auth-method/constants/auth-method.enum';
import {User} from '@modules/user/user.entity';

import {
  GOOGLE_AND_LOCAL_USER_EMAIL,
  GOOGLE_AND_LOCAL_USER_PASSWORD,
  GOOGLE_ONLY_USER_EMAIL,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from '../../setup/constants';
import {getApp} from '../../setup/e2e.setup';
import {createSession} from '../../utils/create-session.util';

describe('AuthController - Disconnect OAuth Method', () => {
  let httpServer: Server;

  beforeAll(async () => {
    httpServer = getApp().getHttpServer();
  });

  describe('/auth/methods/:methodType (DELETE)', () => {
    it('should disconnect Google for a user who also has a password', async () => {
      const agent = request.agent(httpServer);
      await agent
        .post('/auth/login')
        .send({
          email: GOOGLE_AND_LOCAL_USER_EMAIL,
          password: GOOGLE_AND_LOCAL_USER_PASSWORD,
        })
        .expect(200);

      await agent
        .get('/users/me')
        .expect(200)
        .expect((res) => {
          const user = res.body as User;
          expect(user.authMethods).toEqual(
            expect.arrayContaining([
              expect.objectContaining({type: AuthMethodType.LOCAL}),
              expect.objectContaining({type: AuthMethodType.GOOGLE}),
            ]),
          );
          expect(user.authMethods.length).toBe(2);
        });

      await agent
        .delete(`/auth/methods/${AuthMethodType.GOOGLE}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toMatch(/google connection successfully removed/i);
        });

      await agent
        .get('/users/me')
        .expect(200)
        .expect((res) => {
          const user = res.body as User;
          expect(user.authMethods).toEqual(
            expect.arrayContaining([expect.objectContaining({type: AuthMethodType.LOCAL})]),
          );
          expect(user.authMethods).not.toEqual(
            expect.arrayContaining([expect.objectContaining({type: AuthMethodType.GOOGLE})]),
          );
          expect(user.authMethods.length).toBe(1);
        });
    });

    it('should fail with 409 Conflict when trying to disconnect the only sign-in method (Google)', async () => {
      const agent = await createSession(httpServer, GOOGLE_ONLY_USER_EMAIL);

      await agent
        .get('/users/me')
        .expect(200)
        .expect((res) => {
          const user = res.body as User;
          expect(user.authMethods).toEqual(
            expect.arrayContaining([expect.objectContaining({type: AuthMethodType.GOOGLE})]),
          );
          expect(user.authMethods.length).toBe(1);
        });

      await agent
        .delete(`/auth/methods/${AuthMethodType.GOOGLE}`)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toMatch(/Cannot disconnect the only sign-in method/i);
        });
    });

    it('should fail with 404 Not Found when trying to disconnect Google for a user without Google connection', async () => {
      const agent = request.agent(httpServer);
      await agent
        .post('/auth/login')
        .send({email: VERIFIED_USER_EMAIL, password: VERIFIED_USER_PASSWORD})
        .expect(200);

      await agent
        .get('/users/me')
        .expect(200)
        .expect((res) => {
          const user = res.body as User;
          expect(user.authMethods).toEqual(
            expect.arrayContaining([expect.objectContaining({type: AuthMethodType.LOCAL})]),
          );
          expect(user.authMethods.length).toBe(1);
        });

      await agent
        .delete(`/auth/methods/${AuthMethodType.GOOGLE}`)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toMatch(/google connection not found for this user/i);
        });
    });

    it('should fail with 401 Unauthorized if user is not logged in', async () => {
      await request(httpServer).delete(`/auth/methods/${AuthMethodType.GOOGLE}`).expect(401);
    });

    it('should fail with 400 Bad Request when trying to disconnect the LOCAL method type', async () => {
      const agent = request.agent(httpServer);
      await agent
        .post('/auth/login')
        .send({email: GOOGLE_AND_LOCAL_USER_EMAIL, password: GOOGLE_AND_LOCAL_USER_PASSWORD})
        .expect(200);

      await agent
        .delete(`/auth/methods/${AuthMethodType.LOCAL}`)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Local method is not a valid OAuth method type/i);
        });
    });

    it('should fail with 400 Bad Request for an invalid method type string in URL', async () => {
      const agent = await createSession(httpServer, GOOGLE_AND_LOCAL_USER_EMAIL);

      await agent
        .delete(`/auth/methods/facebook`)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid method type specified./i);
        });
    });
  });
});
