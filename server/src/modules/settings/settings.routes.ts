import { Router } from 'express';
import { getSettings } from '../../lib/settings.js';
import { requireAuth } from '../../middleware/auth.js';

export const settingsRouter = Router();

// Any signed-in user: the portal needs the currency and the date as much as the coach.
settingsRouter.get('/', requireAuth, async (_req, res) => {
  res.json(await getSettings());
});
