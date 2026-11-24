'use strict';
const { api, prisma, resetDb, createUser, createCatalog, createCoupon, addToCart, checkout, stubExternalServices } = require('./helpers');

describe('Checkout pricing, coupons, idempotency and stock (L2-01, L2-02, L2-03, L2-08)', () => {
  let ext;
  let catalog;

  beforeEach(async () => {
    await resetDb();
    catalog = await createCatalog();
    ext = stubExternalServices();
  });
  afterEach(() => ext.restore());
  afterAll(() => prisma.$disconnect());

  test('tampered client prices/totals are ignored – server recomputes from the database', async () => {
    const u = await createUser();
    await addToCart(u.token, catalog.cpuAm5.id, 2);
    const res = await checkout(u.token, 'tamper-key-0001', { totalCents: 100, subtotalCents: 100, items: [{ productId: catalog.cpuAm5.id, priceCents: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.order.subtotalCents).toBe(2 * 1149500);
    expect(res.body.data.order.totalCents).toBe(2 * 1149500); // store pickup = free shipping
    expect(res.body.data.order.status).toBe('pending_payment');
    expect(res.body.data.checkoutUrl).toMatch(/^https:\/\/payments-web-sandbox\.paymaya\.com/);
    // the amount sent to Maya is the server total
    expect(ext.state.lastCheckoutBody.totalAmount.value).toBe(22990);
  });

  test('expired coupon returns 422 COUPON_EXPIRED and creates no order', async () => {
    const u = await createUser();
    await createCoupon({ code: 'OLD10', type: 'percentage', value: 10, expiresAt: new Date('2025-01-01') });
    await addToCart(u.token, catalog.gpu.id, 1);
    const res = await checkout(u.token, 'expired-coupon-01', { couponCode: 'OLD10' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_EXPIRED');
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: catalog.gpu.id } })).stock).toBe(4);
  });

  test('valid percentage coupon: discount computed on server, capped, rounded down', async () => {
    const u = await createUser();
    await createCoupon({ code: 'BAGUIO10', type: 'percentage', value: 10, maxDiscountCents: 300000, minSpendCents: 1000000, usageLimit: 5 });
    await addToCart(u.token, catalog.cpuAm5.id, 1);
    const preview = await api().post('/api/v1/checkout/preview').set('Authorization', `Bearer ${u.token}`).send({ couponCode: 'baguio10', shippingMethod: 'baguio_delivery' });
    expect(preview.status).toBe(200);
    expect(preview.body.data.discountCents).toBe(114950); // floor(1,149,500 * 10%)
    expect(preview.body.data.shippingFeeCents).toBe(15000); // ₱150 Baguio delivery below ₱15k
    expect(preview.body.data.totalCents).toBe(1149500 - 114950 + 15000);
  });

  test('min-spend not met returns 422 and does not change the total', async () => {
    const u = await createUser();
    await createCoupon({ code: 'BIG', type: 'fixed', value: 50000, minSpendCents: 5000000 });
    await addToCart(u.token, catalog.gpu.id, 1);
    const res = await api().post('/api/v1/checkout/preview').set('Authorization', `Bearer ${u.token}`).send({ couponCode: 'BIG' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_MIN_SPEND_NOT_MET');
  });

  test('repeating the same Idempotency-Key returns the SAME order, not a new one', async () => {
    const u = await createUser();
    await addToCart(u.token, catalog.gpu.id, 1);
    const first = await checkout(u.token, 'same-key-123456');
    const second = await checkout(u.token, 'same-key-123456');
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.data.order.id).toBe(first.body.data.order.id);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUnique({ where: { id: catalog.gpu.id } })).stock).toBe(3);
  });

  test('missing Idempotency-Key is rejected with 422', async () => {
    const u = await createUser();
    await addToCart(u.token, catalog.gpu.id, 1);
    const res = await api().post('/api/v1/orders').set('Authorization', `Bearer ${u.token}`)
      .send({ shippingMethod: 'store_pickup', shipping: { name: 'A B', phone: '09171234567', addressLine: '1 Road St', city: 'Baguio', province: 'Benguet', postalCode: '2600' } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  test('two simultaneous checkouts for the LAST unit: exactly one succeeds, one gets 409', async () => {
    const a = await createUser();
    const b = await createUser();
    await addToCart(a.token, catalog.lastUnit.id, 1);
    await addToCart(b.token, catalog.lastUnit.id, 1);
    const [r1, r2] = await Promise.all([checkout(a.token, 'race-key-aaaaaa'), checkout(b.token, 'race-key-bbbbbb')]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error.code).toBe('OUT_OF_STOCK');
    const p = await prisma.product.findUnique({ where: { id: catalog.lastUnit.id } });
    expect(p.stock).toBe(0);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.stockReservation.count({ where: { productId: p.id, status: 'active' } })).toBe(1);
  });

  test('adding more than available stock to the cart returns 409', async () => {
    const u = await createUser();
    const res = await addToCart(u.token, catalog.lastUnit.id, 2);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  test('a customer cannot read another customer\'s order (404) and cannot cancel a paid order (409)', async () => {
    const owner = await createUser();
    const other = await createUser();
    await addToCart(owner.token, catalog.gpu.id, 1);
    const { body } = await checkout(owner.token, 'owner-key-000001');
    const orderId = body.data.order.id;
    const peek = await api().get(`/api/v1/orders/${orderId}`).set('Authorization', `Bearer ${other.token}`);
    expect(peek.status).toBe(404);

    await prisma.order.update({ where: { id: orderId }, data: { status: 'paid' } });
    const cancel = await api().post(`/api/v1/orders/${orderId}/cancel`).set('Authorization', `Bearer ${owner.token}`);
    expect(cancel.status).toBe(409);
    expect(cancel.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
  });
});
