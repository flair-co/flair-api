import {faker} from '@faker-js/faker';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {LOGOUT_SUCCESS} from '@modules/auth/api/constants/api-messages.constants';
import {SignUpDto} from '@modules/auth/api/dtos/signup.dto';

import {getApp} from '../../setup/e2e.setup';

describe('AuthController - Logout', () => {
	let httpServer: Server;

	beforeAll(async () => {
		httpServer = getApp().getHttpServer();
	});

	describe('/auth/logout (POST)', () => {
		let agent: TestAgent;
		let accountCredentials: SignUpDto;

		beforeEach(async () => {
			accountCredentials = {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({length: 10}),
			};

			await request(httpServer).post('/auth/signup').send(accountCredentials).expect(201);

			agent = request.agent(httpServer);
			await agent
				.post('/auth/login')
				.send({email: accountCredentials.email, password: accountCredentials.password})
				.expect(200);
		});

		it('should log out an authenticated account', async () => {
			await agent.get('/accounts/me').expect(200);

			const response = await agent
				.post('/auth/logout')
				.send()
				.expect(200)
				.expect((res) => {
					expect(res.body.message).toEqual(LOGOUT_SUCCESS);
				});

			const cookiesHeader = response.headers['set-cookie'];
			expect(cookiesHeader).toBeDefined();

			const sessionCookie = ([] as string[])
				.concat(cookiesHeader || [])
				.find((cookie: string) => cookie.startsWith('session='));

			expect(sessionCookie).toBeDefined();
			expect(sessionCookie).toMatch(/Max-Age=0|Expires=.*1970/);
			expect(sessionCookie).toMatch(/Path=\//);

			await agent.get('/accounts/me').expect(401);
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
});
