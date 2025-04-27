<p>
  <a href="https://coveralls.io/github/eduard-cc/flair-api?branch=main">
    <img src="https://coveralls.io/repos/github/eduard-cc/flair-api/badge.svg?branch=main" alt="Coverage Status" />
  </a>
  <a href="https://github.com/eduard-cc/flair-api/actions">
    <img src="https://github.com/eduard-cc/flair-api/actions/workflows/ci.yml/badge.svg" alt="Build Status" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/node.js-20.x-brightgreen" alt="Node.js Version" />
  </a>
</p>

## Installation

```bash
$ npm install
```

## Env setup

The development environment uses variables from `.env.development`. To override these locally (for API keys or secrets), define them in a `.env.development.local` file, which takes precedence.

## Development

```bash
$ npm run start:dev
```

This script starts the necessary Docker services, cleans any previous build output and launches the server in watch mode.

## Test

### Unit tests

Unit tests use Jest and focus on testing individual components in isolation.

```bash
$ npm run test

# generate coverage report
$ npm run test:cov
```

### E2E tests

Jest is used for end-to-end tests. Before each test file, a new application instance is created, the test database schema is reset (`dropSchema: true`), and the database is seeded with initial data.

```bash
$ npm run test:e2e

# generate coverage report
$ npm run test:e2e:cov
```

This script runs e2e tests sequentially using the test config (`NODE_ENV=test`, loading `.env.test`), running its own Docker test containers.
