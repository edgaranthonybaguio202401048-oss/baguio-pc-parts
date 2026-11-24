'use strict';
/**
 * Runs once before the suite: recreates the TEST database schema from
 * prisma/schema.prisma and applies the CHECK constraints.
 * Refuses to run unless the URL looks like a test database.
 */
const path = require('path');
const { execSync } = require('child_process');

module.exports = async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });
  const url = process.env.DATABASE_URL || '';
  if (!/test/i.test(url)) {
    throw new Error('DATABASE_URL in .env.test must point at a database whose name contains "test" – refusing to wipe it.');
  }
  const opts = { stdio: 'inherit', cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'test' } };
  execSync('npx prisma db push --force-reset --skip-generate', opts);
  execSync('npx prisma db execute --file prisma/sql/constraints.sql --schema prisma/schema.prisma', opts);
};
