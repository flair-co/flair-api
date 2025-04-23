import {faker} from '@faker-js/faker';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {ConfigurationService} from '@core/config/config.service';
import {ChangePasswordDto} from '@modules/auth/api/dtos/change-password.dto';
import {SignUpDto} from '@modules/auth/api/dtos/signup.dto';
import {User} from '@modules/user/user.entity';

import {
  PW_CHANGE_USER_EMAIL,
  PW_CHANGE_USER_PASSWORD,
  UNVERIFIED_USER_EMAIL,
  UNVERIFIED_USER_PASSWORD,
  VERIFIED_USER_EMAIL,
  VERIFIED_USER_PASSWORD,
} from './setup/constants';
import {getApp} from './setup/e2e.setup';
import {clearEmails, findEmailByRecipient} from './utils/email.util';

describe('AuthController (e2e)', () => {
  let mailhogApiUrl: string;
  let httpServer: any;

  beforeAll(async () => {
    const app = getApp();

    mailhogApiUrl = app.get(ConfigurationService).get('EMAIL_UI_URL');
    httpServer = app.getHttpServer();
  });

  beforeEach(async () => {
    await clearEmails(mailhogApiUrl);
  });

  describe('/auth/login (POST)', () => {
    let userCredentials: SignUpDto;
    let agent: TestAgent;

    beforeEach(async () => {
      userCredentials = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      agent = request.agent(httpServer);

      await agent.post('/auth/signup').send(userCredentials).expect(201);
    });

    it('should log in with correct credentials and establish session', async () => {
      const response = await agent.get('/users/me').expect(200);

      const user: User = response.body;
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toEqual(userCredentials.email);
      expect(user.name).toEqual(userCredentials.name);
      expect(user.password).toBeUndefined();

      const cookiesHeader = response.headers['set-cookie'];
      expect(cookiesHeader).toBeDefined();

      const sessionCookie = ([] as string[])
        .concat(cookiesHeader || [])
        .find((cookie: string) => cookie.startsWith('session='));

      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toMatch(/HttpOnly/);
      expect(sessionCookie).toMatch(/Path=\//);
      expect(sessionCookie).toMatch(/SameSite=Strict/);
      expect(sessionCookie).toMatch(/Expires=/);
    });

    it('should return 403 Forbidden when accessing email-verified route without verification', async () => {
      await agent
        .get('/auth/sessions')
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toMatch(/email not verified/i);
        });
    });

    it('should fail to log in with incorrect password', async () => {
      const response = await request(httpServer)
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: 'incorrect-password',
        })
        .expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('should fail to log in with incorrect email', async () => {
      const response = await request(httpServer)
        .post('/auth/login')
        .send({
          email: 'incorrect@email.com',
          password: userCredentials.password,
        })
        .expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('should fail with 401 Unauthorized if email is missing', () => {
      return request(httpServer)
        .post('/auth/login')
        .send({
          password: 'password123',
        })
        .expect(401);
    });

    it('should fail with 401 Unauthorized if email is empty', () => {
      return request(httpServer)
        .post('/auth/login')
        .send({
          email: '',
          password: 'password123',
        })
        .expect(401);
    });

    it('should fail with 401 Unauthorized if password is missing', () => {
      return request(httpServer)
        .post('/auth/login')
        .send({
          email: userCredentials.email,
        })
        .expect(401);
    });

    it('should fail with 401 Unauthorized if password is empty', () => {
      return request(httpServer)
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: '',
        })
        .expect(401);
    });

    it('should fail with 400 Bad Request if email is not a valid email format', () => {
      return request(httpServer)
        .post('/auth/login')
        .send({
          email: 'not-a-valid-email',
          password: 'password123',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/email must be an email/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if password is too short', () => {
      return request(httpServer)
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: '123',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/password must be longer than or equal to 8 characters/i),
            ]),
          );
        });
    });
  });

  describe('/auth/logout (POST)', () => {
    let agent: TestAgent;
    let userCredentials: SignUpDto;

    beforeEach(async () => {
      userCredentials = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };

      await request(httpServer).post('/auth/signup').send(userCredentials).expect(201);

      agent = request.agent(httpServer);
      await agent
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password,
        })
        .expect(200);
    });

    it('should log out an authenticated user', async () => {
      await agent.get('/users/me').expect(200);

      const response = await agent
        .post('/auth/logout')
        .send()
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('User logged out.');
        });

      const cookiesHeader = response.headers['set-cookie'];
      expect(cookiesHeader).toBeDefined();

      const sessionCookie = ([] as string[])
        .concat(cookiesHeader || [])
        .find((cookie: string) => cookie.startsWith('session='));

      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toMatch(/Max-Age=0|Expires=.*1970/);
      expect(sessionCookie).toMatch(/Path=\//);

      // Verify session is terminated by accessing a protected route
      await agent.get('/users/me').expect(401);
    });

    it('should fail with 401 Unauthorized if user is not logged in', () => {
      return request(httpServer)
        .post('/auth/logout')
        .send()
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });
  });

  describe('/auth/signup (POST)', () => {
    it('should sign up a new user and send welcome email', async () => {
      const signUpDto: SignUpDto = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };

      const response = await request(httpServer).post('/auth/signup').send(signUpDto).expect(201);

      expect(response.body?.email).toEqual(signUpDto.email);

      // Wait for BullMQ to process job
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const welcomeEmail = await findEmailByRecipient(signUpDto.email, mailhogApiUrl);
      expect(welcomeEmail).toBeDefined();

      const recipientEmail = welcomeEmail?.To?.[0]?.Mailbox + '@' + welcomeEmail?.To?.[0]?.Domain;
      const subject = welcomeEmail?.Content?.Headers?.Subject?.[0];
      const body = welcomeEmail?.Content?.Body;

      expect(recipientEmail).toEqual(signUpDto.email);
      expect(subject).toContain('Welcome to Flair');
      expect(subject).toContain('is your verification code');
      expect(body).toContain(signUpDto.name);
      expect(body).toMatch(/Or use the[\s\S]*?following code:\s*(\d{6})/i);
    });

    it('should fail with 409 Conflict if email is already in use', async () => {
      const email = faker.internet.email();
      const existingUserDto = {
        name: faker.person.fullName(),
        email: email,
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer).post('/auth/signup').send(existingUserDto).expect(201);

      const duplicateSignUpDto = {
        name: faker.person.fullName(),
        email: email,
        password: faker.internet.password({length: 11}),
      };

      return request(httpServer)
        .post('/auth/signup')
        .send(duplicateSignUpDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toMatch(/email.*already in use/i);
        });
    });

    it('should fail with 400 Bad Request if password is too short', async () => {
      const signUpDto = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: '123',
      };

      return request(httpServer)
        .post('/auth/signup')
        .send(signUpDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/password must be longer than or equal to 8 characters/i),
            ]),
          );
        });
    });

    it('should fail with 400 Bad Request if name is missing', async () => {
      const signUpDto = {
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer)
        .post('/auth/signup')
        .send(signUpDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/name should not be empty/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if email is missing', async () => {
      const signUpDto = {
        name: faker.person.fullName(),
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer)
        .post('/auth/signup')
        .send(signUpDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/email should not be empty/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if name is empty', async () => {
      const signUpDto = {
        name: '',
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer)
        .post('/auth/signup')
        .send(signUpDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/name should not be empty/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if email is empty', async () => {
      const signUpDto = {
        name: faker.person.fullName(),
        email: '',
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer)
        .post('/auth/signup')
        .send(signUpDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/email should not be empty/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if email is not a valid email format', async () => {
      const signUpDto = {
        name: faker.person.fullName(),
        email: 'not-a-valid-email',
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer)
        .post('/auth/signup')
        .send(signUpDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/email must be an email/i)]),
          );
        });
    });
  });

  describe('/auth/change-password (POST) - Success Case', () => {
    let agent: TestAgent;

    beforeEach(async () => {
      agent = request.agent(httpServer);
      await agent
        .post('/auth/login')
        .send({
          email: PW_CHANGE_USER_EMAIL,
          password: PW_CHANGE_USER_PASSWORD,
        })
        .expect(200);
    });

    it('should change password and allow login with new password', async () => {
      const newPassword = faker.internet.password({length: 12});
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: PW_CHANGE_USER_PASSWORD,
        newPassword: newPassword,
      };

      await agent
        .post('/auth/change-password')
        .send(changePasswordDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Password changed.');
        });

      await agent.post('/auth/logout').expect(200);

      await request(httpServer)
        .post('/auth/login')
        .send({email: PW_CHANGE_USER_EMAIL, password: PW_CHANGE_USER_PASSWORD})
        .expect(401);

      await request(httpServer)
        .post('/auth/login')
        .send({email: PW_CHANGE_USER_EMAIL, password: newPassword})
        .expect(200);
    });
  });

  describe('/auth/change-password (POST) - Failure Cases', () => {
    let agent: TestAgent;

    beforeEach(async () => {
      agent = request.agent(httpServer);

      await agent
        .post('/auth/login')
        .send({
          email: VERIFIED_USER_EMAIL,
          password: VERIFIED_USER_PASSWORD,
        })
        .expect(200);
    });

    it('should fail with 401 Unauthorized if current password is incorrect', async () => {
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: 'wrong-current-password',
        newPassword: faker.internet.password({length: 12}),
      };

      return agent.post('/auth/change-password').send(changePasswordDto).expect(401);
    });

    it('should fail with 403 Forbidden when unverified user tries to change password', async () => {
      const unverifiedAgent = request.agent(httpServer);
      await unverifiedAgent
        .post('/auth/login')
        .send({email: UNVERIFIED_USER_EMAIL, password: UNVERIFIED_USER_PASSWORD})
        .expect(200);

      const newPassword = faker.internet.password({length: 12});
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: UNVERIFIED_USER_PASSWORD,
        newPassword: newPassword,
      };

      await unverifiedAgent
        .post('/auth/change-password')
        .send(changePasswordDto)
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toMatch(/Email not verified/i);
        });
    });

    it('should fail with 400 Bad Request if new password is too short', async () => {
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: VERIFIED_USER_PASSWORD,
        newPassword: 'short',
      };

      return agent
        .post('/auth/change-password')
        .send(changePasswordDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/newPassword must be longer than or equal to 8 characters/i),
            ]),
          );
        });
    });

    it('should fail with 400 Bad Request if current password is missing', async () => {
      const changePasswordDto: Partial<ChangePasswordDto> = {
        newPassword: faker.internet.password({length: 12}),
      };

      return agent
        .post('/auth/change-password')
        .send(changePasswordDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/currentPassword should not be empty/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if new password is missing', async () => {
      const changePasswordDto: Partial<ChangePasswordDto> = {
        currentPassword: VERIFIED_USER_PASSWORD,
      };

      return agent
        .post('/auth/change-password')
        .send(changePasswordDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/newPassword should not be empty/i)]),
          );
        });
    });

    it('should fail with 401 Unauthorized if user is not logged in', async () => {
      const newPassword = faker.internet.password({length: 12});
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: VERIFIED_USER_PASSWORD,
        newPassword: newPassword,
      };

      return request(httpServer).post('/auth/change-password').send(changePasswordDto).expect(401);
    });
  });
});
