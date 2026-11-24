'use strict';
const jwt = require('jsonwebtoken');
const { api, prisma, resetDb, createUser } = require('./helpers');

describe('Authentication (L1-01, S-01, S-02, S-05)', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  const body = { name: 'Ana Reyes', email: 'ana@test.local', password: 'Secret123' };

  test('register returns 201 + token and stores only a bcrypt hash', async () => {
    const res = await api().post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.role).toBe('customer');
    const row = await prisma.user.findUnique({ where: { email: body.email } });
    expect(row.passwordHash).not.toContain('Secret123');
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test('duplicate email returns 409 EMAIL_TAKEN', async () => {
    await api().post('/api/v1/auth/register').send(body);
    const res = await api().post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.requestId).toEqual(expect.any(String));
  });

  test('wrong password and unknown email both return the same generic 401', async () => {
    await api().post('/api/v1/auth/register').send(body);
    const wrong = await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Nope12345' });
    const unknown = await api().post('/api/v1/auth/login').send({ email: 'ghost@test.local', password: 'Nope12345' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  test('operator-injection object in login is rejected with 422, not a bypass', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  test('unknown fields are rejected (role escalation attempt)', async () => {
    const res = await api().post('/api/v1/auth/register').send({ ...body, role: 'admin' });
    expect(res.status).toBe(422);
  });

  test('tampered and expired tokens are rejected with 401', async () => {
    const user = await createUser();
    const tampered = `${user.token.slice(0, -3)}abc`;
    const r1 = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${tampered}`);
    expect(r1.status).toBe(401);
    const expired = jwt.sign({ role: 'customer' }, process.env.JWT_SECRET, { subject: user.id, expiresIn: -10 });
    const r2 = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(r2.status).toBe(401);
    expect(r2.body.error.code).toBe('TOKEN_EXPIRED');
  });
});
