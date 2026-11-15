import { planInputSchema } from '@calisthenics/shared';
import { Router } from 'express';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import * as plansService from './plans.service.js';

export const plansRouter = Router();

plansRouter.use(requireAuth, requireRole('OWNER'));

plansRouter.get('/', async (_req, res) => {
  res.json({ plans: await plansService.listPlans() });
});

plansRouter.post('/', async (req, res) => {
  res.status(201).json(await plansService.createPlan(planInputSchema.parse(req.body)));
});

// PUT: the form always sends every field, so a full replace keeps the rules simple.
plansRouter.put('/:id', async (req, res) => {
  res.json(await plansService.updatePlan(req.params.id, planInputSchema.parse(req.body)));
});

/** Owner only, like every route here: delete a plan for good. */
plansRouter.delete('/:id', async (req, res) => {
  await plansService.deletePlan(req.params.id, currentUser(req).id);
  res.status(204).end();
});
