'use strict';
const prisma = require('../config/database');

/**
 * Small base for repositories: holds the shared Prisma singleton and lets
 * every method optionally run inside a caller-supplied transaction client.
 * Repositories own persistence only – no business rules live here.
 */
class BaseRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  /** Use the transaction client when one is supplied, else the singleton. */
  client(tx) {
    return tx || this.db;
  }
}

module.exports = BaseRepository;
