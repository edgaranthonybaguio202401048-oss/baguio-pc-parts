'use strict';
const BaseRepository = require('./BaseRepository');

class CategoryRepository extends BaseRepository {
  list() {
    return this.db.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { isActive: true, deletedAt: null } } } } },
    });
  }

  findById(id) {
    return this.db.category.findUnique({ where: { id } });
  }

  create(data) {
    return this.db.category.create({ data });
  }

  update(id, data) {
    return this.db.category.update({ where: { id }, data });
  }
}

class InventoryRepository extends BaseRepository {
  record(entry, tx) {
    return this.client(tx).inventoryAdjustment.create({ data: entry });
  }

  listForProduct(productId, take = 50) {
    return this.db.inventoryAdjustment.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { actor: { select: { id: true, name: true, email: true } } },
    });
  }
}

module.exports = {
  categoryRepository: new CategoryRepository(),
  inventoryRepository: new InventoryRepository(),
};
