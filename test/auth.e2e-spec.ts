import {faker} from '@faker-js/faker';
import {INestApplication, ValidationPipe} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import request from 'supertest';

import {SignUpDto} from '@core/auth/api/dtos/signup.dto';
import {User} from '@modules/user/user.entity';

import {AppModule} from '../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  beforeEach(async () => {
    //    Example: await cleanDatabaseTables(['users', 'sessions', 'verification_codes']);
  });

  afterAll(async () => {
    // 4. Tear down database connection/container and close the app
    await app.close();
    //    Example: await tearDownTestDatabase();
  });

  describe('/auth/login (POST)', () => {
    let userCredentials: SignUpDto;

    beforeEach(async () => {
      userCredentials = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      await request(app.getHttpServer()).post('/auth/signup').send(userCredentials).expect(201);
    });

    it('should log in with correct credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password,
        })
        .expect(200);

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

    it('should fail to log in with incorrect password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: 'incorrect-password',
        })
        .expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('should fail to log in with incorrect email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'incorrect@email.com',
          password: userCredentials.password,
        })
        .expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('should fail with 400 Bad Request if email is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          // email is missing
          password: 'password123',
        })
        .expect(400)
        .expect((res) => {
          // Optional: Check specific error message
          expect(res.body.message).toBeDefined();
          expect(Array.isArray(res.body.message)).toBe(true);
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/email should not be empty/i),
              expect.stringMatching(/email must be an email/i),
              // Add other expected messages based on your validators
            ]),
          );
        });
    });

    it('should fail with 400 Bad Request if password is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email, // Use a valid email
          // password is missing
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBeDefined();
          expect(Array.isArray(res.body.message)).toBe(true);
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/password should not be empty/i),
              expect.stringMatching(/password must be a string/i),
              // Add other expected messages based on your validators
            ]),
          );
        });
    });

    it('should fail with 400 Bad Request if email is not a valid email format', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'not-a-valid-email',
          password: 'password123',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBeDefined();
          expect(Array.isArray(res.body.message)).toBe(true);
          expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringMatching(/email must be an email/i)]),
          );
        });
    });

    it('should fail with 400 Bad Request if password is too short', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email, // Use a valid email
          password: '123', // Too short (MinLength is 8)
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBeDefined();
          expect(Array.isArray(res.body.message)).toBe(true);
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/password must be longer than or equal to 8 characters/i),
            ]),
          );
        });
    });

    it('should fail with 400 Bad Request if email is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: '', // Empty email
          password: 'password123',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBeDefined();
          expect(Array.isArray(res.body.message)).toBe(true);
          // Depending on exact validator setup, might include length, not empty, or email format errors
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/email should not be empty|email must be an email/i),
            ]),
          );
        });
    });

    it('should fail with 400 Bad Request if password is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userCredentials.email,
          password: '', // Empty password
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBeDefined();
          expect(Array.isArray(res.body.message)).toBe(true);
          expect(res.body.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(
                /password should not be empty|password must be longer than or equal to 8 characters/i,
              ),
            ]),
          );
        });
    });
  });

  describe('/auth/signup (POST)', () => {
    it('should register a new user successfully', async () => {
      const signUpDto = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };

      return request(app.getHttpServer())
        .post('/auth/signup')
        .send(signUpDto)
        .expect(201)
        .then(async (res) => {
          expect(res.body).toBeDefined();
          expect(res.body.email).toEqual(signUpDto.email);
        });
    });

    it('should fail if email is already in use', async () => {
      const existingUserDto = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.internet.password({length: 10}),
      };
      await request(app.getHttpServer()).post('/auth/signup').send(existingUserDto).expect(201);

      const duplicateSignUpDto = {
        name: faker.person.fullName(),
        email: existingUserDto.email,
        password: faker.internet.password({length: 11}),
      };

      return request(app.getHttpServer()).post('/auth/signup').send(duplicateSignUpDto).expect(409);
    });

    it('should fail with invalid input (e.g., short password)', async () => {
      const signUpDto = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: '123',
      };

      return request(app.getHttpServer()).post('/auth/signup').send(signUpDto).expect(400);
    });
  });
});
