'use strict';
const BaseRepository = require('./BaseRepository');

class PaymentRepository extends BaseRepository {
  create(data, tx) {
    return this.client(tx).payment.create({ data });
  }

  findByGatewayRef(gatewayRef, tx) {
    return this.client(tx).payment.findUnique({ where: { gatewayRef }, include: { order: true } });
  }

  findByRequestReference(requestReference, tx) {
    return this.client(tx).payment.findUnique({ where: { requestReference }, include: { order: true } });
  }

  latestForOrder(orderId, tx) {
    return this.client(tx).payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  update(id, data, tx) {
    return this.client(tx).payment.update({ where: { id }, data });
  }

  /** Mark any still-pending sessions of an order as superseded (cancelled). */
  supersedePending(orderId, tx) {
    return this.client(tx).payment.updateMany({ where: { orderId, status: 'pending' }, data: { status: 'cancelled' } });
  }
}

class WebhookEventRepository extends BaseRepository {
  /**
   * Inserts the event; returns null if (provider, eventId) already exists.
   * The UNIQUE constraint – not an application check – is what makes replay safe.
   */
  async insertIfNew(data) {
    try {
      return await this.db.webhookEvent.create({ data });
    } catch (err) {
      if (err.code === 'P2002') return null;
      throw err;
    }
  }

  markStatus(id, status, error) {
    return this.db.webhookEvent.update({
      where: { id },
      data: { status, error: error || null, processedAt: new Date() },
    });
  }

  async list({ page, limit }) {
    const [items, total] = await this.db.$transaction([
      this.db.webhookEvent.findMany({ orderBy: { receivedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.db.webhookEvent.count(),
    ]);
    return { items, total };
  }
}

class ReservationRepository extends BaseRepository {
  createMany(rows, tx) {
    return this.client(tx).stockReservation.createMany({ data: rows });
  }

  activeForOrder(orderId, tx) {
    return this.client(tx).stockReservation.findMany({ where: { orderId, status: 'active' } });
  }

  /** Conditional status flip – only one caller can release/commit a reservation. */
  async setStatusIf(id, from, to, tx) {
    const res = await this.client(tx).stockReservation.updateMany({ where: { id, status: from }, data: { status: to } });
    return res.count;
  }
}

class NotificationRepository extends BaseRepository {
  create(data) {
    return this.db.notification.create({ data });
  }
}

module.exports = {
  paymentRepository: new PaymentRepository(),
  webhookEventRepository: new WebhookEventRepository(),
  reservationRepository: new ReservationRepository(),
  notificationRepository: new NotificationRepository(),
};
