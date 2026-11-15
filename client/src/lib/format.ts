import { daysBetween, EXPIRING_SOON_DAYS } from '@calisthenics/shared';
import type { TFunction } from 'i18next';

// Numbers and dates follow the interface language: Arabic gets Arabic month names.

/** "2026-11-15" -> "15 Nov 2026" / "١٥ نوفمبر ٢٠٢٦". The value is a day, so no timezone shift. */
export function formatDate(isoDate: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * A month's end in words, from the gym's today: "Expired 5 days ago",
 * "Expired yesterday", "Ends today", "Ends in 2 days", or "Ends 2 Dec".
 */
export function endsText(t: TFunction, today: string, endDate: string, language: string): string {
  const days = daysBetween(today, endDate);
  if (days < 0) return t('ends.expiredAgo', { count: -days });
  if (days === 0) return t('ends.today');
  if (days <= EXPIRING_SOON_DAYS) return t('ends.inDays', { count: days });
  return t('ends.on', {
    date: new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${endDate}T00:00:00Z`),
    ),
  });
}

/** "13 Oct – 13 Nov": a period without the year, for dense rows. */
export function formatPeriod(start: string, end: string, language: string): string {
  const f = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${f.format(new Date(`${start}T00:00:00Z`))} – ${f.format(new Date(`${end}T00:00:00Z`))}`;
}

/** Clock time of an instant, as seen in the gym's timezone (not the viewer's). */
export function formatTime(isoTimestamp: string, language: string, timeZone: string): string {
  return new Intl.DateTimeFormat(language, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(isoTimestamp));
}

export function formatMoney(cents: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, { style: 'currency', currency }).format(cents / 100);
}

/** "50" or "50.5" typed in a form -> 5000 / 5050 cents. NaN when it is not a price. */
export function parsePriceToCents(value: string): number {
  const trimmed = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed) * 100);
}

export function centsToPriceInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
