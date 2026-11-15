import { addDays, todayIn } from '@calisthenics/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../lib/tokens.js';
import { resetDatabase } from '../test/db.js';
import { FakeProvider } from './checkout/providers/fake.js';
import { usePaymentProvider } from './checkout/providers/index.js';

// Everything the owner may correct or remove for good, and what goes with it.

const today = () => todayIn('UTC');
const client = `Bearer ${signAccessToken({ id: 'client-1', role: 'CLIENT' })}`;
let owner: string;

const api = {
  get: (path: string) => request(app).get(`/api${path}`).set('Authorization', owner),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set('Authorization', owner).send(body),
  put: (path: string, body: object) =>
    request(app).put(`/api${path}`).set('Authorization', owner).send(body),
  delete: (path: string) => request(app).delete(`/api${path}`).set('Authorization', owner),
};

beforeEach(async () => {
  await resetDatabase();
  const coach = await prisma.user.create({
    data: { email: 'coach@example.com', passwordHash: 'x', role: 'OWNER' },
  });
  owner = `Bearer ${signAccessToken({ id: coach.id, role: 'OWNER' })}`;
});
afterEach(() => usePaymentProvider(null));
afterAll(() => prisma.$disconnect());

async function plan(priceCents = 2000) {
  return (await api.post('/plans', { name: 'Monthly', priceCents, durationMonths: 1 })).body
    .id as string;
}
async function member(firstName = 'Omar') {
  return (await api.post('/members', { firstName, lastName: 'Haddad', phone: '+961 71 000 111' }))
    .body.id as string;
}
async function renew(memberId: string, planId: string, amountCents = 2000) {
  const res = await api.post(`/members/${memberId}/renewals`, {
    planId,
    amountCents,
    method: 'CASH',
    paidAt: today(),
  });
  expect(res.status).toBe(201);
  return res.body as { id: string; startDate: string; endDate: string };
}
const income = async () =>
  (await api.get(`/payments?month=${today().slice(0, 7)}`)).body.totalCents;

describe('only the owner', () => {
  it('may delete or edit', async () => {
    for (const path of [
      '/plans/x',
      '/members/x',
      '/subscriptions/x',
      '/payments/x',
      '/programs/x',
      '/exercises/x',
    ]) {
      const res = await request(app).delete(`/api${path}`).set('Authorization', client);
      expect(res.status, path).toBe(403);
    }
    const edit = await request(app).put('/api/payments/x').set('Authorization', client).send({});
    expect(edit.status).toBe(403);
  });
});

