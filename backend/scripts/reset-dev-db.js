'use strict';
/**
 * T-09: `npm run db:reset` – drops and recreates the DEVELOPMENT database,
 * re-applies migrations + CHECK constraints and re-seeds.
 * Refuses to run against production.
 */
require('dotenv').config();
const { execSync } = require('child_process');

const url = process.env.DATABASE_URL || '';
if (process.env.NODE_ENV === 'production' || /prod/i.test(url) || process.env.ALLOW_DB_RESET === 'false') {
  console.error('Refusing to reset: this looks like a production database.');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
run('npx prisma migrate reset --force --skip-seed');
run('npm run db:constraints');
run('npm run db:seed');
console.log('Development database reset and seeded.');
