import type { Plan, PlanInput } from '@calisthenics/shared';
import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

const planSelect = {
  id: true,
  name: true,
  priceCents: true,
  durationMonths: true,
  description: true,
  isActive: true,
} satisfies Prisma.PlanSelect;

const planNotFound = () => new AppError(404, 'PLAN_NOT_FOUND', 'This plan does not exist.');

/** Active plans first, then by price. */
export function listPlans(): Promise<Plan[]> {
  return prisma.plan.findMany({
    select: planSelect,
    orderBy: [{ isActive: 'desc' }, { priceCents: 'asc' }, { name: 'asc' }],
  });
}

export function createPlan(input: PlanInput): Promise<Plan> {
  return prisma.plan.create({ data: input, select: planSelect });
}

/**
 * Editing a plan never changes subscriptions already sold: each subscription
 * keeps its own copy of the name and price. Plans are retired with isActive,
 * never deleted, because subscriptions point at them.
 */
export async function updatePlan(id: string, input: PlanInput): Promise<Plan> {
  try {
    return await prisma.plan.update({ where: { id }, data: input, select: planSelect });
  } catch (err) {
    // P2025 = no row matched the where clause.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw planNotFound();
    }
    throw err;
  }
}
