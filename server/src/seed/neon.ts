/**
 * `npm run neon:seed` — seed the Neon production database from your machine.
 *
 * 1. Explicitly loads server/.env.neon (fails clearly if it is missing).
 * 2. Verifies DATABASE_URL points at Neon over TLS — and at NEON_EXPECTED_HOST /
 *    NEON_EXPECTED_DATABASE when set in .env.neon. Never at local Docker.
 * 3. Sets DATABASE_URL for this process only (server/.env is never modified), then
 *    runs the normal seed (run.ts), which requires SEED_DEMO_PASSWORD.
 *
 * Nothing secret is printed: only "host/database".
 * NEON_ENV_FILE can point at a different file (used by tests).
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { assertNeonTarget } from './guards';

function fail(message: string): never {
  console.error(`\n✖ neon:seed aborted — ${message}\n`);
  process.exit(1);
}

const envFile = path.resolve(process.cwd(), process.env.NEON_ENV_FILE ?? '.env.neon');
if (!fs.existsSync(envFile)) {
  fail(`${path.basename(envFile)} not found at ${envFile}. Create it (see README → Neon) with DATABASE_URL="<Neon direct connection string>".`);
}

const neonEnv = dotenv.parse(fs.readFileSync(envFile));
if (!neonEnv.DATABASE_URL) fail(`${path.basename(envFile)} does not define DATABASE_URL.`);

let label: string;
try {
  label = assertNeonTarget(neonEnv.DATABASE_URL, {
    host: neonEnv.NEON_EXPECTED_HOST || undefined,
    database: neonEnv.NEON_EXPECTED_DATABASE || undefined,
  }).label;
} catch (err) {
  fail((err as Error).message);
}

// Must be set BEFORE config/env loads server/.env (dotenv never overrides an existing variable).
process.env.DATABASE_URL = neonEnv.DATABASE_URL;
process.env.SEED_TARGET = 'neon';
console.log(`neon:seed → target ${label} (from ${path.basename(envFile)}; server/.env untouched)`);

// Load the seed only now, after DATABASE_URL points at Neon.
void import('./run');
