import {
  measurementInputSchema,
  performanceInputSchema,
  progressNoteInputSchema,
} from '@calisthenics/shared';
import { Router } from 'express';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import * as progressService from './progress.service.js';

/** Mounted under /api/members/:id/progress. */
export const memberProgressRouter = Router({ mergeParams: true });

memberProgressRouter.use(requireAuth, requireRole('OWNER'));

const memberId = (params: unknown) => (params as { id: string }).id;

memberProgressRouter.get('/', async (req, res) => {
  res.json(await progressService.getProgress(memberId(req.params)));
});

memberProgressRouter.post('/performance', async (req, res) => {
  const input = performanceInputSchema.parse(req.body);
  await progressService.addPerformance(memberId(req.params), input);
  res.status(201).json(await progressService.getProgress(memberId(req.params)));
});

memberProgressRouter.post('/measurements', async (req, res) => {
  const input = measurementInputSchema.parse(req.body);
  await progressService.addMeasurement(memberId(req.params), input);
  res.status(201).json(await progressService.getProgress(memberId(req.params)));
});

memberProgressRouter.post('/notes', async (req, res) => {
  const { body } = progressNoteInputSchema.parse(req.body);
  res.status(201).json(await progressService.addNote(memberId(req.params), body));
});

/** /api/progress/...: removing one entry by its own id. */
export const progressEntriesRouter = Router();

progressEntriesRouter.use(requireAuth, requireRole('OWNER'));

const entities = {
  performance: 'PerformanceRecord',
  measurements: 'BodyMeasurement',
  notes: 'ProgressNote',
} as const;

for (const [path, entity] of Object.entries(entities)) {
  progressEntriesRouter.delete(`/${path}/:id`, async (req, res) => {
    await progressService.removeEntry(entity, req.params.id, currentUser(req).id);
    res.status(204).end();
  });
}
