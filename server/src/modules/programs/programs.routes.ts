import { assignProgramSchema, exerciseInputSchema, programInputSchema } from '@calisthenics/shared';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import * as exercisesService from './exercises.service.js';
import * as programsService from './programs.service.js';

// ---------- /api/exercises ----------

export const exercisesRouter = Router();

exercisesRouter.use(requireAuth, requireRole('OWNER'));

exercisesRouter.get('/', async (_req, res) => {
  res.json({ exercises: await exercisesService.listExercises() });
});

exercisesRouter.post('/', async (req, res) => {
  res.status(201).json(await exercisesService.createExercise(exerciseInputSchema.parse(req.body)));
});

exercisesRouter.put('/:id', async (req, res) => {
  const input = exerciseInputSchema.parse(req.body);
  res.json(await exercisesService.updateExercise(req.params.id, input));
});

exercisesRouter.delete('/:id', async (req, res) => {
  await exercisesService.deleteExercise(req.params.id, currentUser(req).id);
  res.status(204).end();
});

// ---------- /api/programs ----------

export const programsRouter = Router();

programsRouter.use(requireAuth, requireRole('OWNER'));

const listQuery = z.object({
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

programsRouter.get('/', async (req, res) => {
  const { archived } = listQuery.parse(req.query);
  res.json({ programs: await programsService.listPrograms(archived) });
});

programsRouter.post('/', async (req, res) => {
  res.status(201).json(await programsService.createProgram(programInputSchema.parse(req.body)));
});

programsRouter.get('/:id', async (req, res) => {
  res.json(await programsService.getProgram(req.params.id));
});

programsRouter.put('/:id', async (req, res) => {
  const input = programInputSchema.parse(req.body);
  res.json(await programsService.updateProgram(req.params.id, input));
});

const duplicateBody = z.object({ suffix: z.string().max(20).default(' (copy)') });

/** The client sends the suffix in its own language: " (copy)" or " (نسخة)". */
programsRouter.post('/:id/duplicate', async (req, res) => {
  const { suffix } = duplicateBody.parse(req.body ?? {});
  res.status(201).json(await programsService.duplicateProgram(req.params.id, suffix));
});

programsRouter.delete('/:id', async (req, res) => {
  await programsService.deleteProgram(req.params.id, currentUser(req).id);
  res.status(204).end();
});

programsRouter.post('/:id/archive', async (req, res) => {
  res.json(await programsService.setArchived(req.params.id, true));
});

programsRouter.post('/:id/restore', async (req, res) => {
  res.json(await programsService.setArchived(req.params.id, false));
});

// ---------- /api/members/:id/program ----------

export const memberProgramRouter = Router({ mergeParams: true });

memberProgramRouter.use(requireAuth, requireRole('OWNER'));

const memberId = (params: unknown) => (params as { id: string }).id;

memberProgramRouter.get('/', async (req, res) => {
  res.json(await programsService.getMemberProgram(memberId(req.params)));
});

/** Assign (or switch to) a program. */
memberProgramRouter.put('/', async (req, res) => {
  const { programId } = assignProgramSchema.parse(req.body);
  res.json(await programsService.assignProgram(memberId(req.params), programId));
});

/** End the current program. */
memberProgramRouter.delete('/', async (req, res) => {
  res.json(await programsService.endProgram(memberId(req.params)));
});
