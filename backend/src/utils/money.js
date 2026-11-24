'use strict';
/**
 * Money helpers. All amounts are integer centavos.
 *
 * ROUNDING RULE (documented in docs/business-rules.md):
 *  - Percentage discounts are computed as floor(subtotal * percent / 100),
 *    i.e. rounded DOWN to the whole centavo, then capped by maxDiscountCents.
 *  - A discount can never exceed the subtotal.
 *  - Gateway amounts (decimal pesos, e.g. "1234.50") are converted with
 *    Math.round(Number(x) * 100) to absorb binary floating-point noise.
 */

function assertCents(value, name = 'amount') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer number of centavos`);
  }
  return value;
}

const pesosToCents = (pesos) => Math.round(Number(pesos) * 100);
const centsToPesos = (cents) => Number((assertCents(cents) / 100).toFixed(2));
const formatPhp = (cents) =>
  `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

module.exports = { assertCents, pesosToCents, centsToPesos, formatPhp };
