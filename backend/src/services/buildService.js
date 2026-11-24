'use strict';
const crypto = require('crypto');
const prisma = require('../config/database');
const config = require('../config');
const buildRepository = require('../repositories/buildRepository');
const productRepository = require('../repositories/productRepository');
const compatibility = require('./compatibilityService');
const { Errors } = require('../utils/errors');

/**
 * LEVEL 3 – Saved PC Builds ("Build Planner").
 * Business rules (docs/business-rules.md, L3-B):
 *  B1 max 10 saved builds per customer                      -> 409 BUILD_LIMIT_REACHED
 *  B2 every part must be an active product in the right slot -> 422 / SLOT_TYPE_MISMATCH
 *  B3 a build can be made PUBLIC (shareable) only if it has
 *     zero compatibility errors                              -> 409 BUILD_INCOMPATIBLE
 *  B4 "add build to cart" requires zero compatibility errors
 *     and enough stock for every part                        -> 409 BUILD_INCOMPATIBLE / OUT_OF_STOCK
 *  B5 builds are private to their owner; shared view exposes
 *     only the owner's first name                            -> 404 for others
 */
const MAX_BUILDS = 10;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function shareCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

class BuildService {
  constructor({ builds = buildRepository, products = productRepository, db = prisma } = {}) {
    this.builds = builds;
    this.products = products;
    this.db = db;
  }

