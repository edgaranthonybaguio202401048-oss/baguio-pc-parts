'use strict';
const wrapAll = require('./_wrap');
const { cartService } = require('../services');
const { ok, noContent } = require('../utils/response');

module.exports = wrapAll({
  async get(req, res) {
    ok(res, await cartService.get(req.user.id));
  },
  async addItem(req, res) {
    ok(res, await cartService.add(req.user.id, req.body));
  },
  async updateItem(req, res) {
    ok(res, await cartService.update(req.user.id, req.params.productId, req.body.quantity));
  },
  async removeItem(req, res) {
    ok(res, await cartService.remove(req.user.id, req.params.productId));
  },
  async clear(req, res) {
    await cartService.clear(req.user.id);
    noContent(res);
  },
});
