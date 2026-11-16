import { z } from 'zod';
import { isIsoDate } from './dates.js';

// Validation messages are translation keys, as in auth.ts.

const isoDate = z.string().trim().refine(isIsoDate, 'validation.date');

export const checkInInputSchema = z.object({
  memberId: z.string().min(1, 'validation.required'),
  /** Omitted: today in the gym timezone. A past day can be filled in afterwards. */
  date: isoDate.optional(),
});
export type CheckInInput = z.infer<typeof checkInInputSchema>;

export const checkInListQuerySchema = z.object({ date: isoDate.optional() });

export interface CheckIn {
  id: string;
  date: string;
  /** The exact moment it was recorded (ISO timestamp). */
  checkedInAt: string;
  member: { id: string; firstName: string; lastName: string; paidThrough: string | null };
  recordedBy: string;
}

export interface CheckInListResponse {
  date: string;
  checkIns: CheckIn[];
}

export interface MemberAttendance {
  month: string;
  /** Days in `month` the member came, oldest first. */
  days: string[];
  /** Most recent visit ever, or null if they never came. */
  lastVisit: string | null;
  totalVisits: number;
}