  async resolve(items) {
    const ids = [...new Set(items.map((i) => i.productId))];
    const found = await this.products.findManyByIds(ids);
    const byId = new Map(found.filter((p) => p.isActive && !p.deletedAt).map((p) => [p.id, p]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw Errors.validation('PRODUCT_NOT_FOUND', 'Some parts do not exist or are no longer sold', missing.map((id) => ({ field: 'items.productId', message: id })));
    }
    return items.map((i) => ({ slot: i.slot, quantity: i.quantity ?? 1, product: byId.get(i.productId) }));
  }

  summarize(lines) {
    return {
      totalCents: lines.reduce((s, l) => s + l.product.priceCents * l.quantity, 0),
      compatibility: compatibility.evaluate(lines, { mode: 'build' }),
    };
  }

  toDto(build, { publicView = false } = {}) {
    const lines = build.items.map((i) => ({ slot: i.slot, quantity: i.quantity, product: i.product }));
    const { totalCents, compatibility: report } = this.summarize(lines);
    return {
      id: publicView ? undefined : build.id,
      name: build.name,
      isPublic: build.isPublic,
      shareCode: build.isPublic ? build.shareCode : null,
      shareUrl: build.isPublic ? `${config.frontendUrl}/builds/shared/${build.shareCode}` : null,
      owner: publicView && build.user ? build.user.name.split(' ')[0] : undefined,
      items: build.items.map((i) => ({
        slot: i.slot, quantity: i.quantity,
        product: {
          id: i.product.id, name: i.product.name, brand: i.product.brand, sku: i.product.sku,
          priceCents: i.product.priceCents, stock: i.product.stock, imageUrl: i.product.imageUrl,
          available: i.product.isActive && !i.product.deletedAt && i.product.stock >= i.quantity,
        },
      })),
      totalCents,
      currency: 'PHP',
      compatibility: report,
      createdAt: build.createdAt,
      updatedAt: build.updatedAt,
    };
  }

  async check(items) {
    const lines = await this.resolve(items);
    const { totalCents, compatibility: report } = this.summarize(lines);
    return { totalCents, currency: 'PHP', ...report };
  }

  async list(userId) {
    return (await this.builds.listForUser(userId)).map((b) => this.toDto(b));
  }

  async get(userId, id) {
    const b = await this.builds.findForUser(id, userId);
    if (!b) throw Errors.notFound('Build');
    return this.toDto(b);
  }

  async getShared(code) {
    const b = await this.builds.findPublicByShareCode(code);
    if (!b) throw Errors.notFound('Build');
    return this.toDto(b, { publicView: true });
  }

  async create(userId, { name, isPublic, items }) {
    if ((await this.builds.countForUser(userId)) >= MAX_BUILDS) {
      throw Errors.conflict('BUILD_LIMIT_REACHED', `You can save up to ${MAX_BUILDS} builds – delete one first`);
    }
    const lines = await this.resolve(items);
    const report = compatibility.evaluate(lines, { mode: 'build' });
    if (report.errors.some((e) => e.code === 'SLOT_TYPE_MISMATCH' || e.code === 'DUPLICATE_SLOT')) {
      throw Errors.validation('BUILD_INVALID_SLOTS', 'Parts are in the wrong slots', report.errors);
    }
    if (isPublic && !report.compatible) {
      throw Errors.conflict('BUILD_INCOMPATIBLE', 'Only compatible builds can be shared publicly', report.errors);
    }
    const b = await this.builds.create({ userId, name, isPublic, shareCode: shareCode(), items: items.map((i) => ({ slot: i.slot, productId: i.productId, quantity: i.quantity ?? 1 })) });
    return this.toDto(b);
  }

  async update(userId, id, body) {
    const current = await this.builds.findForUser(id, userId);
    if (!current) throw Errors.notFound('Build');
    const items = body.items || current.items.map((i) => ({ slot: i.slot, productId: i.productId, quantity: i.quantity }));
    const lines = await this.resolve(items);
    const report = compatibility.evaluate(lines, { mode: 'build' });
    if (report.errors.some((e) => e.code === 'SLOT_TYPE_MISMATCH' || e.code === 'DUPLICATE_SLOT')) {
      throw Errors.validation('BUILD_INVALID_SLOTS', 'Parts are in the wrong slots', report.errors);
    }
    const willBePublic = body.isPublic ?? current.isPublic;
    if (willBePublic && !report.compatible) {
      throw Errors.conflict('BUILD_INCOMPATIBLE', 'Only compatible builds can be shared publicly', report.errors);
    }
    const b = await this.builds.update(id, { name: body.name, isPublic: body.isPublic, items: body.items });
    return this.toDto(b);
  }

  async remove(userId, id) {
    const b = await this.builds.findForUser(id, userId);
    if (!b) throw Errors.notFound('Build');
    await this.builds.delete(id);
  }

  /** B4 – copies every part into the cart in one transaction (all-or-nothing). */
  async addToCart(userId, id) {
    const b = await this.builds.findForUser(id, userId);
    if (!b) throw Errors.notFound('Build');
    const lines = b.items.map((i) => ({ slot: i.slot, quantity: i.quantity, product: i.product }));
    const report = compatibility.evaluate(lines, { mode: 'build' });
    if (!report.compatible) throw Errors.conflict('BUILD_INCOMPATIBLE', 'Fix compatibility errors before adding this build to your cart', report.errors);

    await this.db.$transaction(async (tx) => {
      const shortages = [];
      for (const l of lines) {
        const p = await tx.product.findUnique({ where: { id: l.product.id } });
        const inCart = await tx.cartItem.findUnique({ where: { userId_productId: { userId, productId: p.id } } });
        const desired = (inCart?.quantity || 0) + l.quantity;
        if (!p.isActive || p.deletedAt || p.stock < desired) {
          shortages.push({ productId: p.id, name: p.name, requested: desired, available: p.isActive && !p.deletedAt ? p.stock : 0 });
          continue;
        }
        await tx.cartItem.upsert({
          where: { userId_productId: { userId, productId: p.id } },
          create: { userId, productId: p.id, quantity: desired },
          update: { quantity: desired },
        });
      }
      if (shortages.length) throw Errors.conflict('OUT_OF_STOCK', 'Some parts of this build are out of stock', shortages);
    });
    return { added: lines.length };
  }
}

module.exports = BuildService;
