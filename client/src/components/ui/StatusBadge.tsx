import type { MemberStatus, SubscriptionStatus } from '@calisthenics/shared';
import { useTranslation } from 'react-i18next';
import { Pill, type Tone } from './Pill';

const tones: Record<MemberStatus | SubscriptionStatus, Tone> = {
  ACTIVE: 'lime',
  EXPIRING: 'warn',
  UPCOMING: 'neutral',
  EXPIRED: 'danger',
  CANCELLED: 'neutral',
  NONE: 'danger',
};

/** A member or subscription status as a filled pill. */
export function StatusBadge({ status }: { status: MemberStatus | SubscriptionStatus }) {
  const { t } = useTranslation();
  return <Pill tone={tones[status]}>{t(`status.${status}`)}</Pill>;
}
