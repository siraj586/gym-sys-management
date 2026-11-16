import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';
import { resetDatabase } from '../../test/db.js';

const owner = `Bearer ${signAccessToken({ id: 'owner-1', role: 'OWNER' })}`;
const client = `Bearer ${signAccessToken({ id: 'client-1', role: 'CLIENT' })}`;
const asOwner = {
  get: (path: string) => request(app).get(`/api${path}`).set('Authorization', owner),
  post: (path: string, body: object = {}) =>
    request(app).post(`/api${path}`).set('Authorization', owner).send(body),
  put: (path: string, body: object) =>
    request(app).put(`/api${path}`).set('Authorization', owner).send(body),
  delete: (path: string) => request(app).delete(`/api${path}`).set('Authorization', owner),
};

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const settings = {
  businessName: 'Bar Brothers Gym',
  coachName: 'Siraj',
  coachBio: 'Ten years of coaching.',
  address: 'Beirut',
  phone: '+961 70 000 000',
  instagram: '@coach',
  openingHours: 'Every day 7:00–22:00',
  currency: 'usd',
  timezone: 'Asia/Beirut',
};

describe('settings', () => {
  it('lets the owner edit the site details, and nobody else', async () => {
    const res = await asOwner.put('/settings', settings);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      coachName: 'Siraj',
      currency: 'USD',
      timezone: 'Asia/Beirut',
    });

    const asClient = await request(app)
      .put('/api/settings')
      .set('Authorization', client)
      .send(settings);
    expect(asClient.status).toBe(403);
  });

  it('refuses an unknown timezone or currency', async () => {
    const res = await asOwner.put('/settings', {
      ...settings,
      timezone: 'Mars/Base',
      currency: 'dollars',
    });
    expect(res.status).toBe(400);
    const fields = (res.body.error.details as { path: string[] }[]).map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['timezone', 'currency']));
  });
});

describe('public site', () => {
  it('shows the details, the plans on sale and the gallery to anyone, nothing internal', async () => {
    await asOwner.put('/settings', settings);
    await asOwner.post('/plans', { name: 'Monthly', priceCents: 2000, durationMonths: 1 });
    await asOwner.post('/plans', {
      name: 'Old',
      priceCents: 1000,
      durationMonths: 1,
      isActive: false,
    });
    await asOwner.post('/gallery', { url: 'https://example.com/a.jpg', caption: 'Bars' });

    const res = await request(app).get('/api/public/site');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ businessName: 'Bar Brothers Gym', coachName: 'Siraj' });
    expect(res.body.plans.map((p: { name: string }) => p.name)).toEqual(['Monthly']);
    expect(res.body.gallery).toEqual([expect.objectContaining({ caption: 'Bars' })]);
    expect(res.body).not.toHaveProperty('timezone');
    expect(res.body).not.toHaveProperty('today');
  });
});

describe('gallery', () => {
  it('adds https images, reorders and removes them', async () => {
    expect((await asOwner.post('/gallery', { url: 'http://insecure.example/a.jpg' })).status).toBe(
      400,
    );
    const a = (await asOwner.post('/gallery', { url: 'https://example.com/a.jpg' })).body.id;
    const b = (await asOwner.post('/gallery', { url: 'https://example.com/b.jpg' })).body.id;

    const moved = await asOwner.post(`/gallery/${b}/move`, { direction: -1 });
    expect(moved.body.images.map((i: { id: string }) => i.id)).toEqual([b, a]);

    expect((await asOwner.delete(`/gallery/${a}`)).status).toBe(204);
    expect((await asOwner.delete(`/gallery/${a}`)).status).toBe(404);
    expect((await asOwner.get('/gallery')).body.images).toHaveLength(1);
  });
});

describe('contact messages', () => {
  it('takes a message from anyone; only the owner reads, marks and removes it', async () => {
    const sent = await request(app)
      .post('/api/public/contact')
      .send({ name: 'Rami', contact: 'rami@example.com', message: 'Do you train kids?' });
    expect(sent.status).toBe(201);
    expect(
      (await request(app).post('/api/public/contact').send({ name: '', contact: '', message: '' }))
        .status,
    ).toBe(400);

    expect((await request(app).get('/api/messages').set('Authorization', client)).status).toBe(403);
    const list = await asOwner.get('/messages');
    expect(list.body.messages).toEqual([expect.objectContaining({ name: 'Rami', isRead: false })]);
    const id = list.body.messages[0].id;

    await asOwner.post(`/messages/${id}/read`, { isRead: true });
    expect((await asOwner.get('/messages')).body.messages[0].isRead).toBe(true);
    expect((await asOwner.delete(`/messages/${id}`)).status).toBe(204);
    expect((await asOwner.delete(`/messages/${id}`)).status).toBe(404);
  });
});
