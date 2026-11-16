import type { CheckoutOptions, CheckoutStarted } from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { SelectField } from '../../components/ui/SelectField';
import { formatMoney } from '../../lib/format';
import { errorMessage } from '../auth/errorMessage';
import { useSettings } from '../settings/SettingsContext';

/**
 * "Pay online with Whish" for the next month. Hidden unless the gym has an
 * online provider set up. The client enters nothing about payment here: the
 * provider's own page takes care of that.
 */
export function PayOnline() {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const { data } = useApi<CheckoutOptions>('/portal/checkout/options');
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data?.enabled) return null;
  const plan =
    data.plans.find((p) => p.id === planId) ??
    data.plans.find((p) => p.id === data.suggestedPlanId) ??
    data.plans[0]!;

  const go = async () => {
    setError(null);
    setBusy(true);
    try {
      const started = await apiFetch<CheckoutStarted>('/portal/checkout', {
        method: 'POST',
        body: { planId: plan.id },
      });
      // Leave the app for the provider's payment page; it sends the client back.
      window.location.assign(started.redirectUrl);
    } catch (err) {
      setError(errorMessage(err, t));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button className="self-start" onClick={() => setOpen(true)}>
        {t('checkout.payOnline')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-lime-dim bg-surface-2 p-4">
      {data.provider === 'fake' && (
        <p className="rounded bg-warn-wash px-2.5 py-1.5 text-xs text-warn">
          {t('checkout.simulated')}
        </p>
      )}
      {data.plans.length > 1 && (
        <SelectField
          label={t('subscriptions.plan')}
          value={plan.id}
          onChange={(e) => setPlanId(e.target.value)}
        >
          {data.plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatMoney(p.priceCents, currency, i18n.language)}
            </option>
          ))}
        </SelectField>
      )}
      <p className="text-sm text-soft">
        {t('checkout.summary', {
          plan: plan.name,
          amount: formatMoney(plan.priceCents, currency, i18n.language),
        })}
      </p>
      <p className="text-xs text-muted">{t('checkout.howItWorks')}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => void go()}>
          {t('checkout.continue')}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
