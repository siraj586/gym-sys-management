import { addDays, todayIn } from '@calisthenics/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { resetDatabase } from '../../test/db.js';

const today = () => todayIn('UTC');

let owner: string;
let lina: { token: string; memberId: string };

const asOwner = {
  get: (path: string) => request(app).get(`/api${path}`).set('Authorization', owner),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set('Authorization', owner).send(body),
  put: (path: string, body: object) =>
    request(app).put(`/api${path}`).set('Authorization', owner).send(body),
};
const asLina = {
  get: (path: string) =>
    request(app).get(`/api${path}`).set('Authorization', `Bearer ${lina.token}`),
  put: (path: string, body: object) =>
    request(app).put(`/api${path}`).set('Authorization', `Bearer ${lina.token}`).send(body),
};

beforeEach(async () => {
  await resetDatabase();
  const coach = await prisma.user.create({
    data: { email: 'coach@example.com', passwordHash: 'x', role: 'OWNER' },
  });
  owner = `Bearer ${signAccessToken({ id: coach.id, role: 'OWNER' })}`;

  const reg = await request(app).post('/api/auth/register').send({
    firstName: 'Lina',
    lastName: 'Farouk',
    phone: '+961 70 123 456',
    email: 'lina@example.com',
    password: 'correct-horse-battery',
  });
  lina = { token: reg.body.accessToken, memberId: reg.body.user.member.id };
});
afterAll(() => prisma.$disconnect());

describe('access', () => {
  it('is for clients only', async () => {
    expect((await request(app).get('/api/portal/home')).status).toBe(401);
    expect((await asOwner.get('/portal/home')).status).toBe(403);
  });
});

describe('portal home', () => {
  it('starts empty for a new client', async () => {
    const res = await asLina.get('/portal/home');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      firstName: 'Lina',
      status: 'NONE',
      subscription: null,
      program: null,
      visitsThisMonth: 0,
      recentVisits: [],
      progress: [],
    });
  });

  it("shows the client's month, program, visits and progress, and nothing about others", async () => {
    // The coach keeps a private note and sells Lina a month.
    await asOwner.put(`/members/${lina.memberId}`, {
      firstName: 'Lina',
      lastName: 'Farouk',
      phone: '+961 70 123 456',
      coachNotes: 'PRIVATE: knee pain',
    });
    const planId = (
      await asOwner.post('/plans', { name: 'Monthly', priceCents: 2000, durationMonths: 1 })
    ).body.id;
    await asOwner.post(`/members/${lina.memberId}/renewals`, {
      planId,
      amountCents: 2000,
      method: 'CASH',
      paidAt: today(),
    });

    // A program both Lina and Omar follow.
    const plank = (await asOwner.post('/exercises', { name: 'Plank', unit: 'SECONDS' })).body.id;
    const programId = (
      await asOwner.post('/programs', {
        name: 'Core',
        days: [{ title: 'Day 1', exercises: [{ exerciseId: plank, sets: 3, target: 30 }] }],
      })
    ).body.id;
    const omar = (
      await asOwner.post('/members', {
        firstName: 'Omar',
        lastName: 'Secret',
        phone: '+961 71 000 111',
      })
    ).body.id;
    await asOwner.put(`/members/${lina.memberId}/program`, { programId });
    await asOwner.put(`/members/${omar}/program`, { programId });

    await asOwner.post('/check-ins', { memberId: lina.memberId });
    await asOwner.post(`/members/${lina.memberId}/progress/performance`, {
      exerciseId: plank,
      value: 45,
      recordedAt: today(),
    });

    const res = await asLina.get('/portal/home');
    expect(res.body).toMatchObject({
      status: 'ACTIVE',
      subscription: {
        planName: 'Monthly',
        startDate: today(),
        status: 'ACTIVE',
        lastPayment: { amountCents: 2000, method: 'CASH', paidAt: today() },
      },
      program: { name: 'Core', days: [{ title: 'Day 1' }] },
      visitsThisMonth: 1,
      progress: [{ name: 'Plank', latest: 45 }],
    });
    expect(res.body.subscription.daysLeft).toBeGreaterThan(26);

    const text = JSON.stringify(res.body);
    expect(text).not.toContain('Secret'); // the other member on the program
    expect(text).not.toContain('PRIVATE'); // the coach-only note
  });
});

describe('attendance and profile', () => {
  it("lists the client's visits by month", async () => {
    const planId = (
      await asOwner.post('/plans', { name: 'Monthly', priceCents: 2000, durationMonths: 1 })
    ).body.id;
    await asOwner.post(`/members/${lina.memberId}/renewals`, {
      planId,
      amountCents: 2000,
      method: 'CASH',
      paidAt: addDays(today(), -3),
    });
    await asOwner.post('/check-ins', { memberId: lina.memberId, date: addDays(today(), -2) });
    await asOwner.post('/check-ins', { memberId: lina.memberId });

    const res = await asLina.get('/portal/attendance');
    expect(res.body.month).toBe(today().slice(0, 7));
    expect(res.body.totalVisits).toBe(2);
    expect((await asLina.get('/portal/attendance?month=1999-01')).body.visits).toEqual([]);
  });

  it('lets the client correct their details but not their email', async () => {
    const res = await asLina.put('/portal/profile', {
      firstName: 'Lina',
      lastName: 'Farouk-Saad',
      phone: '+961 3 999 999',
      dateOfBirth: '1996-05-04',
      email: 'hacker@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      lastName: 'Farouk-Saad',
      phone: '+961 3 999 999',
      dateOfBirth: '1996-05-04',
      email: 'lina@example.com',
    });
  });
});
