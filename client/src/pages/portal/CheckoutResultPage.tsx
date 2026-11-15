import type { CheckoutState } from '@calisthenics/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useApi } from '../../api/useApi';
import { Card } from '../../components/ui/Card';
import { errorMessage } from '../../features/auth/errorMessage';
import { formatDate, formatMoney } from '../../lib/format';

/** Ask again every few seconds while the provider has not answered, for up to two minutes. */
const POLL_MS = 3000;
const POLL_LIMIT = 40;

/** Where the provider sends the client back: paid, failed, or still waiting. */
export function CheckoutResultPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const { data, error, reload } = useApi<CheckoutState>(`/portal/checkout/${id}`);
  const [polls, setPolls] = useState(0);

  const waiting = data?.status === 'PENDING' && polls < POLL_LIMIT;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      reload();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, polls, reload]);

  if (error) return <p className="text-danger">{errorMessage(error, t)}</p>;
  if (!data) return <p className="text-muted">{t('common.loading')}</p>;

  const amount = formatMoney(data.amountCents, data.currency, i18n.language);
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <h1 className="font-display text-[40px] font-bold uppercase leading-none">
        {t('checkout.title')}
      </h1>
      <Card accent={data.status === 'PAID'} aria-live="polite">
        {data.status === 'PAID' && data.period ? (
          <>
            <p className="text-lg font-semibold text-lime">{t('checkout.paid')}</p>
            <p className="text-soft">
              {t('checkout.paidDetail', {
                plan: data.planName,
                amount,
                start: formatDate(data.period.startDate, i18n.language),
                end: formatDate(data.period.endDate, i18n.language),
              })}
            </p>
          </>
        ) : data.status === 'PENDING' ? (
          <>
            <p className="text-lg font-semibold">{t('checkout.waiting')}</p>
            <p className="text-soft">
              {t(polls < POLL_LIMIT ? 'checkout.waitingDetail' : 'checkout.stillWaiting')}
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-danger">
              {t(data.status === 'EXPIRED' ? 'checkout.expired' : 'checkout.failed')}
            </p>
            <p className="text-soft">{t('checkout.failedDetail')}</p>
          </>
        )}
      </Card>
      <Link to="/portal" className="self-start font-semibold text-lime">
        {t('checkout.backHome')}
      </Link>
    </div>
  );
}
