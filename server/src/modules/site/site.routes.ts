import { contactInputSchema, galleryInputSchema, settingsInputSchema } from '@calisthenics/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { getSettings, updateSettings } from '../../lib/settings.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as siteService from './site.service.js';

// ---------- /api/public: no sign-in ----------

export const publicRouter = Router();

publicRouter.get('/site', async (_req, res) => {
  res.json(await siteService.publicSite());
});

/** The contact form is open to everyone, so it is rate limited per address. */
const contactLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, _res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many messages. Try again later.'));
  },
});

publicRouter.post('/contact', contactLimit, async (req, res) => {
  await siteService.receiveMessage(contactInputSchema.parse(req.body));
  res.status(201).end();
});

// ---------- /api/settings ----------

export const settingsRouter = Router();

// Any signed-in user: the portal needs the currency and the date as much as the coach.
settingsRouter.get('/', requireAuth, async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put('/', requireAuth, requireRole('OWNER'), async (req, res) => {
  res.json(await updateSettings(settingsInputSchema.parse(req.body)));
});

// ---------- /api/gallery and /api/messages: the coach ----------

export const galleryRouter = Router();

galleryRouter.use(requireAuth, requireRole('OWNER'));

galleryRouter.get('/', async (_req, res) => {
  res.json({ images: await siteService.listGallery() });
});

galleryRouter.post('/', async (req, res) => {
  const { url, caption } = galleryInputSchema.parse(req.body);
  res.status(201).json(await siteService.addImage(url, caption));
});

const moveBody = z.object({ direction: z.union([z.literal(-1), z.literal(1)]) });

galleryRouter.post('/:id/move', async (req, res) => {
  const { direction } = moveBody.parse(req.body);
  res.json({ images: await siteService.moveImage(req.params.id, direction) });
});

galleryRouter.delete('/:id', async (req, res) => {
  await siteService.removeImage(req.params.id);
  res.status(204).end();
});

export const messagesRouter = Router();

messagesRouter.use(requireAuth, requireRole('OWNER'));

messagesRouter.get('/', async (_req, res) => {
  res.json({ messages: await siteService.listMessages() });
});

const readBody = z.object({ isRead: z.boolean() });

messagesRouter.post('/:id/read', async (req, res) => {
  await siteService.setRead(req.params.id, readBody.parse(req.body).isRead);
  res.status(204).end();
});

messagesRouter.delete('/:id', async (req, res) => {
  await siteService.removeMessage(req.params.id);
  res.status(204).end();
});
