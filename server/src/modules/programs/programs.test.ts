import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { resetDatabase } from '../../test/db.js';

const owner = `Bearer ${signAccessToken({ id: 'owner-1', role: 'OWNER' })}`;
const client = `Bearer ${signAccessToken({ id: 'client-1', role: 'CLIENT' })}`;

const api = {
  get: (path: string) => request(app).get(`/api${path}`).set('Authorization', owner),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set('Authorization', owner).send(body),
  put: (path: string, body: object) =>
    request(app).put(`/api${path}`).set('Authorization', owner).send(body),
  delete: (path: string) => request(app).delete(`/api${path}`).set('Authorization', owner),
};

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function exercise(name: string, unit = 'REPS'): Promise<string> {
  const res = await api.post('/exercises', { name, unit });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function member(firstName = 'Omar'): Promise<string> {
  const res = await api.post('/members', {
    firstName,
    lastName: 'Haddad',
    phone: '+961 71 000 111',
  });
  return res.body.id as string;
}

/** A two-day program built from the given exercises. */
function programBody(pushUp: string, plank: string, name = 'Beginner strength') {
  return {
    name,
    level: 'Beginner',
    goal: '',
    days: [
      {
        title: 'Day A — Push',
        exercises: [
          { exerciseId: pushUp, sets: 3, target: 10, restSeconds: 90, note: 'Knees if needed' },
          { exerciseId: plank, sets: 3, target: 30 },
        ],
      },
      { title: 'Day B — Core', exercises: [{ exerciseId: plank, sets: 4, target: 45 }] },
    ],
  };
}

describe('access', () => {
  it('is for the owner only', async () => {
    const id = await member();
    for (const path of ['/exercises', '/programs', `/members/${id}/program`]) {
      expect((await request(app).get(`/api${path}`)).status).toBe(401);
      expect((await request(app).get(`/api${path}`).set('Authorization', client)).status).toBe(403);
    }
  });
});

describe('exercises', () => {
  it('creates and lists exercises, refusing a name already taken in any letter case', async () => {
    await exercise('Push-up');
    const dup = await api.post('/exercises', { name: 'push-UP', unit: 'REPS' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EXERCISE_NAME_TAKEN');
    expect((await api.get('/exercises')).body.exercises).toEqual([
      expect.objectContaining({ name: 'Push-up', unit: 'REPS', isActive: true }),
    ]);
  });

  it('can rename and retire, but not change the unit once the exercise is used', async () => {
    const pushUp = await exercise('Push-up');
    const plank = await exercise('Plank', 'SECONDS');
    expect((await api.put(`/exercises/${pushUp}`, { name: 'Push up', unit: 'KG' })).status).toBe(
      200,
    );

    await api.post('/programs', programBody(pushUp, plank));
    const unit = await api.put(`/exercises/${plank}`, { name: 'Plank', unit: 'REPS' });
    expect(unit.body.error.code).toBe('EXERCISE_UNIT_LOCKED');

    const retired = await api.put(`/exercises/${plank}`, {
      name: 'Plank hold',
      unit: 'SECONDS',
      isActive: false,
    });
    expect(retired.body).toMatchObject({ name: 'Plank hold', isActive: false });
    expect((await api.put('/exercises/nope', { name: 'X', unit: 'REPS' })).status).toBe(404);
  });
});

describe('programs', () => {
  it('saves a program with its days and exercises in order', async () => {
    const pushUp = await exercise('Push-up');
    const plank = await exercise('Plank', 'SECONDS');
    const res = await api.post('/programs', programBody(pushUp, plank));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Beginner strength',
      level: 'Beginner',
      goal: null,
      dayCount: 2,
      activeMembers: 0,
      members: [],
      days: [
        {
          title: 'Day A — Push',
          exercises: [
            {
              name: 'Push-up',
              unit: 'REPS',
              sets: 3,
              target: 10,
              restSeconds: 90,
              note: 'Knees if needed',
            },
            { name: 'Plank', unit: 'SECONDS', sets: 3, target: 30, restSeconds: null, note: null },
          ],
        },
        { title: 'Day B — Core', exercises: [{ name: 'Plank', target: 45 }] },
      ],
    });
  });

  it('replaces the days when the program is saved again', async () => {
    const pushUp = await exercise('Push-up');
    const plank = await exercise('Plank', 'SECONDS');
    const { body } = await api.post('/programs', programBody(pushUp, plank));

    const res = await api.put(`/programs/${body.id}`, {
      name: 'Beginner strength v2',
      days: [{ title: 'Full body', exercises: [{ exerciseId: plank, sets: 2, target: 60 }] }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Beginner strength v2', level: null, dayCount: 1 });
    expect(await prisma.programDay.count()).toBe(1);
    expect(await prisma.programExercise.count()).toBe(1);
  });

  it('refuses empty programs or days, numbers out of range and unknown exercises', async () => {
    const pushUp = await exercise('Push-up');

    const empty = await api.post('/programs', { name: 'Empty', days: [] });
    expect(empty.status).toBe(400);

    const bad = await api.post('/programs', {
      name: 'Bad',
      days: [
        { title: 'A', exercises: [] },
        {
          title: 'B',
          exercises: [{ exerciseId: pushUp, sets: 0, target: 1.5, restSeconds: 9999 }],
        },
      ],
    });
    expect(bad.status).toBe(400);
    const paths = (bad.body.error.details as { path: (string | number)[] }[]).map((i) =>
      i.path.join('.'),
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        'days.0.exercises',
        'days.1.exercises.0.sets',
        'days.1.exercises.0.target',
        'days.1.exercises.0.restSeconds',
      ]),
    );

    const unknown = await api.post('/programs', {
      name: 'Unknown',
      days: [{ title: 'A', exercises: [{ exerciseId: 'nope', sets: 1, target: 1 }] }],
    });
    expect(unknown.body.error.code).toBe('EXERCISE_NOT_FOUND');
    expect(await prisma.program.count()).toBe(0);
  });

  it('keeps a retired exercise a program already had, but refuses adding it anew', async () => {
    const pushUp = await exercise('Push-up');
    const plank = await exercise('Plank', 'SECONDS');
    const { body } = await api.post('/programs', programBody(pushUp, plank));
    await api.put(`/exercises/${plank}`, { name: 'Plank', unit: 'SECONDS', isActive: false });

    expect((await api.put(`/programs/${body.id}`, programBody(pushUp, plank))).status).toBe(200);
    const fresh = await api.post('/programs', programBody(pushUp, plank, 'Another'));
    expect(fresh.body.error.code).toBe('EXERCISE_INACTIVE');
  });

  it('lists active and archived programs apart', async () => {
    const pushUp = await exercise('Push-up');
    const plank = await exercise('Plank', 'SECONDS');
    const { body } = await api.post('/programs', programBody(pushUp, plank));

    expect((await api.get('/programs')).body.programs).toHaveLength(1);
    await api.post(`/programs/${body.id}/archive`);
    expect((await api.get('/programs')).body.programs).toHaveLength(0);
    expect((await api.get('/programs?archived=true')).body.programs).toHaveLength(1);
    await api.post(`/programs/${body.id}/restore`);
    expect((await api.get('/programs')).body.programs).toHaveLength(1);
    expect((await api.get('/programs/nope')).status).toBe(404);
  });
});

describe('assigning programs', () => {
  async function setup() {
    const pushUp = await exercise('Push-up');
    const plank = await exercise('Plank', 'SECONDS');
    const a = (await api.post('/programs', programBody(pushUp, plank, 'Program A'))).body
      .id as string;
    const b = (await api.post('/programs', programBody(pushUp, plank, 'Program B'))).body
      .id as string;
    return { a, b, memberId: await member() };
  }

  it('assigns, switches and ends, keeping the history', async () => {
    const { a, b, memberId } = await setup();
    expect((await api.get(`/members/${memberId}/program`)).body).toEqual({
      current: null,
      history: [],
    });

    const first = await api.put(`/members/${memberId}/program`, { programId: a });
    expect(first.body.current.program).toMatchObject({ name: 'Program A', activeMembers: 1 });

    const again = await api.put(`/members/${memberId}/program`, { programId: a });
    expect(again.body.error.code).toBe('PROGRAM_ALREADY_ASSIGNED');

    const switched = await api.put(`/members/${memberId}/program`, { programId: b });
    expect(switched.body.current.program.name).toBe('Program B');
    expect(switched.body.history).toEqual([
      expect.objectContaining({ programId: a, name: 'Program A' }),
    ]);

    const programA = await api.get(`/programs/${a}`);
    expect(programA.body).toMatchObject({ activeMembers: 0, members: [] });
    const programB = await api.get(`/programs/${b}`);
    expect(programB.body.members).toEqual([
      expect.objectContaining({ id: memberId, firstName: 'Omar' }),
    ]);

    const ended = await api.delete(`/members/${memberId}/program`);
    expect(ended.body.current).toBeNull();
    expect(ended.body.history).toHaveLength(2);
    expect((await api.delete(`/members/${memberId}/program`)).body.error.code).toBe(
      'NO_CURRENT_PROGRAM',
    );
  });

  it('never leaves two current programs, even for simultaneous assignments', async () => {
    const { a, b, memberId } = await setup();
    await Promise.all([
      api.put(`/members/${memberId}/program`, { programId: a }),
      api.put(`/members/${memberId}/program`, { programId: b }),
    ]);
    expect(await prisma.memberProgram.count({ where: { memberId, endedAt: null } })).toBe(1);
  });

  it('refuses archived programs, archived members and unknown ids', async () => {
    const { a, b, memberId } = await setup();
    await api.post(`/programs/${a}/archive`);
    expect((await api.put(`/members/${memberId}/program`, { programId: a })).body.error.code).toBe(
      'PROGRAM_ARCHIVED',
    );
    expect((await api.put(`/members/${memberId}/program`, { programId: 'nope' })).status).toBe(400);
    expect((await api.get('/members/nope/program')).status).toBe(404);

    await api.post(`/members/${memberId}/archive`);
    expect((await api.put(`/members/${memberId}/program`, { programId: b })).body.error.code).toBe(
      'MEMBER_ARCHIVED',
    );
  });
});
