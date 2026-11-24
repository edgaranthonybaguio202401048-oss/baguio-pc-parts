'use strict';
const config = require('../../config');
const MayaProvider = require('./MayaProvider');
const PayMongoProvider = require('./PayMongoProvider');

/**
 * FACTORY METHOD (creational).
 * PaymentService asks for "a PaymentProvider" and never names a concrete
 * class, so switching gateways is a configuration change
 * (PAYMENT_PROVIDER=maya|paymongo), not a code change. Webhook routes ask
 * for a specific provider by name. Instances are cached per name.
 */
const registry = {
  maya: () => new MayaProvider(config.payment.maya),
  paymongo: () => new PayMongoProvider(config.payment.paymongo),
};

const cache = new Map();

function createPaymentProvider(name = config.payment.provider) {
  const make = registry[name];
  if (!make) throw new Error(`Unknown payment provider: ${name}`);
  if (!cache.has(name)) cache.set(name, make());
  return cache.get(name);
}

/** Test hook – lets integration tests inject a fetch stub. */
function resetPaymentProviders() {
  cache.clear();
}

module.exports = { createPaymentProvider, resetPaymentProviders, supportedProviders: Object.keys(registry) };
