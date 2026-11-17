import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { DEMO_PASSWORD_DEFAULT, seedDemoData } from './demo';

/**
 * CLI entry for the demo seed.
 *   Local:       npm run seed               (tsx, from source)
 *   Production:  npm run seed:prod          (compiled, e.g. from a Render shell)
 *
 * Production safety: refuses to run when NODE_ENV=production unless
 * SEED_DEMO_DATA=true is set explicitly. Set SEED_DEMO_PASSWORD to use a
 * password other than the documented local demo password.
 */
async function main() {
  if (env.isProd && process.env.SEED_DEMO_DATA !== 'true') {
    console.error(
      'Refusing to seed demo data in production. Set SEED_DEMO_DATA=true to seed a public demo deployment ' +
        '(and SEED_DEMO_PASSWORD to choose the demo password).',
    );
    process.exitCode = 1;
    return;
  }
  const password = process.env.SEED_DEMO_PASSWORD || DEMO_PASSWORD_DEFAULT;
  if (env.isProd && password === DEMO_PASSWORD_DEFAULT) {
    console.warn('Warning: seeding production with the documented demo password. Anyone who reads the README can sign in.');
  }

  const summary = await seedDemoData({ password, log: (m) => console.log(`  • ${m}`) });
  console.log('\nSeed complete:', JSON.stringify(summary, null, 2));
  console.log(`\nDemo logins (password: ${password === DEMO_PASSWORD_DEFAULT ? DEMO_PASSWORD_DEFAULT : '<SEED_DEMO_PASSWORD>'}):`);
  console.log('  admin@stockflow.dev · manager@stockflow.dev · staff@stockflow.dev');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
