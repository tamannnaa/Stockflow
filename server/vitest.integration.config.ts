import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against a real, DISPOSABLE PostgreSQL database.
 * Set TEST_DATABASE_URL (never your dev/prod DB — tables are truncated) and
 * apply migrations to it first:  DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
 */
export default defineConfig({
  test: {
    include: ['src/tests/**/*.int.test.ts'],
    setupFiles: ['src/tests/setup.integration.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
