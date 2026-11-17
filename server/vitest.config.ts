import { defineConfig } from 'vitest/config';

// Unit/HTTP tests only — no database needed. Integration tests live in *.int.test.ts.
// Placeholder env values let the app module load in CI without a .env file; these
// tests never open a database connection.
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    exclude: ['src/tests/**/*.int.test.ts', 'node_modules/**'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://unit:unit@localhost:5432/unit_test_unused',
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'unit-test-access-secret',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'unit-test-refresh-secret',
    },
  },
});
