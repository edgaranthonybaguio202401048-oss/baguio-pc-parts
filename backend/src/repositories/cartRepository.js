'use strict';
const BaseRepository = require('./BaseRepository');

const productFields = {
  select: {
    id: true, sku: true, name: true, brand: true, priceCents: true, stock: true, imageUrl: true,
    isActive: true, deletedAt: true, specs: true,
    category: { select: { name: true, slug: true, componentType: true } },
  },
};

class CartRepository extends BaseRepository {
  listForUser(userId, tx) {
    return this.client(tx).cartItem.findMany({
      where: { userId },
      include: { product: productFields },
      orderBy: { createdAt: 'asc' },
    });
  }

  find(userId, productId) {
    return this.db.cartItem.findUnique({ where: { userId_productId: { userId, productId } } });
  }

  upsert(userId, productId, quantity) {
    return this.db.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, quantity },
      update: { quantity },
    });
  }

  remove(userId, productId) {
    return this.db.cartItem.deleteMany({ where: { userId, productId } });
  }

  clear(userId, tx) {
    return this.client(tx).cartItem.deleteMany({ where: { userId } });
  }
}

module.exports = new CartRepository();
