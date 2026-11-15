import { addDays, todayIn } from '@calisthenics/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { toDbDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { resetDatabase } from '../../test/db.js';

// No settings row exists in tests, so the gym timezone is UTC.
const today = () => todayIn('UTC');
const thisMonth = () => today().slice(0, 7);

let owner: string;
const client = `Bearer ${signAccessToken({ id: 'client-1', role: 'CLIENT' })}`;

const api = {
  get: (path: string) => request(app).get(`/api${path}`).set('Authorization', owner),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set('Authorization', owner).send(body),
};

beforeEach(async () => {
  await resetDatabase();
  // Payments record who took the money, so the owner must be a real account here.
  const user = await prisma.user.create({
    data: { email: 'coach@example.com', passwordHash: 'x', role: 'OWNER' },
  });
  owner = `Bearer ${signAccessToken({ id: user.id, role: 'OWNER' })}`;
});
afterAll(() => prisma.$disconnect());

/** A member with one subscription sold today at `priceCents`. */
async function sale(priceCents = 5000, firstName = 'Omar') {
  const member = await api.post('/members', {
    firstName,
    lastName: 'Haddad',
    phone: '+961 71 000 111',
  });
  const plan = await api.post('/plans', { name: 'Monthly', priceCents, durationMonths: 1 });
  const sub = await api.post(`/members/${member.body.id}/subscriptions`, {
    planId: plan.body.id,
    startDate: today(),
  });
  expect(sub.status).toBe(201);
  return { memberId: member.body.id as string, subscriptionId: sub.body.id as string };
}

const pay = (subscriptionId: string, body: object) =>
  api.post(`/subscriptions/${subscriptionId}/payments`, {
    method: 'CASH',
    paidAt: today(),
    ...body,
  });

async function subscriptionOf(memberId: string) {
  return (await api.get(`/members/${memberId}`)).body.subscriptions[0];
}

describe('access', () => {
  it('is for the owner only', async () => {
    for (const path of ['/payments', '/payments/unpaid', '/payments/summary']) {
      expect((await request(app).get(`/api${path}`)).status).toBe(401);
      expect((await request(app).get(`/api${path}`).set('Authorization', client)).status).toBe(403);
    }
    for (const path of ['/subscriptions/x/payments', '/payments/x/void']) {
      expect((await request(app).post(`/api${path}`).set('Authorization', client)).status).toBe(
        403,
      );
    }
  });
});

describe('recording payments', () => {
  it('marks a subscription paid in full, partly or not at all', async () => {
    const { memberId, subscriptionId } = await sale(5000);
    expect(await subscriptionOf(memberId)).toMatchObject({ paidCents: 0, paymentStatus: 'UNPAID' });

    const first = await pay(subscriptionId, {
      amountCents: 2000,
      reference: ' ',
      note: 'First half',
    });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      amountCents: 2000,
      method: 'CASH',
      paidAt: today(),
      reference: null,
      note: 'First half',
      recordedBy: 'coach@example.com',
      voidedAt: null,
    });
    expect(await subscriptionOf(memberId)).toMatchObject({
      paidCents: 2000,
      paymentStatus: 'PARTIAL',
    });

    await pay(subscriptionId, { amountCents: 3000, method: 'BANK_TRANSFER' });
    const sub = await subscriptionOf(memberId);
    expect(sub).toMatchObject({ paidCents: 5000, paymentStatus: 'PAID' });
    expect(sub.payments).toHaveLength(2);
  });

  it('refuses more than what is still owed, and says how much that is', async () => {
    const { subscriptionId } = await sale(5000);
    await pay(subscriptionId, { amountCents: 4000 });

    const res = await pay(subscriptionId, { amountCents: 1500 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'PAYMENT_EXCEEDS_BALANCE',
      details: { balanceCents: 1000 },
    });
  });

  it('never overpays when two payments arrive at the same moment', async () => {
    const { subscriptionId } = await sale(5000);
    const statuses = (
      await Promise.all([1, 2, 3].map(() => pay(subscriptionId, { amountCents: 5000 })))
    )
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([201, 409, 409]);
    expect(await prisma.payment.count()).toBe(1);
  });

  it('refuses a future date, a cancelled subscription and bad input', async () => {
    const { subscriptionId } = await sale(5000);

    const future = await pay(subscriptionId, { amountCents: 100, paidAt: addDays(today(), 1) });
    expect(future.body.error.code).toBe('PAYMENT_IN_FUTURE');

    const invalid = await pay(subscriptionId, { amountCents: 0, method: 'CHEQUE' });
    expect(invalid.status).toBe(400);
    const fields = (invalid.body.error.details as { path: string[] }[]).map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['amountCents', 'method']));

    expect((await pay('nope', { amountCents: 100 })).status).toBe(404);

    await api.post(`/subscriptions/${subscriptionId}/cancel`);
    const cancelled = await pay(subscriptionId, { amountCents: 100 });
    expect(cancelled.body.error.code).toBe('SUBSCRIPTION_CANCELLED');
  });

  it('writes an audit entry for every payment and void', async () => {
    const { subscriptionId } = await sale(5000);
    const payment = await pay(subscriptionId, { amountCents: 5000 });
    await api.post(`/payments/${payment.body.id}/void`, { reason: 'Typed the wrong amount' });

    const log = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(log.map((e) => e.action)).toEqual(['payment.record', 'payment.void']);
    expect(log[1]).toMatchObject({
      entityId: payment.body.id,
      meta: { reason: 'Typed the wrong amount', amountCents: 5000 },
    });
  });
});

