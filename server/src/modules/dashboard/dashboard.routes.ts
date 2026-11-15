import { Router } from 'express';
import { gymToday } from '../../lib/settings.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as dashboardService from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole('OWNER'));

dashboardRouter.get('/', async (_req, res) => {
  res.json(await dashboardService.dashboard());
});

/** Everyone who owes money, for the payments page. */
dashboardRouter.get('/not-paid', async (_req, res) => {
  res.json({ notPaid: await dashboardService.notPaid(await gymToday()) });
});
