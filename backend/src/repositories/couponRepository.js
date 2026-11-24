'use strict';
const BaseRepository = require('./BaseRepository');

class CouponRepository extends BaseRepository {
  findByCode(code, tx) {
    return this.client(tx).coupon.findUnique({ where: { code } });
  }

  countRedemptions(couponId, userId, tx) {
    return this.client(tx).couponRedemption.count({ where: { couponId, userId } });
  }

  /**
   * Atomic, conditional usage increment – refuses when the total usage limit
   * has been reached, even under concurrent checkouts.
   */
  async incrementUsageIfAvailable(coupon, tx) {
    const db = this.client(tx);
    if (coupon.usageLimit == null) {
      await db.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      return 1;
    }
    const res = await db.coupon.updateMany({
      where: { id: coupon.id, usedCount: { lt: coupon.usageLimit } },
      data: { usedCount: { increment: 1 } },
    });
    return res.count;
  }

  decrementUsage(couponId, tx) {
    return this.client(tx).coupon.updateMany({
      where: { id: couponId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  }

  createRedemption(data, tx) {
    return this.client(tx).couponRedemption.create({ data });
  }

  deleteRedemptionForOrder(orderId, tx) {
    return this.client(tx).couponRedemption.deleteMany({ where: { orderId } });
  }

  list() {
    return this.db.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findById(id) {
    return this.db.coupon.findUnique({ where: { id } });
  }

  create(data) {
    return this.db.coupon.create({ data });
  }

  update(id, data) {
    return this.db.coupon.update({ where: { id }, data });
  }

  countOrders(id) {
    return this.db.order.count({ where: { couponId: id } });
  }

  delete(id) {
    return this.db.coupon.delete({ where: { id } });
  }
}

module.exports = new CouponRepository();
