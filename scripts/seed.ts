import {INestApplicationContext} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {seedDatabase} from 'test/setup/seed-database';
import {DataSource, DataSourceOptions} from 'typeorm';

import {AppModule} from '../src/app.module';

async function runRawTruncate() {
	console.log('Attempting to connect directly to DB for schema truncation...');

	const dbConfig: DataSourceOptions = {
		type: 'postgres',
		host: process.env.DB_HOST,
		port: parseInt(process.env.DB_PORT || '5432', 10),
		username: process.env.DB_USERNAME,
		password: process.env.DB_PASSWORD,
		database: process.env.DB_NAME,
		logging: ['error', 'warn'],
		synchronize: false, // Explicitly false for this raw connection
	};

	if (!dbConfig.host || !dbConfig.port || !dbConfig.username || !dbConfig.password || !dbConfig.database) {
		throw new Error('DB environment variables not set for raw truncation.');
	}

	const tempDataSource = new DataSource(dbConfig);
	try {
		await tempDataSource.initialize();
		console.log('Raw DB connection successful. Truncating schema...');
		const queryRunner = tempDataSource.createQueryRunner();
		await queryRunner.connect();
		await queryRunner.query('DROP SCHEMA public CASCADE;');
		await queryRunner.query('CREATE SCHEMA public;');
		await queryRunner.release();
		console.log('Public schema dropped and recreated successfully (raw connection).');
	} catch (error) {
		console.error('Error during raw schema truncation:', error);
		throw error; // Re-throw to stop the script
	} finally {
		if (tempDataSource.isInitialized) {
			await tempDataSource.destroy();
		}
	}
}

async function bootstrapNestApp(): Promise<INestApplicationContext> {
	return NestFactory.createApplicationContext(AppModule, {logger: ['error', 'warn']});
}

async function seed() {
	try {
		await runRawTruncate();
		console.log('Bootstrapping NestJS application for seeding...');
		const app = await bootstrapNestApp();

		const dataSource = app.get(DataSource);
		console.log('Explicitly synchronizing schema via NestJS DataSource...');
		await dataSource.synchronize();
		console.log('Database schema synchronized via NestJS DataSource.');

		console.log('Seeding database...');
		await seedDatabase(app);
		console.log('Database seeded successfully.');

		await app.close();
		console.log('Seeding complete, app closed.');
		process.exit(0);
	} catch (err) {
		console.error('Error during database seeding process:', err);
		process.exit(1);
	}
}

seed();
