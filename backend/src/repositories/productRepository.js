'use strict';
const BaseRepository = require('./BaseRepository');

const SORTS = Object.freeze({
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ priceCents: 'asc' }, { id: 'asc' }],
  price_desc: [{ priceCents: 'desc' }, { id: 'asc' }],
  name_asc: [{ name: 'asc' }, { id: 'asc' }],
});

const withCategory = { category: { select: { id: true, name: true, slug: true, componentType: true } } };

class ProductRepository extends BaseRepository {
  /** Builds a Prisma filter only from whitelisted, typed query fields (T-06). */
  buildWhere(q, { includeInactive = false } = {}) {
    const where = { deletedAt: null };
    if (!includeInactive) where.isActive = true;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { brand: { contains: q.search, mode: 'insensitive' } },
        { sku: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.category) where.category = { slug: q.category };
    if (q.componentType) where.category = { ...(where.category || {}), componentType: q.componentType };
    if (q.brand) where.brand = { equals: q.brand, mode: 'insensitive' };
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      where.priceCents = {};
      if (q.minPrice !== undefined) where.priceCents.gte = q.minPrice;
      if (q.maxPrice !== undefined) where.priceCents.lte = q.maxPrice;
    }
    if (q.inStock === 'true') where.stock = { gt: 0 };
    return where;
  }

  async list(q, opts) {
    const where = this.buildWhere(q, opts);
    const [items, total] = await this.db.$transaction([
      this.db.product.findMany({
        where,
        include: withCategory,
        orderBy: SORTS[q.sort] || SORTS.newest,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.product.count({ where }),
    ]);
    return { items, total };
  }

  findById(id, tx) {
    return this.client(tx).product.findUnique({ where: { id }, include: withCategory });
  }

  findActiveById(id, tx) {
    return this.client(tx).product.findFirst({ where: { id, isActive: true, deletedAt: null }, include: withCategory });
  }

  findManyByIds(ids, tx) {
    return this.client(tx).product.findMany({ where: { id: { in: ids } }, include: withCategory });
  }

  /** Candidate retrieval for the AI advisor: active, in stock, optional type + price ceiling. */
  findCandidates({ componentType, maxPriceCents, keywords = [], take = 6 }) {
    const where = { isActive: true, deletedAt: null, stock: { gt: 0 }, category: { componentType } };
    if (maxPriceCents) where.priceCents = { lte: maxPriceCents };
    if (keywords.length) {
      where.OR = keywords.flatMap((k) => [
        { name: { contains: k, mode: 'insensitive' } },
        { brand: { contains: k, mode: 'insensitive' } },
        { description: { contains: k, mode: 'insensitive' } },
      ]);
    }
    return this.db.product.findMany({ where, include: withCategory, orderBy: { priceCents: 'asc' }, take });
  }

  create(data) {
    return this.db.product.create({ data, include: withCategory });
  }

  update(id, data, tx) {
    return this.client(tx).product.update({ where: { id }, data, include: withCategory });
  }

  hardDelete(id) {
    return this.db.product.delete({ where: { id } });
  }

  countOrderItems(productId) {
    return this.db.orderItem.count({ where: { productId } });
  }

  /**
   * L2-03 atomic, conditional decrement. The WHERE clause re-checks stock in
   * the same statement, so Postgres's row lock guarantees that two concurrent
   * checkouts for the last unit cannot both succeed. Returns rows affected.
   */
  async decrementStockIfAvailable(productId, quantity, tx) {
    const result = await this.client(tx).product.updateMany({
      where: { id: productId, stock: { gte: quantity }, isActive: true, deletedAt: null },
      data: { stock: { decrement: quantity } },
    });
    return result.count;
  }

  incrementStock(productId, quantity, tx) {
    return this.client(tx).product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
      select: { id: true, stock: true },
    });
  }

  lowStock(threshold = 5, take = 20) {
    return this.db.product.findMany({
      where: { deletedAt: null, isActive: true, stock: { lte: threshold } },
      select: { id: true, sku: true, name: true, stock: true },
      orderBy: { stock: 'asc' },
      take,
    });
  }
}

module.exports = new ProductRepository();
