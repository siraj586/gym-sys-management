import { addDays, todayIn } from '@calisthenics/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { resetDatabase } from '../../test/db.js';

const today = () => todayIn('UTC');

let owner: string;
const client = `Bearer ${signAccessToken({ id: 'client-1', role: 'CLIENT' })}`;

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
  // Removals are written to the audit log with the actor, so the owner must exist.
  const user = await prisma.user.create({
    data: { email: 'coach@example.com', passwordHash: 'x', role: 'OWNER' },
  });
  owner = `Bearer ${signAccessToken({ id: user.id, role: 'OWNER' })}`;
});
afterAll(() => prisma.$disconnect());

async function setup() {
  const member = await api.post('/members', {
    firstName: 'Omar',
    lastName: 'Haddad',
    phone: '+961 71 000 111',
  });
  const pushUp = await api.post('/exercises', { name: 'Push-up', unit: 'REPS' });
  const weighted = await api.post('/exercises', { name: 'Weighted dip', unit: 'KG' });
  return {
    memberId: member.body.id as string,
    pushUp: pushUp.body.id as string,
    weighted: weighted.body.id as string,
  };
}

describe('access', () => {
  it('is for the owner only', async () => {
    const { memberId } = await setup();
    expect((await request(app).get(`/api/members/${memberId}/progress`)).status).toBe(401);
    const asClient = await request(app)
      .get(`/api/members/${memberId}/progress`)
      .set('Authorization', client);
    expect(asClient.status).toBe(403);
    const remove = await request(app).delete('/api/progress/notes/x').set('Authorization', client);
    expect(remove.status).toBe(403);
  });
});

describe('performance records', () => {
  it('groups results by exercise, oldest first, with first, best and latest', async () => {
    const { memberId, pushUp, weighted } = await setup();
    const add = (exerciseId: string, value: number, daysAgo: number) =>
      api.post(`/members/${memberId}/progress/performance`, {
        exerciseId,
        value,
        recordedAt: addDays(today(), -daysAgo),
      });

    await add(pushUp, 12, 10);
    await add(pushUp, 20, 1);
    await add(pushUp, 15, 5);
    const res = await add(weighted, 7.5, 2);
    expect(res.status).toBe(201);

    const push = res.body.exercises.find((e: { name: string }) => e.name === 'Push-up');
    expect(push).toMatchObject({ unit: 'REPS', first: 12, best: 20, latest: 20 });
    expect(push.records.map((r: { value: number }) => r.value)).toEqual([12, 15, 20]);
    expect(res.body.exercises.map((e: { name: string }) => e.name)).toEqual([
      'Push-up',
      'Weighted dip',
    ]);
  });

  it('wants whole reps, a positive value and no future date', async () => {
    const { memberId, pushUp, weighted } = await setup();
    const post = (body: object) =>
      api.post(`/members/${memberId}/progress/performance`, { recordedAt: today(), ...body });

    expect((await post({ exerciseId: pushUp, value: 10.5 })).body.error.code).toBe(
      'VALUE_NOT_WHOLE',
    );
    expect((await post({ exerciseId: weighted, value: 10.5 })).status).toBe(201);
    expect((await post({ exerciseId: pushUp, value: 0 })).status).toBe(400);
    expect(
      (await post({ exerciseId: pushUp, value: 5, recordedAt: addDays(today(), 1) })).body.error
        .code,
    ).toBe('DATE_IN_FUTURE');
    expect((await post({ exerciseId: 'nope', value: 5 })).body.error.code).toBe(
      'EXERCISE_NOT_FOUND',
    );
  });

  it('keeps recording a retired exercise the member already tracks, but not a new one', async () => {
    const { memberId, pushUp, weighted } = await setup();
    const post = (exerciseId: string) =>
      api.post(`/members/${memberId}/progress/performance`, {
        exerciseId,
        value: 10,
        recordedAt: today(),
      });
    await post(pushUp);
    await api.put(`/exercises/${pushUp}`, { name: 'Push-up', unit: 'REPS', isActive: false });
    await api.put(`/exercises/${weighted}`, { name: 'Weighted dip', unit: 'KG', isActive: false });

    expect((await post(pushUp)).status).toBe(201);
    expect((await post(weighted)).body.error.code).toBe('EXERCISE_INACTIVE');
  });
});

describe('body measurements', () => {
  it('stores the fields given, newest first', async () => {
    const { memberId } = await setup();
    const path = `/members/${memberId}/progress/measurements`;
    await api.post(path, { recordedAt: addDays(today(), -30), weightKg: 82.4, waistCm: 90 });
    const res = await api.post(path, { recordedAt: today(), weightKg: 80.1, note: 'After cut' });

    expect(res.status).toBe(201);
    expect(res.body.measurements).toEqual([
      expect.objectContaining({
        recordedAt: today(),
        weightKg: 80.1,
        waistCm: null,
        note: 'After cut',
      }),
      expect.objectContaining({ weightKg: 82.4, waistCm: 90 }),
    ]);
  });

  it('needs at least one value, each within a sensible range', async () => {
    const { memberId } = await setup();
    const path = `/members/${memberId}/progress/measurements`;
    const empty = await api.post(path, { recordedAt: today() });
    expect(empty.status).toBe(400);
    expect(empty.body.error.details[0].message).toBe('validation.measurementEmpty');
    expect((await api.post(path, { recordedAt: today(), weightKg: 8000 })).status).toBe(400);
  });
});

describe('notes and removal', () => {
  it('adds notes, newest first', async () => {
    const { memberId } = await setup();
    await api.post(`/members/${memberId}/progress/notes`, { body: 'First pull-up!' });
    await new Promise((r) => setTimeout(r, 5));
    await api.post(`/members/${memberId}/progress/notes`, { body: 'Five pull-ups.' });
    const res = await api.get(`/members/${memberId}/progress`);
    expect(res.body.notes.map((n: { body: string }) => n.body)).toEqual([
      'Five pull-ups.',
      'First pull-up!',
    ]);
    expect((await api.post(`/members/${memberId}/progress/notes`, { body: ' ' })).status).toBe(400);
  });

  it('removes an entry and keeps a copy of it in the audit log', async () => {
    const { memberId, pushUp } = await setup();
    const added = await api.post(`/members/${memberId}/progress/performance`, {
      exerciseId: pushUp,
      value: 33,
      recordedAt: today(),
    });
    const recordId = added.body.exercises[0].records[0].id as string;

    expect((await api.delete(`/progress/performance/${recordId}`)).status).toBe(204);
    expect((await api.get(`/members/${memberId}/progress`)).body.exercises).toEqual([]);
    expect((await api.delete(`/progress/performance/${recordId}`)).status).toBe(404);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'progress.remove' } });
    expect(log).toMatchObject({
      entity: 'PerformanceRecord',
      entityId: recordId,
      meta: { value: 33 },
    });
  });

  it('answers 404 for an unknown member', async () => {
    expect((await api.get('/members/nope/progress')).status).toBe(404);
  });
});
