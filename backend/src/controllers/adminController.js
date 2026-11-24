'use strict';
const wrapAll = require('./_wrap');
const { adminService, productService, inventoryService, orderService, paymentService } = require('../services');
const { ok, created, noContent } = require('../utils/response');

module.exports = wrapAll({
  // dashboard
  async dashboard(_req, res) { ok(res, await adminService.dashboard()); },

  // products
  async listProducts(req, res) {
    const { items, meta } = await productService.list(req.validatedQuery, { admin: true });
    ok(res, items, meta);
  },
  async getProduct(req, res) { ok(res, await productService.getAdmin(req.params.id)); },
  async createProduct(req, res) { created(res, await productService.create(req.body)); },
  async updateProduct(req, res) { ok(res, await productService.update(req.params.id, req.body)); },
  async deleteProduct(req, res) {
    const mode = await productService.remove(req.params.id);
    res.set('X-Delete-Mode', mode);
    noContent(res);
  },

  // inventory
  async adjustStock(req, res) { created(res, await inventoryService.adjust(req.params.id, req.body, req.user.id)); },
  async stockHistory(req, res) { ok(res, await inventoryService.history(req.params.id)); },

  // categories
  async createCategory(req, res) { created(res, await productService.createCategory(req.body)); },
  async updateCategory(req, res) { ok(res, await productService.updateCategory(req.params.id, req.body)); },

  // coupons
  async listCoupons(_req, res) { ok(res, await adminService.listCoupons()); },
  async createCoupon(req, res) { created(res, await adminService.createCoupon(req.body)); },
  async updateCoupon(req, res) { ok(res, await adminService.updateCoupon(req.params.id, req.body)); },
  async deleteCoupon(req, res) {
    await adminService.deleteCoupon(req.params.id);
    noContent(res);
  },

  // orders
  async listOrders(req, res) {
    const { items, meta } = await orderService.listAdmin(req.validatedQuery);
    ok(res, items, meta);
  },
  async getOrder(req, res) { ok(res, await orderService.getAdmin(req.params.id)); },
  async updateOrderStatus(req, res) { ok(res, await orderService.adminUpdateStatus(req.user, req.params.id, req.body)); },
  async reconcileOrder(req, res) { ok(res, await paymentService.adminReconcile(req.user, req.params.id)); },

  // payments
  async webhookEvents(req, res) {
    const { items, meta } = await adminService.webhookEventsList(req.validatedQuery);
    ok(res, items, meta);
  },
});
