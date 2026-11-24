'use strict';
const { Errors } = require('../utils/errors');

/**
 * L2-04 Order lifecycle – the single source of truth for legal transitions
 * and WHO may perform them.
 *
 *   pending_payment ──paid──▶ paid ──▶ processing ──▶ shipped ──▶ delivered
 *        │  (gateway/system)     (admin)      (admin)       (admin)
 *        ├──cancelled (customer/admin)
 *        └──expired   (system: reservation timed out)
 *   cancelled/expired ──paid──▶ only by the gateway when a verified late
 *                               payment arrives AND stock can be re-reserved
 * Anything else -> 409 ILLEGAL_TRANSITION.
 */
const TRANSITIONS = Object.freeze({
  pending_payment: { paid: ['gateway', 'system'], cancelled: ['customer', 'admin', 'system'], expired: ['system'] },
  paid: { processing: ['admin'] },
  processing: { shipped: ['admin'] },
  shipped: { delivered: ['admin'] },
  delivered: {},
  cancelled: { paid: ['gateway'] },
  expired: { paid: ['gateway'] },
});

function canTransition(from, to, actorType) {
  const actors = TRANSITIONS[from]?.[to];
  return Boolean(actors && actors.includes(actorType));
}

function assertTransition(from, to, actorType) {
  if (!canTransition(from, to, actorType)) {
    throw Errors.conflict('ILLEGAL_TRANSITION', `Cannot change order from ${from} to ${to} as ${actorType}`, {
      from, to, allowed: Object.keys(TRANSITIONS[from] || {}).filter((t) => TRANSITIONS[from][t].includes(actorType)),
    });
  }
}

const PAID_STATES = Object.freeze(['paid', 'processing', 'shipped', 'delivered']);

module.exports = { TRANSITIONS, canTransition, assertTransition, PAID_STATES };
