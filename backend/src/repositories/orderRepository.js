'use strict';
const BaseRepository = require('./BaseRepository');

const detailInclude = {
  items: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' } },
  reservations: true,
  coupon: { select: { code: true, type: true, value: true } },
};

class OrderRepository extends BaseRepository {
  create(data, tx) {
    return this.client(tx).order.create({ data, include: detailInclude });
  }

  findByIdempotencyKey(userId, idempotencyKey, tx) {
    return this.client(tx).order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: detailInclude,
    });
  }

  findById(id, tx) {
    return this.client(tx).order.findUnique({ where: { id }, include: detailInclude });
  }

  findForUser(id, userId) {
    return this.db.order.findFirst({ where: { id, userId }, include: detailInclude });
  }

  async listForUser(userId, { page, limit, status }) {
    const where = { userId, ...(status ? { status } : {}) };
    const [items, total] = await this.db.$transaction([
      this.db.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: { select: { productName: true, quantity: true } } },
      }),
      this.db.order.count({ where }),
    ]);
    return { items, total };
  }

  async listAdmin({ page, limit, status, from, to, flagged }) {
    const where = {};
    if (status) where.status = status;
    if (flagged) where.paymentFlagged = flagged === 'true';
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const [items, total] = await this.db.$transaction([
      this.db.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, name: true, email: true } }, _count: { select: { items: true } } },
      }),
      this.db.order.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Compare-and-set status update: only succeeds if the order is still in
   * `fromStatus`. Protects against two workers (e.g. webhook + reconcile)
   * transitioning the same order concurrently. Returns rows affected.
   */
  async updateStatusIf(id, fromStatus, data, tx) {
    const res = await this.client(tx).order.updateMany({ where: { id, status: fromStatus }, data });
    return res.count;
  }

  update(id, data, tx) {
    return this.client(tx).order.update({ where: { id }, data });
  }

  addHistory(entry, tx) {
    return this.client(tx).orderStatusHistory.create({ data: entry });
  }

  /**
   * Unpaid orders that should be expired: either an active reservation has
   * passed its expiry, or the stock was already released (failed payment)
   * and the customer has not retried within the TTL.
   */
  findExpiredPending(now, cutoff, take = 50) {
    return this.db.order.findMany({
      where: {
        status: 'pending_payment',
        OR: [
          { reservations: { some: { status: 'active', expiresAt: { lt: now } } } },
          { reservations: { none: { status: 'active' } }, updatedAt: { lt: cutoff } },
        ],
      },
      select: { id: true },
      take,
    });
  }

  async dashboardStats() {
    const [paidAgg, pendingCount, flaggedCount, byStatus] = await this.db.$transaction([
      this.db.order.aggregate({
        where: { status: { in: ['paid', 'processing', 'shipped', 'delivered'] } },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
      this.db.order.count({ where: { status: 'pending_payment' } }),
      this.db.order.count({ where: { paymentFlagged: true } }),
      this.db.order.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);
    return {
      paidOrders: paidAgg._count._all,
      grossSalesCents: paidAgg._sum.totalCents || 0,
      pendingOrders: pendingCount,
      flaggedOrders: flaggedCount,
      ordersByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    };
  }

  recentFlagged(take = 10) {
    return this.db.order.findMany({
      where: { paymentFlagged: true },
      orderBy: { updatedAt: 'desc' },
      take,
      select: { id: true, orderNumber: true, status: true, totalCents: true, flagReason: true, updatedAt: true },
    });
  }
}

module.exports = new OrderRepository();