describe('plans', () => {
  it('deletes a plan while the months sold with it keep their name and price', async () => {
    const planId = await plan();
    const memberId = await member();
    await renew(memberId, planId);

    expect((await api.delete(`/plans/${planId}`)).status).toBe(204);
    expect((await api.get('/plans')).body.plans).toEqual([]);
    const sub = await prisma.subscription.findFirstOrThrow();
    expect(sub).toMatchObject({ planId: null, planName: 'Monthly', priceCents: 2000 });
    expect((await api.get(`/members/${memberId}`)).body.subscriptions[0].planName).toBe('Monthly');
    expect((await api.delete(`/plans/${planId}`)).status).toBe(404);
  });

  it('is refused while a client is paying for it online', async () => {
    usePaymentProvider(new FakeProvider());
    const planId = await plan();
    const reg = await request(app).post('/api/auth/register').send({
      firstName: 'Lina',
      lastName: 'Farouk',
      phone: '+961 70 123 456',
      email: 'lina@example.com',
      password: 'correct-horse-battery',
    });
    await request(app)
      .post('/api/portal/checkout')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ planId });
    const res = await api.delete(`/plans/${planId}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLAN_BEING_PAID');
  });
});

describe('members', () => {
  it('deletes a member with all their history and account; income drops by their payments', async () => {
    const planId = await plan();
    const reg = await request(app).post('/api/auth/register').send({
      firstName: 'Lina',
      lastName: 'Farouk',
      phone: '+961 70 123 456',
      email: 'lina@example.com',
      password: 'correct-horse-battery',
    });
    const lina = reg.body.user.member.id as string;
    const other = await member('Omar');
    await renew(lina, planId);
    await renew(other, planId);
    await api.post('/check-ins', { memberId: lina });
    const pushUp = (await api.post('/exercises', { name: 'Push-up', unit: 'REPS' })).body.id;
    await api.post(`/members/${lina}/progress/performance`, {
      exerciseId: pushUp,
      value: 10,
      recordedAt: today(),
    });
    expect(await income()).toBe(4000);

    expect((await api.delete(`/members/${lina}`)).status).toBe(204);
    expect(await income()).toBe(2000);
    expect(await prisma.member.count()).toBe(1);
    expect(await prisma.checkIn.count()).toBe(0);
    expect(await prisma.performanceRecord.count()).toBe(0);
    expect(await prisma.user.count({ where: { role: 'CLIENT' } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'member.delete' } });
    expect(log.meta).toMatchObject({
      name: 'Lina Farouk',
      months: 1,
      payments: 1,
      paidCents: 2000,
    });
    expect((await api.delete(`/members/${lina}`)).status).toBe(404);
  });
});

describe('months and payments', () => {
  it('undoes a renewal saved twice: deleting the second month and its payment', async () => {
    const planId = await plan();
    const memberId = await member();
    await renew(memberId, planId);
    const twice = await renew(memberId, planId);
    expect(await income()).toBe(4000);

    expect((await api.delete(`/subscriptions/${twice.id}`)).status).toBe(204);
    expect(await income()).toBe(2000);
    expect(await prisma.subscription.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'subscription.delete' } })).toBe(1);
  });

  it('deletes a payment alone, or with the month it alone paid for', async () => {
    const planId = await plan();
    const memberId = await member();
    await renew(memberId, planId);
    await renew(memberId, planId);
    const payments = await prisma.payment.findMany({ orderBy: { createdAt: 'asc' } });

    // Alone: the month stays, unpaid.
    expect((await api.delete(`/payments/${payments[0]!.id}`)).status).toBe(204);
    expect(await prisma.subscription.count()).toBe(2);
    // With its month.
    expect((await api.delete(`/payments/${payments[1]!.id}?withMonth=true`)).status).toBe(204);
    expect(await prisma.subscription.count()).toBe(1);
    expect(await income()).toBe(0);
    expect((await api.delete(`/payments/${payments[1]!.id}`)).status).toBe(404);
  });

  it('keeps the month when another payment is still on it', async () => {
    const planId = await plan(2000);
    const memberId = await member();
    const sub = await renew(memberId, planId, 1000);
    await api.post(`/subscriptions/${sub.id}/payments`, {
      amountCents: 1000,
      method: 'CASH',
      paidAt: today(),
    });
    const first = await prisma.payment.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
    await api.delete(`/payments/${first.id}?withMonth=true`);
    expect(await prisma.subscription.count()).toBe(1);
  });

  it('edits a payment within what the month costs, and logs the change', async () => {
    const planId = await plan(2000);
    const memberId = await member();
    await renew(memberId, planId, 1500);
    const payment = await prisma.payment.findFirstOrThrow();

    const ok = await api.put(`/payments/${payment.id}`, {
      amountCents: 2000,
      method: 'WHISH_MONEY',
      paidAt: addDays(today(), -1),
      reference: 'W-123',
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ amountCents: 2000, method: 'WHISH_MONEY', reference: 'W-123' });

    const tooMuch = await api.put(`/payments/${payment.id}`, {
      amountCents: 2500,
      method: 'CASH',
      paidAt: today(),
    });
    expect(tooMuch.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    const future = await api.put(`/payments/${payment.id}`, {
      amountCents: 1000,
      method: 'CASH',
      paidAt: addDays(today(), 2),
    });
    expect(future.body.error.code).toBe('PAYMENT_IN_FUTURE');

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment.edit' } });
    expect(log.meta).toMatchObject({ before: { amountCents: 1500 }, after: { amountCents: 2000 } });
  });
});

describe('programs and exercises', () => {
  async function setup() {
    const pushUp = (await api.post('/exercises', { name: 'Push-up', unit: 'REPS' })).body
      .id as string;
    const plank = (await api.post('/exercises', { name: 'Plank', unit: 'SECONDS' })).body
      .id as string;
    const program = await api.post('/programs', {
      name: 'Core',
      days: [
        {
          title: 'A',
          exercises: [
            { exerciseId: pushUp, sets: 3, target: 10 },
            { exerciseId: plank, sets: 3, target: 30 },
          ],
        },
        { title: 'B', exercises: [{ exerciseId: pushUp, sets: 3, target: 12 }] },
      ],
    });
    const memberId = await member();
    await api.put(`/members/${memberId}/program`, { programId: program.body.id });
    return { pushUp, plank, programId: program.body.id as string, memberId };
  }

  it('deletes a program and its assignments', async () => {
    const { programId, memberId } = await setup();
    expect((await api.delete(`/programs/${programId}`)).status).toBe(204);
    expect((await api.get(`/members/${memberId}/program`)).body).toEqual({
      current: null,
      history: [],
    });
    expect(await prisma.programDay.count()).toBe(0);
  });

  it('deletes an exercise from programs and progress, removing days it left empty', async () => {
    const { pushUp, programId, memberId } = await setup();
    await api.post(`/members/${memberId}/progress/performance`, {
      exerciseId: pushUp,
      value: 20,
      recordedAt: today(),
    });
    expect((await api.delete(`/exercises/${pushUp}`)).status).toBe(204);
    const program = (await api.get(`/programs/${programId}`)).body;
    expect(program.days).toEqual([
      expect.objectContaining({
        title: 'A',
        exercises: [expect.objectContaining({ name: 'Plank' })],
      }),
    ]);
    expect(await prisma.performanceRecord.count()).toBe(0);
  });
});

describe('signing up from the website', () => {
  it('shows the plans to a new client even before online payment is connected', async () => {
    await plan(2000);
    const reg = await request(app).post('/api/auth/register').send({
      firstName: 'Nour',
      lastName: 'Khalil',
      phone: '+961 70 555 555',
      email: 'nour@example.com',
      password: 'correct-horse-battery',
    });
    const res = await request(app)
      .get('/api/portal/checkout/options')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(res.body).toMatchObject({
      enabled: false,
      plans: [{ name: 'Monthly', priceCents: 2000 }],
    });
  });
});
