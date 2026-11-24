'use strict';
const { EventEmitter } = require('events');
const logger = require('../../utils/logger');

/**
 * OBSERVER (behavioral) – the subject.
 * Services publish domain events AFTER their database transaction commits:
 *   order.created          { order }
 *   order.status_changed   { order, from, to, actorType }
 *   payment.failed         { order, paymentStatus }
 *   payment.flagged        { order, reason }
 * Subscribers (listeners.js) react – notifications, audit logs, low-stock
 * alerts – and OrderService/PaymentService never know they exist.
 */
class OrderEventBus extends EventEmitter {
  /** Emit a list of events collected during a transaction; listener failures never break the request. */
  publishAll(events) {
    for (const e of events) {
      try {
        this.emit(e.name, e.payload);
      } catch (err) {
        logger.error('order event listener failed', { event: e.name, message: err.message });
      }
    }
  }
}

module.exports = new OrderEventBus();
