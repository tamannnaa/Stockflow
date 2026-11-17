import { defineConfig } from 'vitest/config';

// Unit/HTTP tests only — no database needed. Integration tests live in *.int.test.ts.
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    exclude: ['src/tests/**/*.int.test.ts', 'node_modules/**'],
  },
});
