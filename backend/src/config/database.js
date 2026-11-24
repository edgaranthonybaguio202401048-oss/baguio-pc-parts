'use strict';
/**
 * SINGLETON (database connection).
 * Exactly one PrismaClient – and therefore one connection pool – exists per
 * process. Creating a client per request would exhaust Postgres connections
 * (Neon's free tier allows very few). In development, nodemon reloads would
 * otherwise create a new pool on every restart, so the instance is cached on
 * globalThis.
 */
const { PrismaClient } = require('@prisma/client');
const config = require('./index');

function createClient() {
  return new PrismaClient({
    log: config.isProd ? ['error'] : ['warn', 'error'],
  });
}

const prisma = globalThis.__bpcPrisma || createClient();
if (!config.isProd) globalThis.__bpcPrisma = prisma;

module.exports = prisma;
