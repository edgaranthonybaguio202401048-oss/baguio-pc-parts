'use strict';
const BaseRepository = require('./BaseRepository');

const itemInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true, sku: true, name: true, brand: true, priceCents: true, stock: true, imageUrl: true,
          specs: true, isActive: true, deletedAt: true,
          category: { select: { componentType: true, name: true } },
        },
      },
    },
    orderBy: { slot: 'asc' },
  },
};

class BuildRepository extends BaseRepository {
  listForUser(userId) {
    return this.db.build.findMany({ where: { userId }, include: itemInclude, orderBy: { updatedAt: 'desc' } });
  }

  countForUser(userId) {
    return this.db.build.count({ where: { userId } });
  }

  findForUser(id, userId) {
    return this.db.build.findFirst({ where: { id, userId }, include: itemInclude });
  }

  findPublicByShareCode(shareCode) {
    return this.db.build.findFirst({
      where: { shareCode, isPublic: true },
      include: { ...itemInclude, user: { select: { name: true } } },
    });
  }

  create({ userId, name, isPublic, shareCode, items }) {
    return this.db.build.create({
      data: { userId, name, isPublic, shareCode, items: { create: items } },
      include: itemInclude,
    });
  }

  async update(id, { name, isPublic, items }) {
    return this.db.$transaction(async (tx) => {
      if (items) {
        await tx.buildItem.deleteMany({ where: { buildId: id } });
        await tx.buildItem.createMany({ data: items.map((i) => ({ ...i, buildId: id })) });
      }
      return tx.build.update({
        where: { id },
        data: { ...(name !== undefined ? { name } : {}), ...(isPublic !== undefined ? { isPublic } : {}) },
        include: itemInclude,
      });
    });
  }

  delete(id) {
    return this.db.build.delete({ where: { id } });
  }
}

module.exports = new BuildRepository();
