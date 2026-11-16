import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { signAccessToken } from '../lib/tokens.js';
import { requireAuth, requireRole } from './auth.js';
import { errorHandler } from './errorHandler.js';

// A tiny app with one owner-only route, to test the guards on their own.
const app = express();
app.get('/owner-only', requireAuth, requireRole('OWNER'), (req, res) => {
  res.json({ id: req.user?.id });
});
app.use(errorHandler);

const bearer = (role: 'OWNER' | 'CLIENT') =>
  `Bearer ${signAccessToken({ id: `${role.toLowerCase()}-1`, role })}`;

describe('role guards', () => {
  it('lets the owner in', async () => {
    const res = await request(app).get('/owner-only').set('Authorization', bearer('OWNER'));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('owner-1');
  });

  it('blocks a client with 403', async () => {
    const res = await request(app).get('/owner-only').set('Authorization', bearer('CLIENT'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('blocks a request with no token with 401', async () => {
    const res = await request(app).get('/owner-only');
    expect(res.status).toBe(401);
  });

  it('blocks a token signed with another secret', async () => {
    const jwt = await import('jsonwebtoken');
    const forged = jwt.default.sign({ role: 'OWNER' }, 'x'.repeat(40), { subject: 'evil' });
    const res = await request(app).get('/owner-only').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});
