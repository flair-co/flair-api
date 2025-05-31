import {INestApplicationContext} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {EntityManager} from 'typeorm';

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
	const entityManager = app.get(EntityManager);
	const tableNames = entityManager.connection.entityMetadatas.map((entity) => entity.tableName).join(', ');
	await entityManager.query(`truncate ${tableNames} restart identity cascade;`);
	console.log(`Database tables cleared: ${tableNames}`);
}
