/** 2000, "USD" -> "$20.00" (server-side text, e.g. the simulated payment page). */
export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(cents / 100);
}
