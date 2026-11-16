import { checkInInputSchema, checkInListQuerySchema, monthSchema } from '@calisthenics/shared';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import * as attendanceService from './attendance.service.js';

export const checkInsRouter = Router();

checkInsRouter.use(requireAuth, requireRole('OWNER'));

/** ?date=2026-11-15; without it, today in the gym timezone. */
checkInsRouter.get('/', async (req, res) => {
  const { date } = checkInListQuerySchema.parse(req.query);
  res.json(await attendanceService.listCheckIns(date));
});

checkInsRouter.post('/', async (req, res) => {
  const input = checkInInputSchema.parse(req.body);
  res.status(201).json(await attendanceService.checkIn(input, currentUser(req).id));
});

checkInsRouter.delete('/:id', async (req, res) => {
  await attendanceService.removeCheckIn(req.params.id, currentUser(req).id);
  res.status(204).end();
});

const attendanceQuery = z.object({ month: monthSchema.optional() });

/** Mounted under /api/members/:id/attendance. */
export const memberAttendanceRouter = Router({ mergeParams: true });

memberAttendanceRouter.use(requireAuth, requireRole('OWNER'));

memberAttendanceRouter.get('/', async (req, res) => {
  const { month } = attendanceQuery.parse(req.query);
  const { id } = req.params as { id: string };
  res.json(await attendanceService.memberAttendance(id, month));
});
