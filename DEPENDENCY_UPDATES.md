# Backend dependency update

This backend now targets the maintained NestJS 11 line and current compatible ecosystem releases. NestJS 12.0.1 is available, but it is intentionally not used yet: the installed `@nestjs/throttler` 6.5.0 and `@nest-lab/throttler-storage-redis` 1.2.0 releases declare peer support only through NestJS 11. Moving to NestJS 12 without compatible rate-limit adapters would require an unverified replacement or an unsafe peer override.

## Runtime and package manager

- Node.js: `^20.19.0 || ^22.13.0 || >=24.0.0`
- npm: `>=10.8.2`
- Package manager: npm with lockfile version 3; use `npm ci` for reproducible installs.

## Direct dependency changes

- NestJS core, platform, testing, CLI, and schematics: 10.x to 11.x.
- NestJS Config: 3.x to 4.x.
- NestJS Swagger: 7.x to 11.x.
- NestJS TypeORM: 10.x to 11.x.
- NestJS BullMQ: 11.0.2 to 11.0.5.
- NestJS Terminus: 11.0.0 to 11.1.1.
- NestJS Throttler and Redis storage: 6.4.0/1.1.0 to 6.5.0/1.2.0.
- Mailer, argon2 (0.45.1), BullMQ, class-validator, connect-redis, Express session, Helmet, ioredis, Nodemailer, PostgreSQL, rimraf, TypeORM, ua-parser-js, and Zod were updated to the current compatible releases.
- Faker, type declarations, TypeScript ESLint, ESLint, Jest, Prettier, Supertest, ts-jest, and ts-loader were updated for the current toolchain.
- `@nestjs/event-emitter` is declared directly to satisfy the mailer package peer dependency.

## Compatibility migrations

- Migrated `connect-redis` to its named `RedisStore` export.
- Updated the mailer Handlebars adapter import to its public package path.
- Configured BullMQ with a Redis URL and worker-compatible retry settings.
- Kept Express's extended query parser for nested pagination/filter query values.
- Updated `ms` calls for its current `StringValue` type and retained the existing duration semantics.
- Migrated ESLint from `.eslintrc.js` to `eslint.config.js` flat config.
- Updated Jest 30 E2E configuration for the TypeScript ESM transform and explicit Jest globals.
- Fixed the production start script to run the built entry point at `dist/src/main.js` without deleting the build first.

## Verification

The following checks passed after a clean install:

- `npm ci` — 1,048 packages installed; zero audit vulnerabilities.
- `npm run format:check`
- `npm run lint:check`
- `npx tsc --noEmit --pretty false`
- `npm test -- --runInBand` — 9 suites, 96 tests passed.
- `npm run build`
- `npm audit --omit=dev --audit-level=high` — zero vulnerabilities.
- `npm ls --all --json` — no missing, invalid, or peer-conflict packages.
- `npm run test:e2e` — 9 suites, 127 tests passed against clean PostgreSQL, Redis, and Mailpit containers.
- Built-app startup through `npm run start:prod`; `GET /health` returned HTTP 200 with API and database status `up`.
- `docker build -t flair-api-dependency-check .` — Node 20 Alpine image installs, compiles native dependencies, builds the app, retains `curl` for health checks, and contains the non-root `dist/src/main.js` entry point.

## Deferred major updates

The registry reports newer majors for several packages. They remain intentionally pinned until their surrounding APIs can be migrated and tested together:

- NestJS 12.0.1: the rate-limit packages currently declare peer support only through NestJS 11.
- connect-redis 9/10: these releases require the node-redis client, while the backend's session, queue, and rate-limit wiring uses ioredis.
- ioredis 6: TypeORM 0.3.31 declares an optional `ioredis` peer of `^5.0.4`; attempting the upgrade produces an npm peer override.
- TypeORM 1.1.1: a major persistence-layer migration is outside a dependency-only update.
- TypeScript 7.0.2: the selected ts-jest 29.4.12 release declares TypeScript `<7`.
- `@types/node` 26: the project intentionally keeps Node 20-compatible declarations while CI and the Docker runtime remain on Node 20.

## Remaining risks

- npm still reports upstream deprecation warnings for transitive `glob` 10/11 and `whatwg-encoding`; `npm audit` reports no vulnerabilities. These should be revisited when the owning packages release compatible dependency updates.
- NestJS 12 should be evaluated after `@nestjs/throttler` and its Redis storage adapter publish NestJS 12-compatible peer ranges.
- `start:prod` retains the repository's existing behavior of starting the development Compose stack with `.env.development`; the script now starts the built application correctly, but production deployment should provide a production-specific Compose/runtime configuration.
- Database schema changes continue to use the existing `DB_SYNCHRONIZE` behavior; introduce migrations before deploying against real production financial data.
