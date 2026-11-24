'use strict';
const wrapAll = require('./_wrap');
const { authService } = require('../services');
const { ok, created } = require('../utils/response');

module.exports = wrapAll({
  async register(req, res) {
    created(res, await authService.register(req.body));
  },
  async login(req, res) {
    ok(res, await authService.login(req.body));
  },
  async me(req, res) {
    ok(res, await authService.me(req.user.id));
  },
});
