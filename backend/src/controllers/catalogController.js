'use strict';
const wrapAll = require('./_wrap');
const { productService } = require('../services');
const { ok } = require('../utils/response');
const { shippingOptions } = require('../patterns/shipping/shippingStrategies');

module.exports = wrapAll({
  async listProducts(req, res) {
    const { items, meta } = await productService.list(req.validatedQuery);
    ok(res, items, meta);
  },
  async getProduct(req, res) {
    ok(res, await productService.getPublic(req.params.id));
  },
  async listCategories(_req, res) {
    ok(res, await productService.categoriesList());
  },
  async listShippingOptions(_req, res) {
    ok(res, shippingOptions());
  },
});
