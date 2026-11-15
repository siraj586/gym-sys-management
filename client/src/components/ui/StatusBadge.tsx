import type { MemberStatus, SubscriptionStatus } from '@calisthenics/shared';
import { useTranslation } from 'react-i18next';

const styles: Record<MemberStatus | SubscriptionStatus, string> = {
  ACTIVE: 'border-lime text-lime',
  EXPIRING: 'border-warn text-warn',
  UPCOMING: 'border-soft text-soft',
  EXPIRED: 'border-danger text-danger',
  CANCELLED: 'border-line text-muted line-through',
  NONE: 'border-line text-muted',
};

/** Coloured label for a member or subscription status; the text carries the meaning, not only the colour. */
export function StatusBadge({ status }: { status: MemberStatus | SubscriptionStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}
