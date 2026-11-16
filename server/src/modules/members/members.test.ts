import { addDays, MEMBER_STATUSES, todayIn, type MemberStatus } from '@calisthenics/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { toDbDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { resetDatabase } from '../../test/db.js';

// No settings row exists in tests, so the gym timezone is UTC.
const today = () => todayIn('UTC');

const owner = `Bearer ${signAccessToken({ id: 'owner-1', role: 'OWNER' })}`;
const client = `Bearer ${signAccessToken({ id: 'client-1', role: 'CLIENT' })}`;

const api = {
  get: (path: string) => request(app).get(`/api${path}`).set('Authorization', owner),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set('Authorization', owner).send(body),
  put: (path: string, body: object) =>
    request(app).put(`/api${path}`).set('Authorization', owner).send(body),
};

const omar = { firstName: 'Omar', lastName: 'Haddad', phone: '+961 71 000 111' };

async function createMember(body: object = omar): Promise<string> {
  const res = await api.post('/members', body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function createPlan(body: object = {}): Promise<string> {
  const res = await api.post('/plans', {
    name: 'Monthly',
    priceCents: 5000,
    durationMonths: 1,
    ...body,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Inserts a subscription with exact dates, bypassing the sale rules. */
async function addPeriod(memberId: string, planId: string, start: string, end: string) {
  await prisma.subscription.create({
    data: {
      memberId,
      planId,
      planName: 'Monthly',
      priceCents: 5000,
      startDate: toDbDate(start),
      endDate: toDbDate(end),
    },
  });
}

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('access', () => {
  it('is for the owner only', async () => {
    for (const path of ['/members', '/members/counts', '/plans']) {
      expect((await request(app).get(`/api${path}`)).status).toBe(401);
      expect((await request(app).get(`/api${path}`).set('Authorization', client)).status).toBe(403);
    }
    const sale = await request(app)
      .post('/api/subscriptions/x/cancel')
      .set('Authorization', client);
    expect(sale.status).toBe(403);
  });
});

describe('plans', () => {
  it('creates, lists and edits a plan', async () => {
    const id = await createPlan({ description: '  ' });
    const list = await api.get('/plans');
    expect(list.body.plans).toEqual([
      expect.objectContaining({ id, name: 'Monthly', priceCents: 5000, description: null }),
    ]);

    const edited = await api.put(`/plans/${id}`, {
      name: 'Monthly',
      priceCents: 6000,
      durationMonths: 1,
      isActive: false,
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ priceCents: 6000, isActive: false });
  });

  it('rejects a fractional price or a zero duration', async () => {
    const res = await api.post('/plans', { name: 'Bad', priceCents: 10.5, durationMonths: 0 });
    expect(res.status).toBe(400);
    const fields = (res.body.error.details as { path: string[] }[]).map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['priceCents', 'durationMonths']));
  });

  it('answers 404 for an unknown plan', async () => {
    const res = await api.put('/plans/nope', { name: 'X', priceCents: 1, durationMonths: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PLAN_NOT_FOUND');
  });
});

describe('members', () => {
  it('creates a member, turning empty optional fields into null', async () => {
    const res = await api.post('/members', { ...omar, email: '', dateOfBirth: '1995-04-02' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      firstName: 'Omar',
      email: null,
      dateOfBirth: '1995-04-02',
      hasAccount: false,
      status: 'NONE',
      paidThrough: null,
      subscriptions: [],
    });
  });

  it('rejects an impossible date of birth', async () => {
    const res = await api.post('/members', { ...omar, dateOfBirth: '1995-02-30' });
    expect(res.status).toBe(400);
  });

  it('updates and clears fields', async () => {
    const id = await createMember({ ...omar, coachNotes: 'Shoulder injury in 2024' });
    const res = await api.put(`/members/${id}`, {
      ...omar,
      phone: '+961 3 222 333',
      coachNotes: '',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '+961 3 222 333', coachNotes: null });
  });

  it('answers 404 for an unknown member', async () => {
    expect((await api.get('/members/nope')).body.error.code).toBe('MEMBER_NOT_FOUND');
    expect((await api.post('/members/nope/archive')).status).toBe(404);
  });

  it('searches every word across names, phone and email', async () => {
    await createMember();
    await createMember({ firstName: 'Lina', lastName: 'Farouk', phone: '+961 70 123 456' });

    const names = async (search: string) =>
      (
        (await api.get(`/members?search=${encodeURIComponent(search)}`)).body.members as {
          firstName: string;
        }[]
      ).map((m) => m.firstName);

    expect(await names('lina far')).toEqual(['Lina']);
    expect(await names('123')).toEqual(['Lina']);
    expect(await names('haddad')).toEqual(['Omar']);
    expect(await names('lina haddad')).toEqual([]);
  });

  it('hides archived members unless asked, and can restore them', async () => {
    const id = await createMember();
    expect((await api.post(`/members/${id}/archive`)).body.archivedAt).toEqual(expect.any(String));
    expect((await api.get('/members')).body.total).toBe(0);
    expect((await api.get('/members?archived=true')).body.total).toBe(1);

    await api.post(`/members/${id}/restore`);
    expect((await api.get('/members')).body.total).toBe(1);
  });

  it('pages the list 20 at a time', async () => {
    await prisma.member.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({ ...omar, firstName: `M${100 + i}` })),
    });
    const second = await api.get('/members?page=2');
    expect(second.body).toMatchObject({ total: 25, page: 2, pageSize: 20 });
    expect(second.body.members).toHaveLength(5);
  });
});

describe('subscriptions', () => {
  it('sells a period: end date from the plan, name and price copied', async () => {
    const memberId = await createMember();
    const planId = await createPlan();
    const start = today();

    const res = await api.post(`/members/${memberId}/subscriptions`, { planId, startDate: start });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ planName: 'Monthly', priceCents: 5000, startDate: start });

    // Raising the price later does not change what was sold.
    await api.put(`/plans/${planId}`, { name: 'Monthly+', priceCents: 9000, durationMonths: 1 });
    const member = await api.get(`/members/${memberId}`);
    expect(member.body.subscriptions[0]).toMatchObject({ planName: 'Monthly', priceCents: 5000 });
    expect(member.body.paidThrough).toBe(res.body.endDate);
  });

  it('refuses a period that overlaps a live subscription, but lets the next month touch it', async () => {
    const memberId = await createMember();
    const planId = await createPlan();
    const first = await api.post(`/members/${memberId}/subscriptions`, {
      planId,
      startDate: today(),
    });

    const overlap = await api.post(`/members/${memberId}/subscriptions`, {
      planId,
      startDate: addDays(first.body.endDate as string, -1),
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('SUBSCRIPTION_OVERLAP');

    // Paid 3 Oct, ends 3 Nov: the next month starts on 3 Nov.
    const next = await api.post(`/members/${memberId}/subscriptions`, {
      planId,
      startDate: first.body.endDate,
    });
    expect(next.status).toBe(201);
  });

  it('never lets two simultaneous sales overlap', async () => {
    const memberId = await createMember();
    const planId = await createPlan();
    const sell = () =>
      api.post(`/members/${memberId}/subscriptions`, { planId, startDate: today() });

    const statuses = (await Promise.all([sell(), sell(), sell()])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409]);
    expect(await prisma.subscription.count()).toBe(1);
  });

  it('frees the period once the subscription is cancelled', async () => {
    const memberId = await createMember();
    const planId = await createPlan();
    const sale = await api.post(`/members/${memberId}/subscriptions`, {
      planId,
      startDate: today(),
    });

    const cancelled = await api.post(`/subscriptions/${sale.body.id}/cancel`);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect((await api.post(`/subscriptions/${sale.body.id}/cancel`)).body.error.code).toBe(
      'SUBSCRIPTION_ALREADY_CANCELLED',
    );
    expect((await api.post('/subscriptions/nope/cancel')).status).toBe(404);

    const again = await api.post(`/members/${memberId}/subscriptions`, {
      planId,
      startDate: today(),
    });
    expect(again.status).toBe(201);
  });

  it('refuses retired plans, archived members and bad dates', async () => {
    const memberId = await createMember();
    const retired = await createPlan({ isActive: false });
    const planId = await createPlan();

    const onRetired = await api.post(`/members/${memberId}/subscriptions`, {
      planId: retired,
      startDate: today(),
    });
    expect(onRetired.body.error.code).toBe('PLAN_INACTIVE');

    const badDate = await api.post(`/members/${memberId}/subscriptions`, {
      planId,
      startDate: '2026-13-01',
    });
    expect(badDate.status).toBe(400);

    await api.post(`/members/${memberId}/archive`);
    const archived = await api.post(`/members/${memberId}/subscriptions`, {
      planId,
      startDate: today(),
    });
    expect(archived.body.error.code).toBe('MEMBER_ARCHIVED');
  });
});

describe('member status', () => {
  /**
   * One member per situation. The list filter (SQL) and the status shown on each
   * member (memberStatus in shared) are written separately, so check they agree.
   */
  it('filters and counts by status exactly as each member reports it', async () => {
    const planId = await createPlan();
    const d = (days: number) => addDays(today(), days);
    const expected: Record<string, MemberStatus> = {};

    const scenario = async (name: string, status: MemberStatus, periods: [number, number][]) => {
      const id = await createMember({ ...omar, firstName: name });
      for (const [start, end] of periods) await addPeriod(id, planId, d(start), d(end));
      expected[name] = status;
    };

    await scenario('Active', 'ACTIVE', [[-5, 25]]);
    await scenario('Expiring', 'EXPIRING', [[-25, 5]]);
    await scenario('EndsToday', 'EXPIRING', [[-30, 0]]);
    await scenario('Renewed', 'ACTIVE', [
      [-25, 5],
      [6, 36],
    ]);
    await scenario('Upcoming', 'UPCOMING', [[3, 33]]);
    await scenario('Expired', 'EXPIRED', [[-40, -10]]);
    await scenario('EndedYesterday', 'EXPIRED', [[-31, -1]]);
    await scenario('Never', 'NONE', []);

    const cancelledId = await createMember({ ...omar, firstName: 'Cancelled' });
    await addPeriod(cancelledId, planId, d(-5), d(25));
    await prisma.subscription.updateMany({
      where: { memberId: cancelledId },
      data: { cancelledAt: new Date() },
    });
    expected.Cancelled = 'NONE';

    const all = await api.get('/members');
    const reported = Object.fromEntries(
      (all.body.members as { firstName: string; status: MemberStatus }[]).map((m) => [
        m.firstName,
        m.status,
      ]),
    );
    expect(reported).toEqual(expected);

    const counts = (await api.get('/members/counts')).body as Record<MemberStatus, number>;
    for (const status of MEMBER_STATUSES) {
      const filtered = await api.get(`/members?status=${status}`);
      const names = (filtered.body.members as { firstName: string }[]).map((m) => m.firstName);
      const want = Object.keys(expected).filter((name) => expected[name] === status);
      expect(names.sort(), status).toEqual(want.sort());
      expect(counts[status], status).toBe(want.length);
    }
  });
});
