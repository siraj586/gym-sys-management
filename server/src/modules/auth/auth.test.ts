import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { hashPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { resetDatabase } from '../../test/db.js';

const lina = {
  firstName: 'Lina',
  lastName: 'Farouk',
  phone: '+961 70 123 456',
  email: 'lina@example.com',
  password: 'correct-horse-battery',
};

/** The refresh cookie as "name=value", ready to send back in a Cookie header. */
function refreshCookie(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('No refresh cookie in the response');
  return cookie.split(';')[0]!;
}

const register = (body: object = lina) => request(app).post('/api/auth/register').send(body);
const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });
const refresh = (cookie: string) => request(app).post('/api/auth/refresh').set('Cookie', cookie);

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('register', () => {
  it('creates a client account with a member profile and starts a session', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      email: 'lina@example.com',
      role: 'CLIENT',
      member: { firstName: 'Lina', lastName: 'Farouk' },
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth');
  });

  it('stores a hash, never the password itself', async () => {
    await register();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: lina.email } });
    expect(user.passwordHash).not.toContain(lina.password);
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('ignores a role sent by the client: nobody can register as owner', async () => {
    const res = await register({ ...lina, role: 'OWNER' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('CLIENT');
  });

  it('rejects an email that is already registered, whatever its letter case', async () => {
    await register();
    const res = await register({ ...lina, email: 'LINA@Example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(await prisma.user.count()).toBe(1);
  });

  it('rejects invalid input and says which fields are wrong', async () => {
    const res = await register({ ...lina, email: 'not-an-email', password: 'short', phone: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = (res.body.error.details as { path: string[] }[]).map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'phone']));
    expect(await prisma.user.count()).toBe(0);
  });
});

describe('login', () => {
  beforeEach(async () => {
    await register();
  });

  it('signs in with the right password', async () => {
    const res = await login('  Lina@Example.com ', lina.password);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(lina.email);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await login(lina.email, 'wrong-password');
    const unknownEmail = await login('nobody@example.com', lina.password);
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it('refuses a disabled account', async () => {
    await prisma.user.update({ where: { email: lina.email }, data: { isActive: false } });
    const res = await login(lina.email, lina.password);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('GET /me', () => {
  it('requires an access token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the signed-in user', async () => {
    const { body } = await register();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(lina.email);
  });

  it('rejects a token that was altered', async () => {
    const { body } = await register();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}x`);
    expect(res.status).toBe(401);
  });
});

describe('refresh', () => {
  it('swaps the refresh token for a new session', async () => {
    const first = refreshCookie(await register());
    const res = await refresh(first);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).not.toBe(first);
  });

  it('fails without a cookie or with a made-up token', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
    expect((await refresh('refresh_token=made-up')).body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('lets a token be used only once; a second tab is told to retry', async () => {
    const first = refreshCookie(await register());
    const [a, b] = await Promise.all([refresh(first), refresh(first)]);
    const statuses = [a.status, b.status].sort();

    expect(statuses).toEqual([200, 401]);
    const loser = a.status === 401 ? a : b;
    expect(loser.body.error.code).toBe('REFRESH_RACE');
    // The retry in the losing tab succeeds with the cookie the winning tab received.
    const winner = a.status === 200 ? a : b;
    expect((await refresh(refreshCookie(winner))).status).toBe(200);
  });

  it('treats a token reused later as stolen and ends every session', async () => {
    const stolen = refreshCookie(await register());
    const current = refreshCookie(await refresh(stolen));
    // Pretend the rotation happened a minute ago, outside the two-tab window.
    await prisma.refreshToken.updateMany({
      where: { revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const attacker = await refresh(stolen);
    expect(attacker.status).toBe(401);
    expect(attacker.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    // The real user's newer session is closed too, so they must sign in again.
    await prisma.refreshToken.updateMany({ data: { revokedAt: new Date(Date.now() - 60_000) } });
    expect((await refresh(current)).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const cookie = refreshCookie(await register());
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(cookie)).status).toBe(401);
  });

  it('rejects a disabled account', async () => {
    const cookie = refreshCookie(await register());
    await prisma.user.update({ where: { email: lina.email }, data: { isActive: false } });
    expect((await refresh(cookie)).status).toBe(401);
  });
});

describe('logout', () => {
  it('ends the session so the refresh token no longer works', async () => {
    const cookie = refreshCookie(await register());
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);

    await prisma.refreshToken.updateMany({ data: { revokedAt: new Date(Date.now() - 60_000) } });
    expect((await refresh(cookie)).status).toBe(401);
  });

  it('succeeds even without a session', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });
});

describe('owner account', () => {
  it('signs in and is reported as OWNER with no member profile', async () => {
    await prisma.user.create({
      data: {
        email: 'owner@example.com',
        passwordHash: await hashPassword('owner-password-123'),
        role: 'OWNER',
      },
    });
    const res = await login('owner@example.com', 'owner-password-123');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'OWNER', member: null });
  });
});
