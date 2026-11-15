import {
  memberInputSchema,
  memberListQuerySchema,
  paymentInputSchema,
  renewalInputSchema,
  subscriptionInputSchema,
} from '@calisthenics/shared';
import { Router } from 'express';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import * as paymentsService from '../payments/payments.service.js';
import * as membersService from './members.service.js';

/** The coach's member records. Clients will read their own profile through /portal routes. */
export const membersRouter = Router();

membersRouter.use(requireAuth, requireRole('OWNER'));

membersRouter.get('/', async (req, res) => {
  res.json(await membersService.listMembers(memberListQuerySchema.parse(req.query)));
});

membersRouter.get('/counts', async (_req, res) => {
  res.json(await membersService.countByStatus());
});

membersRouter.post('/', async (req, res) => {
  res.status(201).json(await membersService.createMember(memberInputSchema.parse(req.body)));
});

membersRouter.get('/:id', async (req, res) => {
  res.json(await membersService.getMember(req.params.id));
});

membersRouter.put('/:id', async (req, res) => {
  res.json(await membersService.updateMember(req.params.id, memberInputSchema.parse(req.body)));
});

/** Delete a member for good, with all their history. */
membersRouter.delete('/:id', async (req, res) => {
  await membersService.deleteMember(req.params.id, currentUser(req).id);
  res.status(204).end();
});

membersRouter.post('/:id/archive', async (req, res) => {
  res.json(await membersService.setArchived(req.params.id, true));
});

membersRouter.post('/:id/restore', async (req, res) => {
  res.json(await membersService.setArchived(req.params.id, false));
});

membersRouter.post('/:id/renewals', async (req, res) => {
  const input = renewalInputSchema.parse(req.body);
  res.status(201).json(await membersService.renew(req.params.id, input, currentUser(req).id));
});

membersRouter.post('/:id/subscriptions', async (req, res) => {
  const input = subscriptionInputSchema.parse(req.body);
  res.status(201).json(await membersService.createSubscription(req.params.id, input));
});

export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth, requireRole('OWNER'));

/** Delete one month and its payments (e.g. a renewal saved twice). */
subscriptionsRouter.delete('/:id', async (req, res) => {
  await membersService.deleteSubscription(req.params.id, currentUser(req).id);
  res.status(204).end();
});

subscriptionsRouter.post('/:id/cancel', async (req, res) => {
  res.json(await membersService.cancelSubscription(req.params.id));
});

subscriptionsRouter.post('/:id/payments', async (req, res) => {
  const input = paymentInputSchema.parse(req.body);
  res
    .status(201)
    .json(await paymentsService.recordPayment(req.params.id, input, currentUser(req).id));
});
