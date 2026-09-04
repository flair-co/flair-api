import {INestApplication, ValidationPipe} from '@nestjs/common';
import {NestExpressApplication} from '@nestjs/platform-express';
import {Test} from '@nestjs/testing';
import {Server} from 'node:net';

import {AppModule} from '../../src/app.module';
import {seedDatabase} from './seed-database';

let app: INestApplication<Server>;

beforeAll(async () => {
	const moduleFixture = await Test.createTestingModule({imports: [AppModule]}).compile();
	app = moduleFixture.createNestApplication({forceCloseConnections: true});
	(app as NestExpressApplication).set('query parser', 'extended');
	app.useGlobalPipes(new ValidationPipe({whitelist: true, transform: true}));
	await app.init();

	await seedDatabase(app);
});

afterAll(async () => {
	if (app) await app.close();
});

export function getApp() {
	return app;
}
