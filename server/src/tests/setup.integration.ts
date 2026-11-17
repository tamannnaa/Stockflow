// Runs before any test module is imported, so config/env.ts and PrismaClient
// pick up the test database instead of the developer's DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error('TEST_DATABASE_URL is required for integration tests (use a disposable database).');
}
if (!/test/i.test(url)) {
  throw new Error('Refusing to run: TEST_DATABASE_URL must point at a database whose name contains "test".');
}
process.env.DATABASE_URL = url;
process.env.JWT_ACCESS_SECRET ??= 'integration-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'integration-refresh-secret';
process.env.NODE_ENV = 'test';
