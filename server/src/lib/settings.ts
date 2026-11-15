import { todayIn, type GymSettings } from '@calisthenics/shared';
import { prisma } from './prisma.js';

// Used until `npm run db:seed` creates the settings row.
const DEFAULTS = { businessName: 'Calisthenics Coach', timezone: 'UTC', currency: 'USD' };

/** The gym's settings, plus today's date in the gym's timezone. */
export async function getSettings(): Promise<GymSettings> {
  const row = await prisma.settings.findUnique({ where: { id: 1 } });
  const { businessName, timezone, currency } = row ?? DEFAULTS;
  return { businessName, timezone, currency, today: todayIn(timezone) };
}

/** Today in the gym's timezone: "is this membership still valid?" depends on it. */
export async function gymToday(): Promise<string> {
  return (await getSettings()).today;
}
