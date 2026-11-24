'use strict';
const prisma = require('../config/database');
const productRepository = require('../repositories/productRepository');
const { categoryRepository } = require('../repositories/catalogRepository');
const { Errors } = require('../utils/errors');
const { pageMeta } = require('../utils/response');
const dto = require('../utils/dto');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

class ProductService {
  constructor({ products = productRepository, categories = categoryRepository, db = prisma } = {}) {
    this.products = products;
    this.categories = categories;
    this.db = db;
  }

  async list(q, { admin = false } = {}) {
    const { items, total } = await this.products.list(q, { includeInactive: admin });
    return { items: items.map(dto.product), meta: pageMeta(total, q.page, q.limit) };
  }

  async getPublic(id) {
    const p = await this.products.findActiveById(id);
    if (!p) throw Errors.notFound('Product');
    return dto.product(p);
  }

  async getAdmin(id) {
    const p = await this.products.findById(id);
    if (!p || p.deletedAt) throw Errors.notFound('Product');
    return dto.product(p);
  }

  async assertCategory(categoryId) {
    if (categoryId && !(await this.categories.findById(categoryId))) {
      throw Errors.validation('CATEGORY_NOT_FOUND', 'Category does not exist', [{ field: 'categoryId', message: 'unknown category' }]);
    }
  }

  async create(body) {
    await this.assertCategory(body.categoryId);
    const created = await this.products.create({ ...body, slug: `${slugify(body.name)}-${body.sku.toLowerCase()}` });
    return dto.product(created);
  }

  async update(id, body) {
    await this.getAdmin(id);
    await this.assertCategory(body.categoryId);
    return dto.product(await this.products.update(id, body));
  }

  /**
   * L1-09: a product that appears in any order, build, reservation or stock
   * audit is SOFT deleted (hidden, history preserved). Only a never-used
   * product is hard deleted. Returns 'soft' | 'hard'.
   */
  async remove(id) {
    await this.getAdmin(id);
    const refs = await this.db.$transaction([
      this.db.orderItem.count({ where: { productId: id } }),
      this.db.buildItem.count({ where: { productId: id } }),
      this.db.stockReservation.count({ where: { productId: id } }),
      this.db.inventoryAdjustment.count({ where: { productId: id } }),
    ]);
    if (refs.some((n) => n > 0)) {
      await this.db.$transaction([
        this.db.cartItem.deleteMany({ where: { productId: id } }),
        this.db.product.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }),
      ]);
      return 'soft';
    }
    await this.db.$transaction([
      this.db.cartItem.deleteMany({ where: { productId: id } }),
      this.db.product.delete({ where: { id } }),
    ]);
    return 'hard';
  }

  async categoriesList() {
    const cats = await this.categories.list();
    return cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, componentType: c.componentType, productCount: c._count.products }));
  }

  createCategory(body) { return this.categories.create(body); }

  async updateCategory(id, body) {
    if (!(await this.categories.findById(id))) throw Errors.notFound('Category');
    return this.categories.update(id, body);
  }
}

module.exports = ProductService;
