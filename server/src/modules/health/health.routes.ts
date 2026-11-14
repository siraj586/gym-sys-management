import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is not reachable.');
  }
  res.json({ status: 'ok', database: 'up' });
});
