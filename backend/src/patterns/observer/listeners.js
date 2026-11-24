'use strict';
const orderEvents = require('./orderEvents');
const logger = require('../../utils/logger');
const { notificationRepository } = require('../../repositories/paymentRepository');
const productRepository = require('../../repositories/productRepository');
const { formatPhp } = require('../../utils/money');

/**
 * OBSERVER – subscribers. Registered once at startup (app.js).
 * Each listener is async and isolates its own failures.
 */
const safe = (name, fn) => (payload) => {
  Promise.resolve()
    .then(() => fn(payload))
    .catch((err) => logger.warn('listener error', { listener: name, message: err.message }));
};

const MESSAGES = {
  paid: (o) => `Payment received for order ${o.orderNumber} (${formatPhp(o.totalCents)}). We're preparing your parts!`,
  processing: (o) => `Order ${o.orderNumber} is being assembled/packed.`,
  shipped: (o) => (o.shippingMethod === 'store_pickup'
    ? `Order ${o.orderNumber} is ready for pickup at our Session Road store.`
    : `Order ${o.orderNumber} has been shipped.`),
  delivered: (o) => `Order ${o.orderNumber} was delivered. Enjoy your build!`,
  cancelled: (o) => `Order ${o.orderNumber} was cancelled.`,
  expired: (o) => `Order ${o.orderNumber} expired because payment was not completed in time.`,
};

let registered = false;

function registerOrderListeners() {
  if (registered) return;
  registered = true;

  // 1) In-app notification records for the customer
  orderEvents.on('order.created', safe('notifyCreated', ({ order }) =>
    notificationRepository.create({ userId: order.userId, orderId: order.id, type: 'order.created',
      message: `Order ${order.orderNumber} created. Complete payment to confirm it.` })));

  orderEvents.on('order.status_changed', safe('notifyStatus', ({ order, to }) => {
    const make = MESSAGES[to];
    if (!make) return null;
    return notificationRepository.create({ userId: order.userId, orderId: order.id, type: `order.${to}`, message: make(order) });
  }));

  orderEvents.on('payment.failed', safe('notifyPaymentFailed', ({ order, paymentStatus }) =>
    notificationRepository.create({ userId: order.userId, orderId: order.id, type: 'payment.failed',
      message: `Payment for ${order.orderNumber} was ${paymentStatus}. You can retry from your order page.` })));

  // 2) Audit log line for every transition
  orderEvents.on('order.status_changed', safe('audit', ({ order, from, to, actorType }) =>
    logger.info('order.transition', { orderId: order.id, orderNumber: order.orderNumber, from, to, actorType })));

  orderEvents.on('payment.flagged', safe('auditFlag', ({ order, reason }) =>
    logger.warn('payment.flagged', { orderId: order.id, orderNumber: order.orderNumber, reason })));

  // 3) Low-stock alert after a sale is confirmed
  orderEvents.on('order.status_changed', safe('lowStock', async ({ to }) => {
    if (to !== 'paid') return;
    const low = await productRepository.lowStock(2, 5);
    if (low.length) logger.warn('inventory.low_stock', { products: low.map((p) => `${p.sku}:${p.stock}`) });
  }));
}

module.exports = { registerOrderListeners };
