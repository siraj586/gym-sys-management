/** A member whose month has just ended or ends within the expiring window. */
export interface RenewalDue {
  memberId: string;
  firstName: string;
  lastName: string;
  startDate: string;
  endDate: string;
  /** Days until the end date: negative once it has passed (-1 = ended yesterday). */
  daysLeft: number;
  planId: string;
}

/**
 * Someone who owes money: their month ran out (EXPIRED), they never paid a
 * month (NEVER), or a month they have is only partly paid (BALANCE).
 */
export interface NotPaid {
  memberId: string;
  firstName: string;
  lastName: string;
  reason: 'EXPIRED' | 'NEVER' | 'BALANCE';
  /** The end of their last month (EXPIRED) or of the partly paid month (BALANCE). */
  endDate: string | null;
  /** Their usual month's price, or what is left to pay. Null when no plan is on sale. */
  amountCents: number | null;
  /** For BALANCE: the subscription to pay into. */
  subscriptionId: string | null;
}

export interface MonthRevenue {
  /** "2026-11" */
  month: string;
  cents: number;
}

export interface DashboardData {
  today: string;
  totalMembers: number;
  joinedThisMonth: number;
  /** Covered today, including those ending soon. */
  activeSubscriptions: number;
  endingSoon: number;
  expired: number;
  collectedThisMonthCents: number;
  paymentsThisMonth: number;
  checkInsToday: number;
  /** Ended in the last 30 days first (most recent first), then ending soonest. */
  renewals: RenewalDue[];
  notPaid: NotPaid[];
  notPaidCents: number;
  /** The last six months, oldest first, the current month last. */
  revenue: MonthRevenue[];
}
