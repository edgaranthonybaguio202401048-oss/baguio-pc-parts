'use strict';
/**
 * STRATEGY – shipping fee algorithms, selected at runtime from the
 * customer's chosen shipping method. Same contract: fee(amountCents) -> cents.
 * Fees are computed on the subtotal AFTER discount.
 */
const php = (p) => p * 100;

class StorePickup {
  label() { return 'Pick up at Baguio PC Parts, Session Road'; }
  fee() { return 0; }
}

class BaguioDelivery {
  label() { return 'Delivery within Baguio City / La Trinidad'; }
  fee(amountCents) { return amountCents >= php(15000) ? 0 : php(150); }
}

class LuzonCourier {
  label() { return 'Courier delivery within Luzon'; }
  fee(amountCents) { return amountCents >= php(50000) ? 0 : php(350); }
}

const strategies = Object.freeze({
  store_pickup: new StorePickup(),
  baguio_delivery: new BaguioDelivery(),
  luzon_courier: new LuzonCourier(),
});

function shippingStrategyFor(method) {
  const s = strategies[method];
  if (!s) throw new Error(`No shipping strategy for "${method}"`);
  return s;
}

function shippingOptions() {
  return Object.entries(strategies).map(([method, s]) => ({ method, label: s.label() }));
}

module.exports = { shippingStrategyFor, shippingOptions, StorePickup, BaguioDelivery, LuzonCourier };
