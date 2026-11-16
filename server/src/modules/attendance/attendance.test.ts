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

let owner: string;
const client = `Bearer ${signAccessToken({ id: 'client-1', role: 'CLIENT' })}`;

const api = {
  get: (path: string) => request(app).get(`/api${path}`).set('Authorization', owner),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set('Authorization', owner).send(body),
  delete: (path: string) => request(app).delete(`/api${path}`).set('Authorization', owner),
};

beforeEach(async () => {
  await resetDatabase();
  // Check-ins record who took them, so the owner must be a real account here.
  const user = await prisma.user.create({
    data: { email: 'coach@example.com', passwordHash: 'x', role: 'OWNER' },
  });
  owner = `Bearer ${signAccessToken({ id: user.id, role: 'OWNER' })}`;
});
afterAll(() => prisma.$disconnect());

/**
 * A member who may train: one long subscription covering every day the tests
 * use (from 2020 to a month from now). Pass `covered: false` for one without.
 */
async function member(firstName = 'Omar', covered = true): Promise<string> {
  const res = await api.post('/members', {
    firstName,
    lastName: 'Haddad',
    phone: '+961 71 000 111',
  });
  const id = res.body.id as string;
  if (covered) {
    const plan = await prisma.plan.create({
      data: { name: 'Monthly', priceCents: 5000, durationMonths: 1 },
    });
    await prisma.subscription.create({
      data: {
        memberId: id,
        planId: plan.id,
        planName: plan.name,
        priceCents: plan.priceCents,
        startDate: toDbDate('2020-01-01'),
        endDate: toDbDate(addDays(today(), 30)),
      },
    });
  }
  return id;
}

describe('access', () => {
  it('is for the owner only', async () => {
    const id = await member();
    for (const path of ['/check-ins', `/members/${id}/attendance`]) {
      expect((await request(app).get(`/api${path}`)).status).toBe(401);
      expect((await request(app).get(`/api${path}`).set('Authorization', client)).status).toBe(403);
    }
    const post = await request(app)
      .post('/api/check-ins')
      .set('Authorization', client)
      .send({ memberId: id });
    expect(post.status).toBe(403);
  });
});

describe('checking in', () => {
  it('checks a member in for today and lists them', async () => {
    const id = await member();
    const res = await api.post('/check-ins', { memberId: id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      date: today(),
      member: { id, firstName: 'Omar' },
      recordedBy: 'coach@example.com',
    });

    const list = await api.get('/check-ins');
    expect(list.body.date).toBe(today());
    expect(list.body.checkIns).toHaveLength(1);
  });

  it('allows one check-in per member per day, even for clicks at the same moment', async () => {
    const id = await member();
    const statuses = (
      await Promise.all([1, 2, 3].map(() => api.post('/check-ins', { memberId: id })))
    )
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([201, 409, 409]);

    const again = await api.post('/check-ins', { memberId: id });
    expect(again.body.error.code).toBe('ALREADY_CHECKED_IN');
    // Another day is fine.
    expect(
      (await api.post('/check-ins', { memberId: id, date: addDays(today(), -1) })).status,
    ).toBe(201);
  });

  it('refuses a member whose month does not cover the day, naming when it ended', async () => {
    const never = await member('Hadi', false);
    const res = await api.post('/check-ins', { memberId: never });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'NO_ACTIVE_SUBSCRIPTION',
      details: { lastEndDate: null },
    });

    // Ended yesterday: blocked today, but yesterday itself was still covered.
    const sara = await member('Sara', false);
    const plan = await prisma.plan.create({
      data: { name: 'Monthly', priceCents: 2000, durationMonths: 1 },
    });
    await prisma.subscription.create({
      data: {
        memberId: sara,
        planId: plan.id,
        planName: plan.name,
        priceCents: plan.priceCents,
        startDate: toDbDate(addDays(today(), -31)),
        endDate: toDbDate(addDays(today(), -1)),
      },
    });
    const blocked = await api.post('/check-ins', { memberId: sara });
    expect(blocked.body.error.details).toEqual({ lastEndDate: addDays(today(), -1) });
    const lastDay = await api.post('/check-ins', { memberId: sara, date: addDays(today(), -1) });
    expect(lastDay.status).toBe(201);
  });

  it('refuses archived or unknown members, future dates and bad dates', async () => {
    const id = await member();
    expect(
      (await api.post('/check-ins', { memberId: id, date: addDays(today(), 1) })).body.error.code,
    ).toBe('CHECK_IN_IN_FUTURE');
    expect((await api.post('/check-ins', { memberId: id, date: '2026-02-30' })).status).toBe(400);
    expect((await api.post('/check-ins', { memberId: 'nope' })).body.error.code).toBe(
      'MEMBER_NOT_FOUND',
    );

    await api.post(`/members/${id}/archive`);
    expect((await api.post('/check-ins', { memberId: id })).body.error.code).toBe(
      'MEMBER_ARCHIVED',
    );
  });

  it('lists another day on request', async () => {
    const id = await member();
    const yesterday = addDays(today(), -1);
    await api.post('/check-ins', { memberId: id, date: yesterday });

    expect((await api.get('/check-ins')).body.checkIns).toHaveLength(0);
    const res = await api.get(`/check-ins?date=${yesterday}`);
    expect(res.body).toMatchObject({ date: yesterday, checkIns: [{ member: { id } }] });
    expect((await api.get('/check-ins?date=yesterday')).status).toBe(400);
  });
});

describe('undoing a check-in', () => {
  it('removes it, logs who did it, and frees the day', async () => {
    const id = await member();
    const checkIn = await api.post('/check-ins', { memberId: id });

    expect((await api.delete(`/check-ins/${checkIn.body.id}`)).status).toBe(204);
    expect((await api.get('/check-ins')).body.checkIns).toHaveLength(0);
    expect((await api.delete(`/check-ins/${checkIn.body.id}`)).status).toBe(404);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'checkIn.remove' } });
    expect(log).toMatchObject({ entityId: checkIn.body.id, meta: { memberId: id, date: today() } });

    expect((await api.post('/check-ins', { memberId: id })).status).toBe(201);
  });
});

describe('member attendance', () => {
  it('lists the visits of a month, the last visit and the total', async () => {
    const id = await member();
    const other = await member('Lina');
    for (const date of ['2026-10-02', '2026-10-05', '2026-09-30']) {
      await api.post('/check-ins', { memberId: id, date });
    }
    await api.post('/check-ins', { memberId: other, date: '2026-10-03' });

    const october = await api.get(`/members/${id}/attendance?month=2026-10`);
    expect(october.body).toEqual({
      month: '2026-10',
      days: ['2026-10-02', '2026-10-05'],
      lastVisit: '2026-10-05',
      totalVisits: 3,
    });

    const current = await api.get(`/members/${id}/attendance`);
    expect(current.body.month).toBe(today().slice(0, 7));
    expect((await api.get('/members/nope/attendance')).status).toBe(404);
    expect((await api.get(`/members/${id}/attendance?month=2026-1`)).status).toBe(400);
  });
});
