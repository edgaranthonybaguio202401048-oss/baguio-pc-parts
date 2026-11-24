'use strict';
const couponRepository = require('../repositories/couponRepository');
const { discountStrategyFor } = require('../patterns/discount/discountStrategies');
const { shippingStrategyFor } = require('../patterns/shipping/shippingStrategies');
const { Errors } = require('../utils/errors');
const { formatPhp } = require('../utils/money');

/**
 * PricingService – the ONLY place totals are calculated (L2-02).
 * Inputs are product records loaded from the database; nothing the client
 * sends (prices, discounts, totals) is ever read.
 * Composed of: CouponRepository + Discount strategies + Shipping strategies.
 */
class PricingService {
  constructor({ coupons = couponRepository } = {}) {
    this.coupons = coupons;
  }

  /** lines: [{ product, quantity }] with product loaded from the DB. */
  priceLines(lines) {
    return lines.map(({ product, quantity }) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity,
      lineTotalCents: product.priceCents * quantity,
    }));
  }

  /**
   * Validates a coupon against every rule and returns it, or throws 422
   * with a specific code. The total is never changed by an invalid coupon.
   */
  async validateCoupon(code, { userId, subtotalCents, now = new Date(), tx }) {
    const coupon = await this.coupons.findByCode(code, tx);
    if (!coupon) throw Errors.validation('COUPON_NOT_FOUND', `Coupon ${code} does not exist`);
    if (!coupon.isActive) throw Errors.validation('COUPON_INACTIVE', `Coupon ${code} is not active`);
    if (coupon.startsAt && coupon.startsAt > now) throw Errors.validation('COUPON_NOT_STARTED', `Coupon ${code} is not valid yet`);
    if (coupon.expiresAt && coupon.expiresAt < now) throw Errors.validation('COUPON_EXPIRED', `Coupon ${code} has expired`);
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      throw Errors.validation('COUPON_EXHAUSTED', `Coupon ${code} has reached its usage limit`);
    }
    if (subtotalCents < coupon.minSpendCents) {
      throw Errors.validation('COUPON_MIN_SPEND_NOT_MET',
        `Coupon ${code} requires a minimum spend of ${formatPhp(coupon.minSpendCents)}`,
        { minSpendCents: coupon.minSpendCents, subtotalCents });
    }
    const used = await this.coupons.countRedemptions(coupon.id, userId, tx);
    if (used >= coupon.perCustomerLimit) {
      throw Errors.validation('COUPON_CUSTOMER_LIMIT_REACHED', `You have already used coupon ${code}`);
    }
    return coupon;
  }

  async quote({ lines, couponCode, userId, shippingMethod, tx }) {
    const priced = this.priceLines(lines);
    const subtotalCents = priced.reduce((s, l) => s + l.lineTotalCents, 0);

    let coupon = null;
    let discountCents = 0;
    if (couponCode) {
      coupon = await this.validateCoupon(couponCode, { userId, subtotalCents, tx });
      discountCents = discountStrategyFor(coupon.type).calculate(subtotalCents, coupon);
    }

    const afterDiscount = subtotalCents - discountCents;
    const shippingFeeCents = shippingStrategyFor(shippingMethod).fee(afterDiscount);
    const totalCents = afterDiscount + shippingFeeCents;

    return {
      lines: priced,
      subtotalCents,
      discountCents,
      shippingFeeCents,
      totalCents,
      currency: 'PHP',
      shippingMethod,
      coupon: coupon ? { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value, usageLimit: coupon.usageLimit, usedCount: coupon.usedCount } : null,
    };
  }
}

module.exports = PricingService;
