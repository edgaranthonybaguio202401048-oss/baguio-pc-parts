'use strict';
const { api, prisma, resetDb, createUser, createCatalog, addToCart, checkout, stubExternalServices } = require('./helpers');

describe('Level 3 – compatibility engine, PC builds and order state machine', () => {
  let ext;
  let catalog;
  let user;

  beforeEach(async () => {
    await resetDb();
    catalog = await createCatalog();
    user = await createUser();
    ext = stubExternalServices();
  });
  afterEach(() => ext.restore());
  afterAll(() => prisma.$disconnect());

  test('compatibility check detects an AM5 CPU on an AM4 board', async () => {
    const res = await api().post('/api/v1/builds/compatibility-check').send({ items: [
      { slot: 'CPU', productId: catalog.cpuAm5.id },
      { slot: 'MOTHERBOARD', productId: catalog.boardAm4.id },
    ] });
    expect(res.status).toBe(200);
    expect(res.body.data.compatible).toBe(false);
    expect(res.body.data.errors.map((e) => e.code)).toContain('SOCKET_MISMATCH');
  });

  test('an incompatible build cannot be shared publicly (409) but can be saved privately', async () => {
    const items = [{ slot: 'CPU', productId: catalog.cpuAm5.id }, { slot: 'MOTHERBOARD', productId: catalog.boardAm4.id }];
    const pub = await api().post('/api/v1/builds').set('Authorization', `Bearer ${user.token}`).send({ name: 'Bad combo', isPublic: true, items });
    expect(pub.status).toBe(409);
    expect(pub.body.error.code).toBe('BUILD_INCOMPATIBLE');
    const priv = await api().post('/api/v1/builds').set('Authorization', `Bearer ${user.token}`).send({ name: 'Draft', isPublic: false, items });
    expect(priv.status).toBe(201);
    const toCart = await api().post(`/api/v1/builds/${priv.body.data.id}/add-to-cart`).set('Authorization', `Bearer ${user.token}`);
    expect(toCart.status).toBe(409);
  });

  test('checkout is blocked when the cart contains incompatible parts', async () => {
    await addToCart(user.token, catalog.cpuAm5.id, 1);
    await addToCart(user.token, catalog.boardAm4.id, 1);
    const res = await checkout(user.token, 'incompat-key-01');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CART_INCOMPATIBLE');
  });

  test('illegal order transition returns 409 and history is unchanged', async () => {
    const admin = await createUser('admin');
    await addToCart(user.token, catalog.gpu.id, 1);
    const { body } = await checkout(user.token, 'state-key-000001');
    const id = body.data.order.id;
    const res = await api().patch(`/api/v1/admin/orders/${id}/status`).set('Authorization', `Bearer ${admin.token}`).send({ status: 'shipped' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(await prisma.orderStatusHistory.count({ where: { orderId: id } })).toBe(1);
  });
});
