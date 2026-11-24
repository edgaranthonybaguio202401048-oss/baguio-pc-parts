'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const userRepository = require('../repositories/userRepository');
const { Errors } = require('../utils/errors');

// Compared against when the email does not exist, so response time does not reveal registered emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.auth.bcryptRounds);

class AuthService {
  constructor({ users = userRepository } = {}) {
    this.users = users;
  }

  sign(user) {
    return jwt.sign({ role: user.role, email: user.email }, config.auth.jwtSecret, {
      subject: user.id, expiresIn: config.auth.jwtExpiresIn, algorithm: 'HS256',
    });
  }

  session(user) {
    return { token: this.sign(user), tokenType: 'Bearer', expiresIn: config.auth.jwtExpiresIn, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }

  async register({ name, email, password }) {
    const exists = await this.users.findByEmailWithHash(email);
    if (exists) throw Errors.conflict('EMAIL_TAKEN', 'An account with this email already exists');
    const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
    try {
      const user = await this.users.create({ name, email, passwordHash, role: 'customer' });
      return this.session(user);
    } catch (err) {
      if (err.code === 'P2002') throw Errors.conflict('EMAIL_TAKEN', 'An account with this email already exists');
      throw err;
    }
  }

  async login({ email, password }) {
    const user = await this.users.findByEmailWithHash(email);
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    // Same generic message for unknown email and wrong password (L1-01)
    if (!user || !ok) throw Errors.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
    return this.session(user);
  }

  async me(userId) {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.unauthorized('TOKEN_INVALID', 'Account no longer exists');
    return user;
  }
}

module.exports = AuthService;
