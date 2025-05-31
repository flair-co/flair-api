import {seedDatabase} from 'test/setup/seed-database';

import {bootstrap, truncateTables} from './truncate';

seed().catch((err) => {
	console.error(err);
	process.exit(1);
});

async function seed() {
	const app = await bootstrap();
	await truncateTables(app);
	await seedDatabase(app);

	await app.close();
	process.exit(0);
}
