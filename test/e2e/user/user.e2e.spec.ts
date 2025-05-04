import {faker} from '@faker-js/faker';
import {INestApplication} from '@nestjs/common';
import {Server} from 'node:net';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';

import {Account} from '@modules/user/account.entity';
import {AccountUpdateDto} from '@modules/user/api/user-update.dto';

import {
	UNVERIFIED_USER_EMAIL,
	UNVERIFIED_USER_PASSWORD,
	VERIFIED_USER_EMAIL,
	VERIFIED_USER_PASSWORD,
} from '../../setup/constants';
import {getApp} from '../../setup/e2e.setup';

describe('Account controller - /me', () => {
	let httpServer: Server;
	let app: INestApplication;

	beforeAll(async () => {
		app = getApp();
		httpServer = app.getHttpServer();
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

			const account: Account = response.body;
			expect(account).toBeDefined();
			expect(account.id).toBeDefined();
			expect(account.email).toEqual(VERIFIED_USER_EMAIL);
			expect(account.fullName).toEqual('Verified User');
			expect(account.isEmailVerified).toBe(true);
			expect(account.createdAt).toBeDefined();
			expect(account.password).toBeUndefined();
			expect(account.bankAccounts).toBeUndefined();
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

			const account: Account = response.body;
			expect(account).toBeDefined();
			expect(account.id).toBeDefined();
			expect(account.email).toEqual(UNVERIFIED_USER_EMAIL);
			expect(account.fullName).toEqual('Unverified User');
			expect(account.isEmailVerified).toBe(false);
			expect(account.createdAt).toBeDefined();
			expect(account.password).toBeUndefined();
			expect(account.bankAccounts).toBeUndefined();
		});

		it('should return 401 Unauthorized if the user is not authenticated', async () => {
			await request(httpServer).get('/users/me').expect(401);
		});
	});

	describe('/users/me (PATCH)', () => {
		let verifiedAgent: TestAgent;
		let unverifiedAgent: TestAgent;

		beforeAll(async () => {
			verifiedAgent = request.agent(httpServer);
			await verifiedAgent
				.post('/auth/login')
				.send({
					email: VERIFIED_USER_EMAIL,
					password: VERIFIED_USER_PASSWORD,
				})
				.expect(200);

			unverifiedAgent = request.agent(httpServer);
			await unverifiedAgent
				.post('/auth/login')
				.send({
					email: UNVERIFIED_USER_EMAIL,
					password: UNVERIFIED_USER_PASSWORD,
				})
				.expect(200);
		});

		it('should update the fullName for an authenticated VERIFIED user', async () => {
			const newFullName = faker.person.fullName();
			const updateDto: AccountUpdateDto = {fullName: newFullName};

			const patchResponse = await verifiedAgent.patch('/users/me').send(updateDto).expect(200);

			const updatedAccount: Account = patchResponse.body;
			expect(updatedAccount).toBeDefined();
			expect(updatedAccount.fullName).toEqual(newFullName);
			expect(updatedAccount.email).toEqual(VERIFIED_USER_EMAIL);
			expect(updatedAccount.isEmailVerified).toBe(true);
			expect(updatedAccount.password).toBeUndefined();

			const getResponse = await verifiedAgent.get('/users/me').expect(200);
			expect(getResponse.body.fullName).toEqual(newFullName);
		});

		it('should strip disallowed fields and update the fullName for an authenticated VERIFIED user', async () => {
			const updateDto: AccountUpdateDto = {fullName: 'Valid fullName Again'};

			await verifiedAgent
				.patch('/users/me')
				.send(updateDto)
				.expect(200)
				.expect((res) => {
					expect(res.body.fullName).toEqual('Valid fullName Again');
					expect(res.body.email).toEqual(VERIFIED_USER_EMAIL);
				});
		});

		it('should return 403 Forbidden for an UNVERIFIED user', async () => {
			const newFullName = faker.person.fullName();
			const updateDto: AccountUpdateDto = {fullName: newFullName};

			await unverifiedAgent
				.patch('/users/me')
				.send(updateDto)
				.expect(403)
				.expect((res) => {
					expect(res.body.message).toMatch(/email not verified/i);
				});
		});

		it('should return 401 Unauthorized if the user is not authenticated', async () => {
			const updateDto: AccountUpdateDto = {fullName: 'Attempt Update'};
			await request(httpServer).patch('/users/me').send(updateDto).expect(401);
		});

		it('should return 400 Bad Request if fullName is missing', async () => {
			await verifiedAgent
				.patch('/users/me')
				.send({})
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/fullName must be a string/i)]),
					);
				});
		});

		it('should return 400 Bad Request if fullName is empty', async () => {
			const updateDto: AccountUpdateDto = {fullName: ''};
			await verifiedAgent
				.patch('/users/me')
				.send(updateDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/fullName must be longer than or equal to 1 characters/i),
						]),
					);
				});
		});

		it('should return 400 Bad Request if fullName is too long', async () => {
			const longFullName = 'a'.repeat(256);
			const updateDto: AccountUpdateDto = {fullName: longFullName};
			await verifiedAgent
				.patch('/users/me')
				.send(updateDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([
							expect.stringMatching(/fullName must be shorter than or equal to 255 characters/i),
						]),
					);
				});
		});

		it('should return 400 Bad Request if fullName is not a string', async () => {
			const updateDto: AccountUpdateDto = {fullName: 12345 as unknown as string};
			await verifiedAgent
				.patch('/users/me')
				.send(updateDto)
				.expect(400)
				.expect((res) => {
					expect(res.body.message).toEqual(
						expect.arrayContaining([expect.stringMatching(/fullName must be a string/i)]),
					);
				});
		});
	});
});
