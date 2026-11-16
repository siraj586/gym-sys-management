import type { CheckoutOptions, CheckoutStarted } from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { formatMoney } from '../../lib/format';
import { errorMessage } from '../auth/errorMessage';
import { useSettings } from '../settings/SettingsContext';

/**
 * Shown to a client without a current month, e.g. right after signing up on
 * the website: the membership and its price, and Whish Money as the only way
 * to pay online. The client enters nothing about payment here: Whish's own
 * page takes care of that.
 */
export function SubscribeCard() {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const { data } = useApi<CheckoutOptions>('/portal/checkout/options');
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data || data.plans.length === 0) return null;
  const chosen =
    data.plans.find((p) => p.id === planId) ??
    data.plans.find((p) => p.id === data.suggestedPlanId) ??
    data.plans[0]!;
  const money = (cents: number) => formatMoney(cents, currency, i18n.language);

  const pay = async () => {
    setError(null);
    setBusy(true);
    try {
      const started = await apiFetch<CheckoutStarted>('/portal/checkout', {
        method: 'POST',
        body: { planId: chosen.id },
      });
      // Leave the app for Whish's payment page; it sends the client back.
      window.location.assign(started.redirectUrl);
    } catch (err) {
      setError(errorMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <Card accent title={t('subscribe.title')} subtitle={t('subscribe.subtitle')}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs text-soft">{t('subscribe.choosePlan')}</legend>
        {data.plans.map((p) => (
          <label
            key={p.id}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 ${p.id === chosen.id ? 'border-lime bg-lime-wash' : 'border-line hover:border-soft'}`}
          >
            <input
              type="radio"
              name="plan"
              value={p.id}
              checked={p.id === chosen.id}
              onChange={() => setPlanId(p.id)}
              className="size-4 accent-lime"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{p.name}</span>
              {p.description && <span className="text-xs text-muted">{p.description}</span>}
            </span>
            <span className="font-display text-2xl font-bold text-lime">
              {money(p.priceCents)}
              <span className="ms-1 text-sm font-normal text-soft">
                {t('site.perMonths', { count: p.durationMonths })}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-soft">{t('payments.method')}</span>
        {/* The only way to pay online: shown, not chosen. */}
        <span className="flex min-h-11 items-center gap-2 self-start rounded-md border border-lime bg-chip px-4 text-sm font-semibold">
          <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
          {t('paymentMethod.WHISH_MONEY')}
        </span>
      </div>

      {data.provider === 'fake' && (
        <p className="rounded bg-warn-wash px-2.5 py-1.5 text-xs text-warn">
          {t('checkout.simulated')}
        </p>
      )}
      <p className="text-xs text-muted">{t('checkout.howItWorks')}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {data.enabled ? (
        <Button className="self-start" disabled={busy} onClick={() => void pay()}>
          {t('subscribe.pay', { amount: money(chosen.priceCents) })}
        </Button>
      ) : (
        <>
          <Button className="self-start" disabled>
            {t('subscribe.pay', { amount: money(chosen.priceCents) })}
          </Button>
          <p className="text-sm text-soft">{t('subscribe.notYet')}</p>
        </>
      )}
    </Card>
  );
}
