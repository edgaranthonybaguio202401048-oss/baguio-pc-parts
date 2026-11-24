'use strict';
const wrapAll = require('./_wrap');
const { buildService, cartService } = require('../services');
const { ok, created, noContent } = require('../utils/response');

module.exports = wrapAll({
  async check(req, res) {
    ok(res, await buildService.check(req.body.items));
  },
  async list(req, res) {
    ok(res, await buildService.list(req.user.id));
  },
  async get(req, res) {
    ok(res, await buildService.get(req.user.id, req.params.id));
  },
  async getShared(req, res) {
    ok(res, await buildService.getShared(req.params.shareCode));
  },
  async create(req, res) {
    created(res, await buildService.create(req.user.id, req.body));
  },
  async update(req, res) {
    ok(res, await buildService.update(req.user.id, req.params.id, req.body));
  },
  async remove(req, res) {
    await buildService.remove(req.user.id, req.params.id);
    noContent(res);
  },
  async addToCart(req, res) {
    await buildService.addToCart(req.user.id, req.params.id);
    ok(res, await cartService.get(req.user.id));
  },
});
