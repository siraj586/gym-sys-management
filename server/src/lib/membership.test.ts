import {
  addMonths,
  isIsoDate,
  memberStatus,
  subscriptionEndDate,
  subscriptionStatus,
  todayIn,
} from '@calisthenics/shared';
import { describe, expect, it } from 'vitest';

// Pure rules from @calisthenics/shared; they run here because the server owns the test runner.

describe('dates', () => {
  it('accepts real days only', () => {
    expect(isIsoDate('2026-11-15')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('15/11/2026')).toBe(false);
  });

  it('adds months and clamps to the end of shorter months', () => {
    expect(addMonths('2026-10-03', 1)).toBe('2026-11-03');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('reads today in the gym timezone, not the server one', () => {
    const lateEveningUtc = new Date('2026-11-15T23:30:00Z');
    expect(todayIn('UTC', lateEveningUtc)).toBe('2026-11-15');
    expect(todayIn('Asia/Beirut', lateEveningUtc)).toBe('2026-11-16');
  });
});

describe('subscription rules', () => {
  it('ends on the same day of the month, as the schema documents', () => {
    expect(subscriptionEndDate('2026-10-03', 1)).toBe('2026-11-03');
  });

  const sub = (startDate: string, endDate: string, cancelledAt: string | null = null) => ({
    startDate,
    endDate,
    cancelledAt,
  });
  const today = '2026-11-15';

  it('derives each subscription status from the dates', () => {
    expect(subscriptionStatus(sub('2026-11-20', '2026-12-20'), today)).toBe('UPCOMING');
    expect(subscriptionStatus(sub('2026-11-01', '2026-12-01'), today)).toBe('ACTIVE');
    expect(subscriptionStatus(sub('2026-10-22', '2026-11-22'), today)).toBe('EXPIRING');
    expect(subscriptionStatus(sub('2026-10-15', '2026-11-15'), today)).toBe('EXPIRING');
    expect(subscriptionStatus(sub('2026-10-14', '2026-11-14'), today)).toBe('EXPIRED');
    expect(subscriptionStatus(sub('2026-11-01', '2026-12-01', 'x'), today)).toBe('CANCELLED');
  });

  it('does not call a member expiring when the next month is already booked', () => {
    const current = sub('2026-10-20', '2026-11-20');
    expect(memberStatus([current], today)).toBe('EXPIRING');
    expect(memberStatus([current, sub('2026-11-21', '2026-12-21')], today)).toBe('ACTIVE');
  });

  it('covers the remaining member statuses', () => {
    expect(memberStatus([], today)).toBe('NONE');
    expect(memberStatus([sub('2026-11-01', '2026-12-01', 'x')], today)).toBe('NONE');
    expect(memberStatus([sub('2026-09-01', '2026-10-01')], today)).toBe('EXPIRED');
    expect(memberStatus([sub('2026-12-01', '2027-01-01')], today)).toBe('UPCOMING');
  });
});
