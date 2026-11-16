import { addDays, todayIn } from '@calisthenics/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { toDbDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { resetDatabase } from '../../test/db.js';
import { FAKE_SIGNATURE_HEADER, FakeProvider, sign } from './providers/fake.js';
import { usePaymentProvider } from './providers/index.js';
import { WhishProvider } from './providers/whish.js';

const today = () => todayIn('UTC');

let fake: FakeProvider;
let lina: { token: string; memberId: string };
let owner: string;
let planId: string;

const asLina = {
  get: (path: string) =>
    request(app).get(`/api${path}`).set('Authorization', `Bearer ${lina.token}`),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set('Authorization', `Bearer ${lina.token}`).send(body),
};

/** What the provider would post to our notify URL, correctly signed unless told otherwise. */
const notify = (payload: object, signature?: string) => {
  const body = JSON.stringify(payload);
  return request(app)
    .post('/api/checkout/notify/fake')
    .set('Content-Type', 'application/json')
    .set(FAKE_SIGNATURE_HEADER, signature ?? sign(body))
    .send(body);
};

async function startCheckout() {
  const res = await asLina.post('/portal/checkout', { planId });
  expect(res.status).toBe(201);
  const checkout = await prisma.onlineCheckout.findUniqueOrThrow({
    where: { id: res.body.checkoutId },
  });
  return { ...res.body, ref: checkout.providerRef! } as {
    checkoutId: string;
    redirectUrl: string;
    ref: string;
  };
}

beforeEach(async () => {
  await resetDatabase();
  fake = new FakeProvider();
  usePaymentProvider(fake);

  const coach = await prisma.user.create({
    data: { email: 'coach@example.com', passwordHash: 'x', role: 'OWNER' },
  });
  owner = `Bearer ${signAccessToken({ id: coach.id, role: 'OWNER' })}`;
  planId = (
    await request(app)
      .post('/api/plans')
      .set('Authorization', owner)
      .send({ name: 'Monthly', priceCents: 2000, durationMonths: 1 })
  ).body.id;

  const reg = await request(app).post('/api/auth/register').send({
    firstName: 'Lina',
    lastName: 'Farouk',
    phone: '+961 70 123 456',
    email: 'lina@example.com',
    password: 'correct-horse-battery',
  });
  lina = { token: reg.body.accessToken, memberId: reg.body.user.member.id };
});
afterEach(() => usePaymentProvider(null));
afterAll(() => prisma.$disconnect());

describe('options', () => {
  it('offers online payment only when a provider is set up', async () => {
    const on = await asLina.get('/portal/checkout/options');
    expect(on.body).toMatchObject({ enabled: true, provider: 'fake', suggestedPlanId: planId });

    usePaymentProvider(null);
    const off = await asLina.get('/portal/checkout/options');
    expect(off.body).toMatchObject({ enabled: false, provider: null });
    expect((await asLina.post('/portal/checkout', { planId })).body.error.code).toBe(
      'ONLINE_PAYMENT_OFF',
    );
  });

  it('is for clients only', async () => {
    expect((await request(app).get('/api/portal/checkout/options')).status).toBe(401);
    const asOwner = await request(app)
      .get('/api/portal/checkout/options')
      .set('Authorization', owner);
    expect(asOwner.status).toBe(403);
  });
});

