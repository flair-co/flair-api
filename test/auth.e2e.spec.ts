import {faker} from '@faker-js/faker';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {ConfigurationService} from '@core/config/config.service';
import {ChangePasswordDto} from '@modules/auth/api/dtos/change-password.dto';
import {EmailChangeDto} from '@modules/auth/api/dtos/email-change.dto';
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
import {clearEmails, extractVerificationCode, findEmailByRecipient} from './utils/email.util';

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

  describe('/auth/signup/resend (POST)', () => {
    let unverifiedAgent: TestAgent;
    let verifiedAgent: TestAgent;

    beforeEach(async () => {
      unverifiedAgent = request.agent(httpServer);
      await unverifiedAgent
        .post('/auth/login')
        .send({email: UNVERIFIED_USER_EMAIL, password: UNVERIFIED_USER_PASSWORD})
        .expect(200);

      verifiedAgent = request.agent(httpServer);
      await verifiedAgent
        .post('/auth/login')
        .send({email: VERIFIED_USER_EMAIL, password: VERIFIED_USER_PASSWORD})
        .expect(200);

      await clearEmails(mailhogApiUrl);
    });

    it('should send a new verification email for an unverified user', async () => {
      await unverifiedAgent
        .post('/auth/signup/resend')
        .send()
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Verification email sent.');
        });

      const verificationEmail = await findEmailByRecipient(UNVERIFIED_USER_EMAIL, mailhogApiUrl);
      expect(verificationEmail).toBeDefined();

      const recipientEmail =
        verificationEmail?.To?.[0]?.Mailbox + '@' + verificationEmail?.To?.[0]?.Domain;
      const subject = verificationEmail?.Content?.Headers?.Subject?.[0];
      const body = verificationEmail?.Content?.Body;

      expect(recipientEmail).toEqual(UNVERIFIED_USER_EMAIL);
      expect(subject).toContain('is your verification code');
      expect(body).toMatch(/Or use the[\s\S]*?following code:\s*(\d{6})/i);
    });

    it('should fail with 400 Bad Request if the user is already verified', async () => {
      await verifiedAgent
        .post('/auth/signup/resend')
        .send()
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Email is already verified/i);
        });

      const email = await findEmailByRecipient(VERIFIED_USER_EMAIL, mailhogApiUrl);
      expect(email).toBeUndefined();
    });

    it('should fail with 401 Unauthorized if the user is not logged in', async () => {
      await request(httpServer)
        .post('/auth/signup/resend')
        .send()
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });
  });

  describe('/auth/signup/verify (POST)', () => {
    let verificationCode: string | null;
    let userCredentials: SignUpDto;
    let agent: TestAgent;

    beforeEach(async () => {
      userCredentials = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer).post('/auth/signup').send(userCredentials).expect(201);

      const welcomeEmail = await findEmailByRecipient(userCredentials.email, mailhogApiUrl);
      verificationCode = extractVerificationCode(welcomeEmail?.Content?.Body);
      expect(verificationCode).toBeDefined();
      expect(verificationCode).toMatch(/^\d{6}$/);

      agent = request.agent(httpServer);
      await agent.post('/auth/login').send(userCredentials).expect(200);

      await clearEmails(mailhogApiUrl);
    });

    it('should verify email with correct code (unauthenticated)', async () => {
      const response = await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: verificationCode})
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Email verified.');
        });

      const cookiesHeader = response.headers['set-cookie'];
      expect(cookiesHeader).toBeDefined();
      const sessionCookie = ([] as string[])
        .concat(cookiesHeader || [])
        .find((cookie: string) => cookie.startsWith('session='));
      expect(sessionCookie).toBeDefined();

      const agent = request.agent(httpServer);
      await agent.post('/auth/login').send(userCredentials).expect(200);

      const meResponse = await agent.get('/users/me').expect(200);
      expect(meResponse.body.isEmailVerified).toBe(true);
    });

    it('should verify email with correct code (authenticated)', async () => {
      await agent
        .post('/auth/signup/verify')
        .send({code: verificationCode})
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Email verified.');
        });

      const userRes = await agent.get('/users/me').expect(200);
      expect(userRes.body.isEmailVerified).toBe(true);
    });

    it('should verify email with resend code (authenticated)', async () => {
      await agent.post('/auth/signup/resend').send().expect(200);

      const resendEmail = await findEmailByRecipient(userCredentials.email, mailhogApiUrl);
      const resendCode = extractVerificationCode(resendEmail?.Content?.Body);
      expect(resendCode).toBeDefined();
      expect(resendCode).toMatch(/^\d{6}$/);
      expect(resendCode).not.toEqual(verificationCode);

      await agent
        .post('/auth/signup/verify')
        .send({code: resendCode})
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Email verified.');
        });

      const meResponse = await agent.get('/users/me').expect(200);
      expect(meResponse.body.isEmailVerified).toBe(true);
    });

    it('should fail with 400 Bad Request for invalid code', async () => {
      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: '000000'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
        });
    });

    it('should fail with 400 Bad Request if trying to verify an already verified email', async () => {
      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: verificationCode})
        .expect(200);

      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: verificationCode})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
        });

      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: '654321'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
        });
    });

    it('should fail with 400 Bad Request for malformed code (too short)', async () => {
      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: '12345'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/Verification code must be 6 digits/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request for malformed code (non-digit)', async () => {
      await request(httpServer)
        .post('/auth/signup/verify')
        .send({code: 'abcdef'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/Verification code must be 6 digits/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request for missing code', async () => {
      await request(httpServer)
        .post('/auth/signup/verify')
        .send({})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/code should not be empty/i)]),
          );
        });
    });
  });

  describe('/auth/change-email/request (POST)', () => {
    let verifiedAgent: TestAgent;
    let verifiedUserName: string;
    let unverifiedAgent: TestAgent;
    let conflictUserEmail: string;

    beforeAll(async () => {
      conflictUserEmail = faker.internet.email();
      const conflictUserDto: SignUpDto = {
        name: faker.person.fullName(),
        email: conflictUserEmail,
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer).post('/auth/signup').send(conflictUserDto).expect(201);
    });

    beforeEach(async () => {
      verifiedAgent = request.agent(httpServer);
      await verifiedAgent
        .post('/auth/login')
        .send({email: VERIFIED_USER_EMAIL, password: VERIFIED_USER_PASSWORD})
        .expect(200);
      const meResponse = await verifiedAgent.get('/users/me').expect(200);
      verifiedUserName = meResponse.body.name;

      unverifiedAgent = request.agent(httpServer);
      await unverifiedAgent
        .post('/auth/login')
        .send({email: UNVERIFIED_USER_EMAIL, password: UNVERIFIED_USER_PASSWORD})
        .expect(200);

      await clearEmails(mailhogApiUrl);
    });

    it('should send a verification email to the new email address for a verified user', async () => {
      const newEmail = faker.internet.email();
      const emailChangeDto: EmailChangeDto = {
        newEmail: newEmail,
        password: VERIFIED_USER_PASSWORD,
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toEqual('Verification email sent.');
        });

      const verificationEmail = await findEmailByRecipient(newEmail, mailhogApiUrl);
      expect(verificationEmail).toBeDefined();

      const recipientEmail =
        verificationEmail?.To?.[0]?.Mailbox + '@' + verificationEmail?.To?.[0]?.Domain;
      const subject = verificationEmail?.Content?.Headers?.Subject?.[0];
      const body = verificationEmail?.Content?.Body;
      const code = extractVerificationCode(body);

      expect(recipientEmail).toEqual(newEmail);
      expect(subject).toContain('is your verification code');
      expect(body).toContain(verifiedUserName);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should fail with 401 Unauthorized if the user is not logged in', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: faker.internet.email(),
        password: VERIFIED_USER_PASSWORD,
      };

      await request(httpServer)
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });

    it('should fail with 403 Forbidden if the user email is not verified', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: faker.internet.email(),
        password: UNVERIFIED_USER_PASSWORD,
      };

      await unverifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toMatch(/Email not verified/i);
        });
    });

    it('should fail with 401 Unauthorized if the provided password is incorrect', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: faker.internet.email(),
        password: 'wrong-password',
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });

    it('should fail with 409 Conflict if the new email is already in use', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: conflictUserEmail,
        password: VERIFIED_USER_PASSWORD,
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toMatch(/email is already in use/i);
        });
    });

    it('should fail with 400 Bad Request if newEmail is not a valid email format', async () => {
      const emailChangeDto = {
        newEmail: 'not-an-email',
        password: VERIFIED_USER_PASSWORD,
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/newEmail must be an email/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if newEmail is missing', async () => {
      const emailChangeDto = {
        password: VERIFIED_USER_PASSWORD,
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/newEmail should not be empty/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if password is missing', async () => {
      const emailChangeDto = {
        newEmail: faker.internet.email(),
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/password should not be empty/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if password is too short', async () => {
      const emailChangeDto: EmailChangeDto = {
        newEmail: faker.internet.email(),
        password: '123',
      };

      await verifiedAgent
        .post('/auth/change-email/request')
        .send(emailChangeDto)
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

  describe('/auth/change-email/verify (POST)', () => {
    let verifiedAgent: TestAgent;
    let verificationCode: string | null;
    let newEmailAddress: string;
    let initialUserEmail: string = VERIFIED_USER_EMAIL;

    const requestChangeAndGetCode = async (agent: TestAgent, password: string) => {
      const requestedNewEmail = faker.internet.email();
      const changeDto: EmailChangeDto = {newEmail: requestedNewEmail, password};
      await agent.post('/auth/change-email/request').send(changeDto).expect(200);

      const emailContent = await findEmailByRecipient(requestedNewEmail, mailhogApiUrl);
      const code = extractVerificationCode(emailContent?.Content?.Body);
      return {code, newEmail: requestedNewEmail};
    };

    beforeEach(async () => {
      verifiedAgent = request.agent(httpServer);
      await verifiedAgent
        .post('/auth/login')
        .send({email: initialUserEmail, password: VERIFIED_USER_PASSWORD})
        .expect(200);

      const result = await requestChangeAndGetCode(verifiedAgent, VERIFIED_USER_PASSWORD);
      verificationCode = result.code;
      newEmailAddress = result.newEmail;
      expect(verificationCode).toBeDefined();
      expect(verificationCode).toMatch(/^\d{6}$/);

      await clearEmails(mailhogApiUrl);
    });

    it('should change the email with a valid code for an authenticated, verified user', async () => {
      const response = await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: verificationCode})
        .expect(200);

      const updatedUser: User = response.body;
      expect(updatedUser).toBeDefined();
      expect(updatedUser.email).toEqual(newEmailAddress);
      expect(updatedUser.isEmailVerified).toBe(true);

      const meResponse = await verifiedAgent.get('/users/me').expect(200);
      expect(meResponse.body.email).toEqual(newEmailAddress);

      initialUserEmail = newEmailAddress;
    });

    it('should fail with 401 Unauthorized if the user is not logged in', async () => {
      await request(httpServer)
        .post('/auth/change-email/verify')
        .send({code: verificationCode})
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toMatch(/Unauthorized/i);
        });
    });

    it('should fail with 403 Forbidden if the logged in user is not email-verified', async () => {
      const unverifiedAgent = request.agent(httpServer);
      await unverifiedAgent
        .post('/auth/login')
        .send({email: UNVERIFIED_USER_EMAIL, password: UNVERIFIED_USER_PASSWORD})
        .expect(200);

      await unverifiedAgent
        .post('/auth/change-email/verify')
        .send({code: verificationCode ?? '123456'})
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toMatch(/Email not verified/i);
        });
    });

    it('should fail with 400 Bad Request for an invalid code', async () => {
      await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: '000000'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
        });
    });

    it('should fail with 400 Bad Request if the code has already been used', async () => {
      await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: verificationCode})
        .expect(200);

      initialUserEmail = newEmailAddress;

      const agentWithNewEmail = request.agent(httpServer);
      await agentWithNewEmail
        .post('/auth/login')
        .send({email: newEmailAddress, password: VERIFIED_USER_PASSWORD})
        .expect(200);

      await agentWithNewEmail
        .post('/auth/change-email/verify')
        .send({code: verificationCode})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/Invalid or expired verification code/i);
        });
    });

    it('should fail with 400 Bad Request for a malformed code (too short)', async () => {
      await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: '12345'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/Verification code must be 6 digits/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request for a malformed code (non-digit)', async () => {
      await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: 'abcdef'})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/Verification code must be 6 digits/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request for a missing code', async () => {
      await verifiedAgent
        .post('/auth/change-email/verify')
        .send({})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/code should not be empty/i)]),
          );
        });
    });

    it('should fail with 409 Conflict if the email associated with the code is now taken (race condition)', async () => {
      // 1. User A requests change to targetEmail (done in beforeEach)
      const codeForA = verificationCode;
      const targetEmail = newEmailAddress;
      expect(codeForA).toBeDefined();

      // 2. Create, verify and log in User B
      const userBCredentials: SignUpDto = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      await request(httpServer).post('/auth/signup').send(userBCredentials).expect(201);

      const signupEmailC = await findEmailByRecipient(userBCredentials.email, mailhogApiUrl);
      const signupCodeC = extractVerificationCode(signupEmailC?.Content?.Body);
      expect(signupCodeC).toBeDefined();
      await request(httpServer).post('/auth/signup/verify').send({code: signupCodeC}).expect(200);

      const userBAgent = request.agent(httpServer);
      await userBAgent
        .post('/auth/login')
        .send({email: userBCredentials.email, password: userBCredentials.password})
        .expect(200);

      // 3. User B requests change to the same targetEmail and gets their own code
      const changeDtoForB: EmailChangeDto = {
        newEmail: targetEmail,
        password: userBCredentials.password,
      };
      await userBAgent.post('/auth/change-email/request').send(changeDtoForB).expect(200);

      const emailForB = await findEmailByRecipient(targetEmail, mailhogApiUrl);
      const codeForB = extractVerificationCode(emailForB?.Content?.Body);
      expect(codeForB).toBeDefined();
      expect(codeForB).not.toEqual(codeForA);

      // 4. User B successfully verifies their code, taking the targetEmail address
      await userBAgent.post('/auth/change-email/verify').send({code: codeForB}).expect(200);

      // 5. User A now tries to verify their original code for the now-taken email, expect conflict
      await verifiedAgent
        .post('/auth/change-email/verify')
        .send({code: codeForA})
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toMatch(/email is already in use/i);
        });

      initialUserEmail = VERIFIED_USER_EMAIL;
    });
  });
});
