// Calendar dates travel as "YYYY-MM-DD" strings. They are days, not instants,
// so all arithmetic here is done in UTC where no clock change can shift a day.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function toUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const date = toUtc(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/**
 * Same day of the month, `months` later. When that month is shorter the result
 * is its last day: 31 Jan + 1 month = 28 Feb (29 in a leap year).
 */
export function addMonths(isoDate: string, months: number): string {
  const date = toUtc(isoDate);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return fromUtc(date);
}

/** Today's date as seen on a wall clock in `timeZone` (an IANA name such as Asia/Beirut). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