describe('paying online', () => {
  it('creates the month and its payment once the provider confirms', async () => {
    const { checkoutId, redirectUrl, ref } = await startCheckout();
    expect(redirectUrl).toBe(`/api/checkout/fake/${ref}`);
    expect((await asLina.get(`/portal/checkout/${checkoutId}`)).body.status).toBe('PENDING');
    expect(await prisma.subscription.count()).toBe(0);

    const res = await notify({ ref, status: 'PAID', amountCents: 2000, currency: 'USD' });
    expect(res.status).toBe(200);

    const state = await asLina.get(`/portal/checkout/${checkoutId}`);
    expect(state.body).toMatchObject({
      status: 'PAID',
      planName: 'Monthly',
      amountCents: 2000,
      period: { startDate: today() },
    });
    const payment = await prisma.payment.findFirstOrThrow({ include: { subscription: true } });
    expect(payment).toMatchObject({
      amountCents: 2000,
      method: 'WHISH_MONEY',
      reference: ref,
      subscription: { memberId: lina.memberId, priceCents: 2000 },
    });
  });

  it('counts a payment once, however many times the notification arrives', async () => {
    const { ref } = await startCheckout();
    const payload = { ref, status: 'PAID', amountCents: 2000, currency: 'USD' };
    const statuses = (await Promise.all([1, 2, 3].map(() => notify(payload)))).map((r) => r.status);
    expect(statuses).toEqual([200, 200, 200]);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.subscription.count()).toBe(1);
  });

  it('ignores a notification with a wrong signature', async () => {
    const { ref } = await startCheckout();
    const res = await notify({ ref, status: 'PAID', amountCents: 2000, currency: 'USD' }, 'forged');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_NOTIFICATION');
    expect(await prisma.payment.count()).toBe(0);
  });

  it('never sells a month when the paid amount differs', async () => {
    const { checkoutId, ref } = await startCheckout();
    await notify({ ref, status: 'PAID', amountCents: 500, currency: 'USD' });
    expect((await asLina.get(`/portal/checkout/${checkoutId}`)).body.status).toBe('FAILED');
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'checkout.amountMismatch' } })).toBe(1);
  });

  it('records a cancelled payment as failed, and nothing else', async () => {
    const { checkoutId, ref } = await startCheckout();
    await notify({ ref, status: 'FAILED', amountCents: 2000, currency: 'USD' });
    expect((await asLina.get(`/portal/checkout/${checkoutId}`)).body.status).toBe('FAILED');
    expect(await prisma.subscription.count()).toBe(0);
  });

  it('keeps the price fixed at the start, even if the plan changes meanwhile', async () => {
    const { ref } = await startCheckout();
    await request(app)
      .put(`/api/plans/${planId}`)
      .set('Authorization', owner)
      .send({ name: 'Monthly', priceCents: 3000, durationMonths: 1, isActive: false });
    await notify({ ref, status: 'PAID', amountCents: 2000, currency: 'USD' });
    const sub = await prisma.subscription.findFirstOrThrow();
    expect(sub.priceCents).toBe(2000);
  });

  it('renews early from the current end date, like a payment at the gym', async () => {
    await prisma.subscription.create({
      data: {
        memberId: lina.memberId,
        planId,
        planName: 'Monthly',
        priceCents: 2000,
        startDate: toDbDate(addDays(today(), -25)),
        endDate: toDbDate(addDays(today(), 5)),
      },
    });
    const { checkoutId, ref } = await startCheckout();
    await notify({ ref, status: 'PAID', amountCents: 2000, currency: 'USD' });
    const state = await asLina.get(`/portal/checkout/${checkoutId}`);
    expect(state.body.period.startDate).toBe(addDays(today(), 5));
  });

  it('learns the result from the provider when the client returns first', async () => {
    const { checkoutId, ref } = await startCheckout();
    // The client paid; the notification has not arrived yet.
    fake.sessions.get(ref)!.status = 'PAID';
    const state = await asLina.get(`/portal/checkout/${checkoutId}`);
    expect(state.body.status).toBe('PAID');
    expect(await prisma.payment.count()).toBe(1);
  });

  it('shows a client only their own checkouts', async () => {
    const { checkoutId } = await startCheckout();
    const other = await request(app).post('/api/auth/register').send({
      firstName: 'Omar',
      lastName: 'Haddad',
      phone: '+961 71 000 111',
      email: 'omar@example.com',
      password: 'correct-horse-battery',
    });
    const res = await request(app)
      .get(`/api/portal/checkout/${checkoutId}`)
      .set('Authorization', `Bearer ${other.body.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('the simulated payment page', () => {
  it('pays and sends the client back to the app', async () => {
    const { checkoutId, ref } = await startCheckout();
    const page = await request(app).get(`/api/checkout/fake/${ref}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('SIMULATION');

    const decided = await request(app)
      .post(`/api/checkout/fake/${ref}/decide`)
      .type('form')
      .send({ decision: 'pay' });
    expect(decided.status).toBe(303);
    expect(decided.headers.location).toMatch(new RegExp(`/portal/checkout/${checkoutId}$`));
    expect(await prisma.payment.count()).toBe(1);
  });

  it('does not exist unless the simulator is the provider', async () => {
    const { ref } = await startCheckout();
    usePaymentProvider(null);
    expect((await request(app).get(`/api/checkout/fake/${ref}`)).status).toBe(404);
  });
});

describe('Whish, before its integration is written', () => {
  it('refuses to start, and trusts no notification', async () => {
    usePaymentProvider(
      new WhishProvider({ apiUrl: undefined, channel: undefined, secret: undefined }),
    );
    const res = await asLina.post('/portal/checkout', { planId });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PROVIDER_NOT_READY');

    const forged = await request(app)
      .post('/api/checkout/notify/whish')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ status: 'PAID' }));
    expect(forged.status).toBe(401);
    expect(await prisma.payment.count()).toBe(0);
  });
});
