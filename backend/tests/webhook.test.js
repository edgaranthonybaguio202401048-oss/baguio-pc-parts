'use strict';
const { api, prisma, resetDb, createUser, createCatalog, addToCart, checkout, stubExternalServices, mayaWebhook } = require('./helpers');

describe('Maya webhook verification, idempotency and amount integrity (L2-05 … L2-09, S-07, S-08)', () => {
  let ext;
  let catalog;
  let user;
  let order;
  let payment;

  beforeEach(async () => {
    await resetDb();
    ext = stubExternalServices();
    catalog = await createCatalog();
    user = await createUser();
    await addToCart(user.token, catalog.gpu.id, 1);
    const res = await checkout(user.token, `wh-${Date.now()}`);
    order = res.body.data.order;
    payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
  });
  afterEach(() => ext.restore());
  afterAll(() => prisma.$disconnect());

  const successEvent = () => ({ id: payment.gatewayRef, status: 'PAYMENT_SUCCESS', requestReferenceNumber: payment.requestReference });

  test('invalid webhook token -> 401 and the order is unchanged', async () => {
    ext.state.payments[payment.gatewayRef] = { status: 'PAYMENT_SUCCESS', amount: 17995, currency: 'PHP' };
    const res = await mayaWebhook(successEvent(), { token: 'forged-token-xxxxxxxxx' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    const o = await prisma.order.findUnique({ where: { id: order.id } });
    expect(o.status).toBe('pending_payment');
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  test('verified webhook marks the order paid; replaying it changes nothing', async () => {
    ext.state.payments[payment.gatewayRef] = { status: 'PAYMENT_SUCCESS', amount: 17995, currency: 'PHP' };
    const first = await mayaWebhook(successEvent());
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ processed: true, outcome: 'paid' });

    const replay = await mayaWebhook(successEvent());
    expect(replay.status).toBe(200);
    expect(replay.body.data.duplicate).toBe(true);

    const o = await prisma.order.findUnique({ where: { id: order.id }, include: { statusHistory: true, payments: true } });
    expect(o.status).toBe('paid');
    expect(o.statusHistory.filter((h) => h.toStatus === 'paid')).toHaveLength(1);
    expect(o.payments.filter((p) => p.status === 'paid')).toHaveLength(1);
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(await prisma.stockReservation.count({ where: { orderId: order.id, status: 'committed' } })).toBe(1);
  });

  test('amount mismatch is flagged and NOT marked paid', async () => {
    ext.state.payments[payment.gatewayRef] = { status: 'PAYMENT_SUCCESS', amount: 1.0, currency: 'PHP' };
    const res = await mayaWebhook(successEvent());
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('flagged_amount_mismatch');
    const o = await prisma.order.findUnique({ where: { id: order.id } });
    expect(o.status).toBe('pending_payment');
    expect(o.paymentFlagged).toBe(true);
    expect(o.flagReason).toContain('expected 1799500 PHP');
    expect(o.flagReason).toContain('gateway reported 100 PHP');
  });

  test('webhook body is not trusted: "success" event while the gateway says pending changes nothing', async () => {
    // no entry in ext.state.payments -> Maya GET returns 404 -> pending
    const res = await mayaWebhook(successEvent());
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('pending');
    expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('pending_payment');
  });

  test('failed payment releases reserved stock and allows a retry session', async () => {
    ext.state.payments[payment.gatewayRef] = { status: 'PAYMENT_FAILED', amount: 17995, currency: 'PHP' };
    await mayaWebhook({ id: payment.gatewayRef, status: 'PAYMENT_FAILED' });
    expect((await prisma.product.findUnique({ where: { id: catalog.gpu.id } })).stock).toBe(4);
    expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('pending_payment');

    const retry = await api().post(`/api/v1/orders/${order.id}/payment-session`).set('Authorization', `Bearer ${user.token}`);
    expect(retry.status).toBe(201);
    expect(retry.body.data.checkoutUrl).toContain('chk-test-2');
    expect((await prisma.product.findUnique({ where: { id: catalog.gpu.id } })).stock).toBe(3);
  });

  test('missed webhook is recovered by the return-page verification endpoint', async () => {
    ext.state.payments[payment.gatewayRef] = { status: 'PAYMENT_SUCCESS', amount: 17995, currency: 'PHP' };
    const res = await api().post(`/api/v1/orders/${order.id}/verify-payment`).set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('paid');
    expect(res.body.data.order.status).toBe('paid');
  });

  test('unknown event types are acknowledged and ignored', async () => {
    const res = await mayaWebhook({ id: payment.gatewayRef, status: 'SOMETHING_NEW' });
    expect(res.status).toBe(200);
    expect(res.body.data.ignored).toBe(true);
  });
});
