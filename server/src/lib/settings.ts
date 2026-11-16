import { todayIn, type GymSettings, type SettingsInput } from '@calisthenics/shared';
import { prisma } from './prisma.js';

// Used until `npm run db:seed` creates the settings row.
const DEFAULTS = {
  businessName: 'Calisthenics Coach',
  timezone: 'UTC',
  currency: 'USD',
  coachName: null,
  coachBio: null,
  address: null,
  phone: null,
  instagram: null,
  openingHours: null,
};

/** The gym's settings, plus today's date in the gym's timezone. */
export async function getSettings(): Promise<GymSettings> {
  const s =
    (await prisma.settings.findUnique({ where: { id: 1 }, omit: { id: true } })) ?? DEFAULTS;
  return { ...s, today: todayIn(s.timezone) };
}

export async function updateSettings(input: SettingsInput): Promise<GymSettings> {
  await prisma.settings.upsert({ where: { id: 1 }, update: input, create: { id: 1, ...input } });
  return getSettings();
}

/** Today in the gym's timezone: "is this membership still valid?" depends on it. */
export async function gymToday(): Promise<string> {
  return (await getSettings()).today;
}
