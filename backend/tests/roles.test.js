'use strict';
const { api, prisma, resetDb, createUser, createCatalog } = require('./helpers');

describe('Role enforcement (L1-02, S-03)', () => {
  let customer;
  let admin;
  let catalog;

  beforeAll(async () => {
    await resetDb();
    customer = await createUser('customer');
    admin = await createUser('admin');
    catalog = await createCatalog();
  });
  afterAll(() => prisma.$disconnect());

  const adminCalls = () => [
    ['get', '/api/v1/admin/dashboard'],
    ['get', '/api/v1/admin/orders'],
    ['post', '/api/v1/admin/products'],
    ['post', `/api/v1/admin/products/${catalog.gpu.id}/stock-adjustments`],
    ['patch', '/api/v1/admin/orders/00000000-0000-4000-8000-000000000000/status'], // nested admin route
    ['get', '/api/v1/admin/webhook-events'],
  ];

  test('no token -> 401 on every admin endpoint', async () => {
    for (const [method, url] of adminCalls()) {
      const res = await api()[method](url).send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    }
  });

  test('customer token -> 403 on every admin endpoint', async () => {
    for (const [method, url] of adminCalls()) {
      const res = await api()[method](url).set('Authorization', `Bearer ${customer.token}`).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  test('admin token -> dashboard works and figures come from the database', async () => {
    const res = await api().get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ paidOrders: 0, grossSalesCents: 0, pendingOrders: 0 });
    expect(res.body.data.lowStock.map((p) => p.sku)).toContain('CPU-LAST');
  });

  test('admin stock adjustment is audited and cannot go negative', async () => {
    const auth = { Authorization: `Bearer ${admin.token}` };
    const ok = await api().post(`/api/v1/admin/products/${catalog.gpu.id}/stock-adjustments`).set(auth).send({ delta: 3, reason: 'Supplier delivery' });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ previousStock: 4, newStock: 7 });
    const bad = await api().post(`/api/v1/admin/products/${catalog.gpu.id}/stock-adjustments`).set(auth).send({ delta: -100, reason: 'Oops' });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('STOCK_WOULD_BE_NEGATIVE');
  });

  test('admin validation rejects negative price with 422', async () => {
    const res = await api().post('/api/v1/admin/products').set('Authorization', `Bearer ${admin.token}`).send({
      sku: 'NEG-1', name: 'Bad product', brand: 'X', description: 'Negative price test', priceCents: -5, stock: 1, categoryId: catalog.cats.CPU.id,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d) => d.field === 'priceCents')).toBe(true);
  });
});
