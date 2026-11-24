'use strict';
const prisma = require('../config/database');
const config = require('../config');
const productRepository = require('../repositories/productRepository');
const { inventoryRepository } = require('../repositories/catalogRepository');
const { reservationRepository } = require('../repositories/paymentRepository');
const { Errors } = require('../utils/errors');

/**
 * InventoryService – stock reservation (L2-03) and audited adjustments (L1-10).
 *
 * Reservation model: stock is decremented atomically AT CHECKOUT and a
 * StockReservation row (order, product, qty, expiresAt) records the hold.
 *   - payment verified          -> reservation 'committed' (stock stays sold)
 *   - failed/cancelled/expired  -> reservation 'released'  (stock returned)
 * Every movement writes an InventoryAdjustment row (previous, new, reason, actor).
 */
class InventoryService {
  constructor({ products = productRepository, inventory = inventoryRepository, reservations = reservationRepository, db = prisma } = {}) {
    this.products = products;
    this.inventory = inventory;
    this.reservations = reservations;
    this.db = db;
  }

  expiryFromNow() {
    return new Date(Date.now() + config.payment.reservationTtlMinutes * 60 * 1000);
  }

  /** Must be called inside a transaction (tx). Throws 409 OUT_OF_STOCK and the caller's tx rolls back. */
  async reserve(orderId, lines, tx) {
    const expiresAt = this.expiryFromNow();
    // Sort by productId so concurrent multi-item checkouts lock rows in the same order (no deadlocks)
    const sorted = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));
    for (const line of sorted) {
      const affected = await this.products.decrementStockIfAvailable(line.productId, line.quantity, tx);
      if (affected === 0) {
        throw Errors.conflict('OUT_OF_STOCK', `Not enough stock for ${line.name}`, { productId: line.productId, requested: line.quantity });
      }
      const after = await tx.product.findUnique({ where: { id: line.productId }, select: { stock: true } });
      await this.inventory.record({
        productId: line.productId, previousStock: after.stock + line.quantity, newStock: after.stock,
        delta: -line.quantity, reason: 'Reserved at checkout', actorType: 'system', orderId,
      }, tx);
    }
    await this.reservations.createMany(sorted.map((l) => ({ orderId, productId: l.productId, quantity: l.quantity, expiresAt })), tx);
    return expiresAt;
  }

  /** Releases every ACTIVE reservation of an order exactly once and returns stock. */
  async release(orderId, reason, tx) {
    const active = await this.reservations.activeForOrder(orderId, tx);
    for (const r of active) {
      const flipped = await this.reservations.setStatusIf(r.id, 'active', 'released', tx);
      if (!flipped) continue; // someone else released it already
      const p = await this.products.incrementStock(r.productId, r.quantity, tx);
      await this.inventory.record({
        productId: r.productId, previousStock: p.stock - r.quantity, newStock: p.stock,
        delta: r.quantity, reason, actorType: 'system', orderId,
      }, tx);
    }
    return active.length;
  }

  async commit(orderId, tx) {
    const active = await this.reservations.activeForOrder(orderId, tx);
    for (const r of active) await this.reservations.setStatusIf(r.id, 'active', 'committed', tx);
    return active.length;
  }

  async hasActiveReservations(orderId, tx) {
    return (await this.reservations.activeForOrder(orderId, tx)).length > 0;
  }

  /** Admin stock adjustment – atomic, never negative, fully audited. */
  async adjust(productId, { delta, reason }, actorId) {
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, stock: true, deletedAt: true } });
      if (!product || product.deletedAt) throw Errors.notFound('Product');
      const res = await tx.product.updateMany({
        where: { id: productId, ...(delta < 0 ? { stock: { gte: -delta } } : {}) },
        data: { stock: { increment: delta } },
      });
      if (res.count === 0) {
        throw Errors.conflict('STOCK_WOULD_BE_NEGATIVE', 'Stock cannot become negative', { current: product.stock, delta });
      }
      const after = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } });
      const entry = await this.inventory.record({
        productId, previousStock: after.stock - delta, newStock: after.stock, delta, reason, actorType: 'admin', actorId,
      }, tx);
      return { productId, previousStock: entry.previousStock, newStock: entry.newStock, adjustment: entry };
    });
  }

  history(productId) {
    return this.inventory.listForProduct(productId);
  }
}

module.exports = InventoryService;
