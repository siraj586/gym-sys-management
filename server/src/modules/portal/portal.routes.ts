import { monthSchema, portalProfileInputSchema } from '@calisthenics/shared';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import * as portalService from './portal.service.js';

/**
 * The client portal. Every route answers about the signed-in client only: the
 * member is found from the access token, never from an id in the request.
 */
export const portalRouter = Router();

portalRouter.use(requireAuth, requireRole('CLIENT'));

portalRouter.get('/home', async (req, res) => {
  res.json(await portalService.home(currentUser(req).id));
});

const monthQuery = z.object({ month: monthSchema.optional() });

portalRouter.get('/attendance', async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  res.json(await portalService.attendance(currentUser(req).id, month));
});

portalRouter.get('/progress', async (req, res) => {
  res.json(await portalService.progress(currentUser(req).id));
});

portalRouter.get('/profile', async (req, res) => {
  res.json(await portalService.profile(currentUser(req).id));
});

portalRouter.put('/profile', async (req, res) => {
  const input = portalProfileInputSchema.parse(req.body);
  res.json(await portalService.updateProfile(currentUser(req).id, input));
});
