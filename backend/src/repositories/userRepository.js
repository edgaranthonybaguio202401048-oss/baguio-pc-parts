'use strict';
const BaseRepository = require('./BaseRepository');

const publicFields = { id: true, email: true, name: true, role: true, createdAt: true };

class UserRepository extends BaseRepository {
  findByEmailWithHash(email) {
    return this.db.user.findUnique({ where: { email } });
  }

  findById(id) {
    return this.db.user.findUnique({ where: { id }, select: publicFields });
  }

  create({ name, email, passwordHash, role = 'customer' }) {
    return this.db.user.create({ data: { name, email, passwordHash, role }, select: publicFields });
  }
}

module.exports = new UserRepository();
