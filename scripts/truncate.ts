import {INestApplicationContext} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {DataSource} from 'typeorm';

import {AppModule} from '../src/app.module';

truncate().catch((err) => {
	console.error(err);
	process.exit(1);
});

async function truncate() {
	const app = await bootstrap();
	await truncateTables(app);
	await app.close();
	process.exit(0);
}

export async function bootstrap() {
	return await NestFactory.createApplicationContext(AppModule, {logger: ['error', 'warn']});
}

export async function truncateTables(app: INestApplicationContext) {
	const dataSource = app.get(DataSource);
	const queryRunner = dataSource.createQueryRunner();

	await queryRunner.connect();
	await queryRunner.query('DROP SCHEMA public CASCADE;');
	await queryRunner.query('CREATE SCHEMA public;');
	await queryRunner.release();

	console.log('Schema has been recreated successfully.');
}
