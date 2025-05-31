import {NestFactory} from '@nestjs/core';
import {AppModule} from 'src/app.module';
import {seedDatabase} from 'test/setup/seed-database';
import {DataSource} from 'typeorm';

import {truncate} from './truncate';

seed();

async function seed() {
	await truncate();
	const app = await NestFactory.createApplicationContext(AppModule, {logger: ['error', 'warn']});

	const dataSource = app.get(DataSource);
	await dataSource.synchronize();

	console.log('Seeding database...');
	await seedDatabase(app);

	console.log('Seeding complete.');
	await app.close();
	process.exit(0);
}