describe('voiding payments', () => {
  it('stops counting a voided payment, keeps it in the history, and frees the balance', async () => {
    const { memberId, subscriptionId } = await sale(5000);
    const payment = await pay(subscriptionId, { amountCents: 5000 });

    const voided = await api.post(`/payments/${payment.body.id}/void`, { reason: 'Wrong member' });
    expect(voided.status).toBe(200);
    expect(voided.body).toMatchObject({ voidReason: 'Wrong member', voidedAt: expect.any(String) });

    const sub = await subscriptionOf(memberId);
    expect(sub).toMatchObject({ paidCents: 0, paymentStatus: 'UNPAID' });
    expect(sub.payments).toHaveLength(1);

    expect((await pay(subscriptionId, { amountCents: 5000 })).status).toBe(201);
  });

  it('needs a reason, and voids a payment only once', async () => {
    const { subscriptionId } = await sale(5000);
    const payment = await pay(subscriptionId, { amountCents: 5000 });

    expect((await api.post(`/payments/${payment.body.id}/void`, { reason: '  ' })).status).toBe(
      400,
    );
    await api.post(`/payments/${payment.body.id}/void`, { reason: 'Duplicate' });
    const again = await api.post(`/payments/${payment.body.id}/void`, { reason: 'Duplicate' });
    expect(again.body.error.code).toBe('PAYMENT_ALREADY_VOIDED');
    expect((await api.post('/payments/nope/void', { reason: 'x' })).status).toBe(404);
  });
});

describe('income and debts', () => {
  it('lists one month of payments with totals that leave out voided ones', async () => {
    const { subscriptionId } = await sale(10_000);
    await pay(subscriptionId, { amountCents: 3000 });
    await pay(subscriptionId, { amountCents: 2000, method: 'BANK_TRANSFER' });
    const mistake = await pay(subscriptionId, { amountCents: 1000 });
    await api.post(`/payments/${mistake.body.id}/void`, { reason: 'Mistake' });
    // A payment dated in another month.
    await prisma.payment.updateMany({
      where: { amountCents: 2000 },
      data: { paidAt: toDbDate('2020-01-15') },
    });

    const res = await api.get(`/payments?month=${thisMonth()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      month: thisMonth(),
      totalCents: 3000,
      byMethod: { CASH: 3000, BANK_TRANSFER: 0 },
    });
    expect(res.body.payments).toHaveLength(2);
    expect(res.body.payments[0]).toMatchObject({
      member: { firstName: 'Omar' },
      planName: 'Monthly',
    });

    const january = await api.get('/payments?month=2020-01');
    expect(january.body).toMatchObject({ totalCents: 2000, byMethod: { BANK_TRANSFER: 2000 } });

    // Without a month, the current one.
    expect((await api.get('/payments')).body.month).toBe(thisMonth());
    expect((await api.get('/payments?month=2026-13')).status).toBe(400);
  });

  it('lists what is still owed and sums it up for the dashboard', async () => {
    const unpaid = await sale(5000, 'Unpaid');
    const partial = await sale(4000, 'Partial');
    const paid = await sale(3000, 'Paid');
    const cancelled = await sale(2000, 'Cancelled');
    await pay(partial.subscriptionId, { amountCents: 1500 });
    await pay(paid.subscriptionId, { amountCents: 3000 });
    await api.post(`/subscriptions/${cancelled.subscriptionId}/cancel`);

    const list = await api.get('/payments/unpaid');
    const rows = list.body.subscriptions as {
      member: { firstName: string };
      balanceCents: number;
    }[];
    expect(rows.map((r) => [r.member.firstName, r.balanceCents]).sort()).toEqual([
      ['Partial', 2500],
      ['Unpaid', 5000],
    ]);

    const summary = await api.get('/payments/summary');
    expect(summary.body).toEqual({
      month: thisMonth(),
      monthIncomeCents: 4500,
      unpaidCount: 2,
      unpaidCents: 7500,
    });

    // The member list shows each member's balance as well.
    const members = (await api.get('/members')).body.members as {
      firstName: string;
      balanceCents: number;
    }[];
    expect(Object.fromEntries(members.map((m) => [m.firstName, m.balanceCents]))).toEqual({
      Cancelled: 0,
      Paid: 0,
      Partial: 2500,
      Unpaid: 5000,
    });
    expect(unpaid.memberId).toBeTruthy();
  });
});
