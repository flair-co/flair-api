import {INestApplication} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import session from 'express-session';
import {Server} from 'net';
import passport from 'passport';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import {Repository} from 'typeorm';

import {AuthMethod} from '@modules/auth-method/auth-method.entity';
import {AuthMethodType} from '@modules/auth-method/constants/auth-method.enum';
import {GoogleStrategy} from '@modules/auth/strategies/google.strategy';
import {UserService} from '@modules/user/user.service';

import {AppModule} from '../../../src/app.module';
import {getApp} from '../../setup/e2e.setup';
import {seedDatabase} from '../../setup/seed-database';
import {GoogleProfileArgs, createMockGoogleProfile, mockTokens} from '../../utils/google-auth.util';

describe('AuthController - Google OAuth', () => {
  describe('/auth/google (GET)', () => {
    let app: INestApplication;
    beforeAll(() => {
      app = getApp();
    });

    it('should 302-redirect to Google OAuth endpoint', async () => {
      const res = await request(app.getHttpServer()).get('/auth/google').expect(302);

      expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com/);
    });
  });

  describe('/auth/google/callback (GET)', () => {
    let mockApp: INestApplication;
    let httpServer: Server;
    let agent: TestAgent;
    let userService: UserService;
    let authMethodRepo: Repository<AuthMethod>;
    let currentProfile = createMockGoogleProfile({
      id: 'google123456789',
      email: 'verified@test.com',
      name: 'Test User',
      givenName: 'Test',
      familyName: 'User',
    });

    const setProfile = (p: GoogleProfileArgs) => {
      currentProfile = createMockGoogleProfile(p);
    };

    /**
     * We mock the GoogleStrategy because we have to bypass real calls to Google's endpoints.
     * This lets us simulate various user profiles (linking, login, signup).
     */
    beforeAll(async () => {
      class MockGoogleStrategy extends GoogleStrategy {
        authenticate(_req: any) {
          this.validate(
            mockTokens.accessToken,
            mockTokens.refreshToken,
            currentProfile,
            (err, user) =>
              err || !user ? this.error(err || new Error('User not found')) : this.success(user),
          );
        }
      }

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(GoogleStrategy)
        .useClass(MockGoogleStrategy)
        .compile();

      mockApp = moduleFixture.createNestApplication();
      userService = moduleFixture.get(UserService);
      authMethodRepo = moduleFixture.get<Repository<AuthMethod>>(getRepositoryToken(AuthMethod));

      mockApp.use(session({secret: 'test', resave: false, saveUninitialized: false}));
      mockApp.use(passport.initialize());
      mockApp.use(passport.session());

      await mockApp.init();
      httpServer = mockApp.getHttpServer();
      agent = request.agent(httpServer);

      await seedDatabase(mockApp);
    });

    afterAll(() => mockApp.close());

    it('links Google to existing local user', async () => {
      setProfile({
        id: 'google123456789',
        email: 'verified@test.com',
        name: 'Test User',
        givenName: 'Test',
        familyName: 'User',
      });
      const user = await userService.findByEmail('verified@test.com')!;
      expect(user).toBeDefined();

      await agent.get('/auth/google/callback').query({code: 'mock', state: 'mock'}).expect(302);

      const me = await agent.get('/users/me').expect(200);
      expect(me.body.email).toEqual('verified@test.com');

      const methods = await authMethodRepo.find({
        where: {userId: user!.id, type: AuthMethodType.GOOGLE},
      });
      expect(methods.length).toBe(1);
    });

    it('logs in existing Google user', async () => {
      setProfile({
        id: '109876543210987654321',
        email: 'google@test.com',
        name: 'Google Only',
        givenName: 'Google',
        familyName: 'User',
      });
      const fresh = request.agent(httpServer);
      await fresh.get('/auth/google/callback').query({code: 'x', state: 'y'}).expect(302);
      await fresh
        .get('/users/me')
        .expect(200)
        .expect((r) => expect(r.body.email).toEqual('google@test.com'));
    });

    it('creates new account on first-time Google login', async () => {
      setProfile({
        id: 'new-id',
        email: 'new@example.com',
        name: 'New',
        givenName: 'New',
        familyName: 'User',
      });
      const fresh = request.agent(httpServer);
      await fresh.get('/auth/google/callback').query({code: 'x', state: 'y'}).expect(302);
      await fresh
        .get('/users/me')
        .expect(200)
        .expect((r) => expect(r.body.email).toEqual('new@example.com'));
    });

    it('returns 401 when profile has no email', async () => {
      setProfile({id: 'no-email', email: '', name: 'No', givenName: 'No', familyName: 'Email'});
      await request(httpServer)
        .get('/auth/google/callback')
        .query({code: 'x', state: 'y'})
        .expect(401);
    });

    it('does not duplicate link when callback called twice', async () => {
      setProfile({
        id: 'google123456789',
        email: 'verified@test.com',
        name: 'Test',
        givenName: 'Test',
        familyName: 'User',
      });
      const user = await userService.findByEmail('verified@test.com')!;
      await authMethodRepo.delete({userId: user!.id, type: AuthMethodType.GOOGLE});

      await agent.get('/auth/google/callback').query({code: 'x', state: 'y'}).expect(302);
      await agent.get('/auth/google/callback').query({code: 'x', state: 'y'}).expect(302);

      const methods = await authMethodRepo.find({
        where: {userId: user!.id, type: AuthMethodType.GOOGLE},
      });
      expect(methods.length).toBe(1);
    });
  });
});
