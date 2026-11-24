'use strict';
/**
 * STRATEGY (behavioral) – interchangeable discount algorithms.
 * Every strategy implements the same contract: calculate(subtotalCents, coupon) -> discountCents.
 * PricingService selects one at runtime from coupon.type; adding a new coupon
 * type (e.g. "buy-x-get-y") means adding a class here, not editing PricingService.
 */
class DiscountStrategy {
  // eslint-disable-next-line no-unused-vars
  calculate(_subtotalCents, _coupon) {
    throw new Error(`${this.constructor.name} must implement calculate()`);
  }

  clamp(discount, subtotalCents) {
    return Math.max(0, Math.min(discount, subtotalCents));
  }
}

class PercentageDiscount extends DiscountStrategy {
  calculate(subtotalCents, coupon) {
    // Rounded DOWN to the whole centavo (documented rounding rule)
    let d = Math.floor((subtotalCents * coupon.value) / 100);
    if (coupon.maxDiscountCents != null) d = Math.min(d, coupon.maxDiscountCents);
    return this.clamp(d, subtotalCents);
  }
}

class FixedAmountDiscount extends DiscountStrategy {
  calculate(subtotalCents, coupon) {
    return this.clamp(coupon.value, subtotalCents);
  }
}

const strategies = Object.freeze({
  percentage: new PercentageDiscount(),
  fixed: new FixedAmountDiscount(),
});

function discountStrategyFor(type) {
  const s = strategies[type];
  if (!s) throw new Error(`No discount strategy for type "${type}"`);
  return s;
}

module.exports = { DiscountStrategy, PercentageDiscount, FixedAmountDiscount, discountStrategyFor };
