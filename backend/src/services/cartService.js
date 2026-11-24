'use strict';
const cartRepository = require('../repositories/cartRepository');
const productRepository = require('../repositories/productRepository');
const compatibility = require('./compatibilityService');
const { Errors } = require('../utils/errors');

const MAX_QTY_PER_LINE = 20;

/** Server-side cart (L1-05). Totals are always computed here, never accepted from the client. */
class CartService {
  constructor({ carts = cartRepository, products = productRepository } = {}) {
    this.carts = carts;
    this.products = products;
  }

  async loadLines(userId, tx) {
    const rows = await this.carts.listForUser(userId, tx);
    return rows.map((r) => ({ product: r.product, quantity: r.quantity }));
  }

  async get(userId) {
    const lines = await this.loadLines(userId);
    const items = lines.map(({ product: p, quantity }) => {
      const purchasable = p.isActive && !p.deletedAt;
      let issue = null;
      if (!purchasable) issue = 'PRODUCT_UNAVAILABLE';
      else if (p.stock < quantity) issue = 'INSUFFICIENT_STOCK';
      return {
        productId: p.id, sku: p.sku, name: p.name, brand: p.brand, imageUrl: p.imageUrl,
        componentType: p.category?.componentType,
        unitPriceCents: p.priceCents, quantity, lineTotalCents: p.priceCents * quantity,
        stock: p.stock, available: !issue, issue,
      };
    });
    return {
      items,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      subtotalCents: items.reduce((s, i) => s + i.lineTotalCents, 0),
      currency: 'PHP',
      compatibility: compatibility.evaluate(lines, { mode: 'cart' }),
    };
  }

  async ensureStock(productId, desiredQty) {
    const product = await this.products.findActiveById(productId);
    if (!product) throw Errors.notFound('Product');
    if (desiredQty > MAX_QTY_PER_LINE) {
      throw Errors.validation('QUANTITY_LIMIT', `Maximum ${MAX_QTY_PER_LINE} units per product`);
    }
    if (desiredQty > product.stock) {
      throw Errors.conflict('INSUFFICIENT_STOCK', `Only ${product.stock} unit(s) of ${product.name} available`, {
        productId, requested: desiredQty, available: product.stock,
      });
    }
    return product;
  }

  async add(userId, { productId, quantity }) {
    const existing = await this.carts.find(userId, productId);
    const desired = (existing?.quantity || 0) + quantity;
    await this.ensureStock(productId, desired);
    await this.carts.upsert(userId, productId, desired);
    return this.get(userId);
  }

  async update(userId, productId, quantity) {
    const existing = await this.carts.find(userId, productId);
    if (!existing) throw Errors.notFound('Cart item');
    await this.ensureStock(productId, quantity);
    await this.carts.upsert(userId, productId, quantity);
    return this.get(userId);
  }

  async remove(userId, productId) {
    const res = await this.carts.remove(userId, productId);
    if (res.count === 0) throw Errors.notFound('Cart item');
    return this.get(userId);
  }

  async clear(userId) {
    await this.carts.clear(userId);
  }
}

module.exports = CartService;
