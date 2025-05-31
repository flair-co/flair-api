import {DataSource, QueryRunner} from 'typeorm';

truncate();

export async function truncate() {
	let queryRunner: QueryRunner | undefined = undefined;

	const dataSource = new DataSource({
		type: 'postgres',
		host: process.env.DB_HOST,
		port: parseInt(process.env.DB_PORT!),
		username: process.env.DB_USERNAME,
		password: process.env.DB_PASSWORD,
		database: process.env.DB_NAME,
		logging: ['error', 'warn'],
		synchronize: false,
	});

	try {
		await dataSource.initialize();
		console.log('DB connection successful. Truncating schema...');

		queryRunner = dataSource.createQueryRunner();
		await queryRunner.connect();
		await queryRunner.query('DROP SCHEMA public CASCADE;');
		await queryRunner.query('CREATE SCHEMA public;');
		await queryRunner.release();

		console.log('Public schema recreated.');
	} finally {
		if (queryRunner) queryRunner.release();
		if (dataSource.isInitialized) await dataSource.destroy();
	}
}
