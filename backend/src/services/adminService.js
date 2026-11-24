'use strict';
const orderRepository = require('../repositories/orderRepository');
const productRepository = require('../repositories/productRepository');
const couponRepository = require('../repositories/couponRepository');
const { webhookEventRepository } = require('../repositories/paymentRepository');
const { Errors } = require('../utils/errors');
const { pageMeta } = require('../utils/response');

class AdminService {
  constructor({ orders = orderRepository, products = productRepository, coupons = couponRepository, webhookEvents = webhookEventRepository } = {}) {
    this.orders = orders;
    this.products = products;
    this.coupons = coupons;
    this.webhookEvents = webhookEvents;
  }

  /** L1-12 – every figure is a live aggregate of the database. */
  async dashboard() {
    const [stats, lowStock, flagged] = await Promise.all([
      this.orders.dashboardStats(),
      this.products.lowStock(5),
      this.orders.recentFlagged(),
    ]);
    return { ...stats, currency: 'PHP', lowStock, flaggedOrders: flagged, lowStockThreshold: 5 };
  }

  async webhookEventsList(q) {
    const { items, total } = await this.webhookEvents.list(q);
    return { items, meta: pageMeta(total, q.page, q.limit) };
  }

  // ---------------------------------------------------- coupons
  listCoupons() { return this.coupons.list(); }

  async createCoupon(body) {
    return this.coupons.create(body);
  }

  async updateCoupon(id, body) {
    const c = await this.coupons.findById(id);
    if (!c) throw Errors.notFound('Coupon');
    if (body.type === 'percentage' || (c.type === 'percentage' && body.value !== undefined && !body.type)) {
      const value = body.value ?? c.value;
      if (value > 100) throw Errors.validation('VALIDATION_ERROR', 'percentage value must be between 1 and 100', [{ field: 'value', message: 'max 100' }]);
    }
    return this.coupons.update(id, body);
  }

  async deleteCoupon(id) {
    const c = await this.coupons.findById(id);
    if (!c) throw Errors.notFound('Coupon');
    if (await this.coupons.countOrders(id)) {
      throw Errors.conflict('COUPON_IN_USE', 'Coupon has been used on orders – deactivate it instead (isActive=false)');
    }
    await this.coupons.delete(id);
  }
}

module.exports = AdminService;
