/** Account roles. The owner manages the gym; a client only sees their own data. */
export const ROLES = ['OWNER', 'CLIENT'] as const;
export type Role = (typeof ROLES)[number];
