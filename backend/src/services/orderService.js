'use strict';
const prisma = require('../config/database');
const orderRepository = require('../repositories/orderRepository');
const couponRepository = require('../repositories/couponRepository');
const { paymentRepository } = require('../repositories/paymentRepository');
const orderEvents = require('../patterns/observer/orderEvents');
const { assertTransition } = require('./orderStateMachine');
const { Errors } = require('../utils/errors');
const dto = require('../utils/dto');
const { pageMeta } = require('../utils/response');

/**
 * OrderService – order queries and every status change.
 * Composition: OrderRepository + InventoryService + CouponRepository + event bus.
 */
class OrderService {
  constructor({ inventoryService, orders = orderRepository, coupons = couponRepository, payments = paymentRepository, db = prisma, events = orderEvents }) {
    this.inventory = inventoryService;
    this.orders = orders;
    this.coupons = coupons;
    this.payments = payments;
    this.db = db;
    this.events = events;
  }

  /**
   * Applies ONE transition inside an existing transaction.
   * Uses compare-and-set on the current status so two concurrent actors can
   * never both move the same order. Returns the event to publish after commit.
   */
  async applyTransition(tx, order, to, { actorType, actorId = null, note = null, extra = {} }) {
    assertTransition(order.status, to, actorType);
    const changed = await this.orders.updateStatusIf(order.id, order.status, { status: to, ...extra }, tx);
    if (!changed) throw Errors.conflict('CONCURRENT_UPDATE', 'Order was modified by another process; please retry');
    await this.orders.addHistory({ orderId: order.id, fromStatus: order.status, toStatus: to, actorType, actorId, note }, tx);
    return { name: 'order.status_changed', payload: { order: { ...order, status: to }, from: order.status, to, actorType } };
  }

  /** Returns reserved stock and coupon usage for an order that will never be paid. */
  async releaseResources(tx, order, reason) {
    await this.inventory.release(order.id, reason, tx);
    if (order.couponId) {
      const removed = await this.coupons.deleteRedemptionForOrder(order.id, tx);
      if (removed.count) await this.coupons.decrementUsage(order.couponId, tx);
    }
    await this.payments.supersedePending(order.id, tx);
  }

  // ------------------------------------------------------------ customer

  async listMine(userId, q) {
    const { items, total } = await this.orders.listForUser(userId, q);
    return { items: items.map(dto.orderSummary), meta: pageMeta(total, q.page, q.limit) };
  }

  async getMine(userId, orderId) {
    const order = await this.orders.findForUser(orderId, userId);
    if (!order) throw Errors.notFound('Order'); // 404 – never reveal other customers' orders
    return dto.order(order);
  }

  async cancelMine(user, orderId) {
    const owned = await this.orders.findForUser(orderId, user.id);
    if (!owned) throw Errors.notFound('Order');
    if (owned.status !== 'pending_payment') {
      throw Errors.conflict('ORDER_NOT_CANCELLABLE', `Only unpaid orders can be cancelled (current status: ${owned.status})`);
    }
    const event = await this.db.$transaction(async (tx) => {
      const fresh = await this.orders.findById(orderId, tx);
      const e = await this.applyTransition(tx, fresh, 'cancelled', { actorType: 'customer', actorId: user.id, note: 'Cancelled by customer' });
      await this.releaseResources(tx, fresh, 'Order cancelled by customer');
      return e;
    });
    this.events.publishAll([event]);
    return dto.order(await this.orders.findById(orderId));
  }

  // ------------------------------------------------------------ admin

  async listAdmin(q) {
    const { items, total } = await this.orders.listAdmin(q);
    return { items: items.map(dto.orderSummary), meta: pageMeta(total, q.page, q.limit) };
  }

  async getAdmin(orderId) {
    const order = await this.orders.findById(orderId);
    if (!order) throw Errors.notFound('Order');
    return dto.order(order, { admin: true });
  }

  async adminUpdateStatus(admin, orderId, { status, note }) {
    const event = await this.db.$transaction(async (tx) => {
      const order = await this.orders.findById(orderId, tx);
      if (!order) throw Errors.notFound('Order');
      const e = await this.applyTransition(tx, order, status, { actorType: 'admin', actorId: admin.id, note });
      if (status === 'cancelled') await this.releaseResources(tx, order, 'Order cancelled by admin');
      return e;
    });
    this.events.publishAll([event]);
    return this.getAdmin(orderId);
  }

  // ------------------------------------------------------------ system

  /** Expires one unpaid order whose reservation timed out. */
  async expireOrder(orderId) {
    const event = await this.db.$transaction(async (tx) => {
      const order = await this.orders.findById(orderId, tx);
      if (!order || order.status !== 'pending_payment') return null;
      const e = await this.applyTransition(tx, order, 'expired', { actorType: 'system', note: 'Payment window elapsed' });
      await this.releaseResources(tx, order, 'Reservation expired');
      return e;
    });
    if (event) this.events.publishAll([event]);
    return Boolean(event);
  }
}

module.exports = OrderService;
