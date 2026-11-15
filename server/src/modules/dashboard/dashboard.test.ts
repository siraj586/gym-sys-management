import { addDays, addMonths, todayIn } from '@calisthenics/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { toDbDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { resetDatabase } from '../../test/db.js';
import { renewalStart } from '../members/members.service.js';

const today = () => todayIn('UTC');

let owner: string;
let coachId: string;
const client = `Bearer ${signAccessToken({ id: 'client-1', role: 'CLIENT' })}`;
const api = {
  get: (path: string) => request(app).get(`/api${path}`).set('Authorization', owner),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set('Authorization', owner).send(body),
};

beforeEach(async () => {
  await resetDatabase();
  const user = await prisma.user.create({
    data: { email: 'coach@example.com', passwordHash: 'x', role: 'OWNER' },
  });
  coachId = user.id;
  owner = `Bearer ${signAccessToken({ id: user.id, role: 'OWNER' })}`;
});
afterAll(() => prisma.$disconnect());

async function member(firstName: string): Promise<string> {
  const res = await api.post('/members', { firstName, lastName: 'Test', phone: '+961 71 000 111' });
  return res.body.id as string;
}

async function monthly(priceCents = 2000): Promise<string> {
  const res = await api.post('/plans', { name: 'Monthly', priceCents, durationMonths: 1 });
  return res.body.id as string;
}

/** A paid month that ended or ends `endOffset` days from today. */
async function period(memberId: string, planId: string, endOffset: number) {
  const end = addDays(today(), endOffset);
  await prisma.subscription.create({
    data: {
      memberId,
      planId,
      planName: 'Monthly',
      priceCents: 2000,
      startDate: toDbDate(addMonths(end, -1)),
      endDate: toDbDate(end),
      payments: {
        create: {
          amountCents: 2000,
          method: 'CASH',
          // Long ago, so it never counts as this month's income.
          paidAt: toDbDate('2020-01-01'),
          recordedById: coachId,
        },
      },
    },
  });
}

describe('renewal rule', () => {
  it('starts on the payment day after a month ran out, on the end date when renewing early', () => {
    expect(renewalStart(null, '2026-11-14')).toBe('2026-11-14');
    expect(renewalStart('2026-11-13', '2026-11-14')).toBe('2026-11-14');
    expect(renewalStart('2026-11-20', '2026-11-14')).toBe('2026-11-20');
    expect(renewalStart('2026-11-14', '2026-11-14')).toBe('2026-11-14');
  });
});

describe('renew and record payment', () => {
  it('sells the next month and records its payment together', async () => {
    const id = await member('Lina');
    const planId = await monthly();
    await period(id, planId, 6);

    const res = await api.post(`/members/${id}/renewals`, {
      planId,
      amountCents: 2000,
      method: 'CASH',
      paidAt: today(),
    });
    expect(res.status).toBe(201);
    // Early renewal: the new month starts on the current end date.
    expect(res.body).toMatchObject({
      startDate: addDays(today(), 6),
      endDate: addMonths(addDays(today(), 6), 1),
      paidCents: 2000,
      paymentStatus: 'PAID',
    });
    expect(await prisma.auditLog.count({ where: { action: 'payment.record' } })).toBe(1);
  });

  it('starts an expired member on the payment day', async () => {
    const id = await member('Sara');
    const planId = await monthly();
    await period(id, planId, -1);
    const res = await api.post(`/members/${id}/renewals`, {
      planId,
      amountCents: 2000,
      method: 'BANK_TRANSFER',
      paidAt: today(),
      reference: 'TR-1',
    });
    expect(res.body).toMatchObject({ startDate: today(), status: 'ACTIVE' });
  });

  it('saves nothing when the payment is refused', async () => {
    const id = await member('Omar');
    const planId = await monthly(2000);
    const tooMuch = await api.post(`/members/${id}/renewals`, {
      planId,
      amountCents: 2500,
      method: 'CASH',
      paidAt: today(),
    });
    expect(tooMuch.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    const future = await api.post(`/members/${id}/renewals`, {
      planId,
      amountCents: 2000,
      method: 'CASH',
      paidAt: addDays(today(), 1),
    });
    expect(future.body.error.code).toBe('PAYMENT_IN_FUTURE');
    expect(await prisma.subscription.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });
});

describe('dashboard', () => {
  it('is for the owner only', async () => {
    expect((await request(app).get('/api/dashboard').set('Authorization', client)).status).toBe(
      403,
    );
  });

  it('counts members, lists renewals due and who has not paid', async () => {
    const planId = await monthly(2000);
    const active = await member('Active');
    const soon = await member('Soon');
    const yesterday = await member('Yesterday');
    const longAgo = await member('LongAgo');
    await member('Never');
    await period(active, planId, 20);
    await period(soon, planId, 2);
    await period(yesterday, planId, -1);
    await period(longAgo, planId, -60);

    // One payment this month, and one check-in today.
    await api.post(`/members/${active}/renewals`, {
      planId,
      amountCents: 1500,
      method: 'CASH',
      paidAt: today(),
    });
    await api.post('/check-ins', { memberId: active });

    const res = await api.get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      today: today(),
      totalMembers: 5,
      joinedThisMonth: 5,
      activeSubscriptions: 2,
      endingSoon: 1,
      expired: 2,
      collectedThisMonthCents: 1500,
      paymentsThisMonth: 1,
      checkInsToday: 1,
    });

    // Expired first (recent ones only), then ending soonest.
    expect(
      res.body.renewals.map((r: { firstName: string; daysLeft: number }) => [
        r.firstName,
        r.daysLeft,
      ]),
    ).toEqual([
      ['Yesterday', -1],
      ['Soon', 2],
    ]);

    // The renewal bought a month that is only partly paid: 500 left.
    const owing = res.body.notPaid.map(
      (n: { firstName: string; reason: string; amountCents: number }) => [
        n.firstName,
        n.reason,
        n.amountCents,
      ],
    );
    expect(owing).toEqual([
      ['Active', 'BALANCE', 500],
      ['Yesterday', 'EXPIRED', 2000],
      ['LongAgo', 'EXPIRED', 2000],
      ['Never', 'NEVER', 2000],
    ]);
    expect(res.body.notPaidCents).toBe(6500);

    expect(res.body.revenue).toHaveLength(6);
    expect(res.body.revenue[5]).toEqual({ month: today().slice(0, 7), cents: 1500 });
  });
});
