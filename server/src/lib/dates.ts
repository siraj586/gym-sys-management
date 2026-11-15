// Prisma reads and writes @db.Date columns as JavaScript Dates at UTC midnight.
// These two helpers are the only place that conversion happens.

/** "2026-11-15" -> Date for a @db.Date column. */
export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** Date from a @db.Date column -> "2026-11-15". */
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
