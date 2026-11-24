'use strict';
/**
 * Shared integration-test helpers. Tests talk to the real Express app over
 * HTTP (Supertest) against a real Postgres test database. Only the two
 * EXTERNAL services – Maya and the AI provider – are replaced with a fetch
 * stub, because the test suite must not hit the internet.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/config/database');
const { resetPaymentProviders } = require('../src/patterns/payment/PaymentProviderFactory');
const { resetAiProvider } = require('../src/patterns/ai/AiProviderFactory');

const api = () => request(app);
const WEBHOOK_TOKEN = process.env.MAYA_WEBHOOK_TOKEN || 'test-webhook-token';

async function resetDb() {
  const tables = ['Notification', 'BuildItem', 'Build', 'WebhookEvent', 'Payment', 'StockReservation',
    'OrderStatusHistory', 'OrderItem', 'CouponRedemption', 'Order', 'CartItem', 'InventoryAdjustment',
    'Coupon', 'Product', 'Category', 'User'];
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  resetPaymentProviders();
  resetAiProvider();
}

// ------------------------------------------------------------------ fixtures
let seq = 0;
async function createUser(role = 'customer') {
  seq += 1;
  const email = `${role}${seq}@test.local`;
  const password = 'Passw0rd!';
  await prisma.user.create({ data: { email, name: `Test ${role} ${seq}`, role, passwordHash: await bcrypt.hash(password, 4) } });
  const res = await api().post('/api/v1/auth/login').send({ email, password });
  return { email, password, token: res.body.data.token, id: res.body.data.user.id };
}

async function createCatalog() {
  const cats = {};
  for (const [slug, componentType] of [['processors', 'CPU'], ['motherboards', 'MOTHERBOARD'], ['memory', 'RAM'], ['graphics-cards', 'GPU']]) {
    cats[componentType] = await prisma.category.create({ data: { name: slug, slug, componentType } });
  }
  const mk = (sku, name, type, price, stock, specs) => prisma.product.create({ data: {
    sku, name, slug: sku.toLowerCase(), brand: 'Test', description: `${name} description`, priceCents: price, stock,
    specs, categoryId: cats[type].id,
  } });
  return {
    cats,
    cpuAm5: await mk('CPU-AM5', 'Ryzen 5 7600', 'CPU', 1149500, 10, { socket: 'AM5', tdpWatts: 65, memoryType: 'DDR5', integratedGraphics: true }),
    lastUnit: await mk('CPU-LAST', 'Ryzen 7 7800X3D', 'CPU', 2499500, 1, { socket: 'AM5', tdpWatts: 120, memoryType: 'DDR5', integratedGraphics: true }),
    boardAm4: await mk('MB-AM4', 'B550M DS3H', 'MOTHERBOARD', 549500, 5, { socket: 'AM4', memoryType: 'DDR4', formFactor: 'mATX', ramSlots: 4 }),
    boardAm5: await mk('MB-AM5', 'B650M Gaming', 'MOTHERBOARD', 949500, 5, { socket: 'AM5', memoryType: 'DDR5', formFactor: 'mATX', ramSlots: 4 }),
    gpu: await mk('GPU-4060', 'RTX 4060', 'GPU', 1799500, 4, { tdpWatts: 115, lengthMm: 199, recommendedPsuWatts: 550 }),
  };
}

function createCoupon(data) {
  return prisma.coupon.create({ data: { perCustomerLimit: 1, minSpendCents: 0, isActive: true, ...data } });
}

const shipping = {
  name: 'Juan Dela Cruz', phone: '09171234567', addressLine: '12 Session Road',
  city: 'Baguio City', province: 'Benguet', postalCode: '2600',
};

async function addToCart(token, productId, quantity = 1) {
  return api().post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`).send({ productId, quantity });
}

function checkout(token, key, body = {}) {
  return api().post('/api/v1/orders').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
    .send({ shippingMethod: 'store_pickup', shipping, ...body });
}

// ------------------------------------------------------------------ external service stub
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

/**
 * Installs a global fetch stub.
 *  gateway.payments[checkoutId] = { status, amount, currency } controls GET Payment
 *  ai.handler(url, init) controls the AI provider reply (default: network error)
 */
function stubExternalServices() {
  const state = { counter: 0, payments: {}, ai: { handler: null }, calls: [] };
  const spy = jest.spyOn(global, 'fetch').mockImplementation(async (url, init = {}) => {
    const u = String(url);
    state.calls.push(u);
    if (u.includes('/checkout/v1/checkouts')) {
      state.counter += 1;
      const id = `chk-test-${state.counter}`;
      state.lastCheckoutBody = JSON.parse(init.body);
      return jsonResponse(200, { checkoutId: id, redirectUrl: `https://payments-web-sandbox.paymaya.com/v2/checkout?id=${id}` });
    }
    const m = u.match(/\/payments\/v1\/payments\/([^/?]+)/);
    if (m) {
      const p = state.payments[decodeURIComponent(m[1])];
      return p ? jsonResponse(200, { id: m[1], ...p }) : jsonResponse(404, { error: 'not found' });
    }
    if (u.includes('generativelanguage.googleapis.com') || u.includes('api.openai.com')) {
      if (state.ai.handler) return state.ai.handler(u, init);
      throw Object.assign(new Error('network down'), { name: 'TypeError' });
    }
    throw new Error(`Unexpected outbound request in test: ${u}`);
  });
  return { state, restore: () => spy.mockRestore() };
}

function mayaWebhook(body, { token = WEBHOOK_TOKEN } = {}) {
  return api().post(`/api/v1/webhooks/maya?token=${encodeURIComponent(token)}`)
    .set('Content-Type', 'application/json').send(JSON.stringify(body));
}

module.exports = {
  api, prisma, resetDb, createUser, createCatalog, createCoupon, shipping, addToCart, checkout,
  stubExternalServices, jsonResponse, mayaWebhook,
};
