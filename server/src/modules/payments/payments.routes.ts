import { monthSchema, paymentInputSchema, voidPaymentSchema } from '@calisthenics/shared';
import { Router } from 'express';
import { z } from 'zod';
import { gymToday } from '../../lib/settings.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import * as paymentsService from './payments.service.js';

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth, requireRole('OWNER'));

const listQuery = z.object({ month: monthSchema.optional() });

/** ?month=2026-11; without it, the current month in the gym timezone. */
paymentsRouter.get('/', async (req, res) => {
  const { month } = listQuery.parse(req.query);
  res.json(await paymentsService.listPayments(month ?? (await gymToday()).slice(0, 7)));
});

paymentsRouter.get('/unpaid', async (_req, res) => {
  res.json({ subscriptions: await paymentsService.listUnpaid() });
});

paymentsRouter.get('/summary', async (_req, res) => {
  res.json(await paymentsService.summary());
});

paymentsRouter.post('/:id/void', async (req, res) => {
  const { reason } = voidPaymentSchema.parse(req.body);
  res.json(await paymentsService.voidPayment(req.params.id, reason, currentUser(req).id));
});

/** Correct a payment (amount, method, date, reference, note). */
paymentsRouter.put('/:id', async (req, res) => {
  const input = paymentInputSchema.parse(req.body);
  res.json(await paymentsService.updatePayment(req.params.id, input, currentUser(req).id));
});

const deleteQuery = z.object({
  withMonth: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Delete a payment for good; ?withMonth=true also removes the month it alone paid for. */
paymentsRouter.delete('/:id', async (req, res) => {
  const { withMonth } = deleteQuery.parse(req.query);
  await paymentsService.deletePayment(req.params.id, currentUser(req).id, withMonth);
  res.status(204).end();
});
