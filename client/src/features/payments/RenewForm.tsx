import {
  PAYMENT_METHODS,
  renewalInputSchema,
  subscriptionEndDate,
  type MemberDetail,
  type MemberSummary,
  type PaymentMethod,
  type Plan,
} from '@calisthenics/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/FilterChips';
import { SelectField } from '../../components/ui/SelectField';
import { TextField } from '../../components/ui/TextField';
import { centsToPriceInput, formatDate, formatMoney, parsePriceToCents } from '../../lib/format';
import { errorMessage } from '../auth/errorMessage';
import { MemberPicker } from '../members/MemberPicker';
import { useSettings } from '../settings/SettingsContext';

/** The same rule as the server: renewing early keeps the days left. */
function renewalStart(currentEnd: string | null, paidAt: string): string {
  return currentEnd && currentEnd >= paidAt ? currentEnd : paidAt;
}

/**
 * "Record payment" on the payments page: pick a member and a plan, take the
 * money, and the next month is created with it.
 */
export function RenewForm({
  initialMemberId,
  onSaved,
}: {
  /** From ?member=<id>, when a "Renew and record payment" link was followed. */
  initialMemberId: string | null;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { today, currency } = useSettings();
  const plansApi = useApi<{ plans: Plan[] }>('/plans');
  const plans = plansApi.data?.plans.filter((p) => p.isActive) ?? [];
  // The preselected member arrives as an id; load them to fill the picker.
  const preset = useApi<MemberDetail>(initialMemberId ? `/members/${initialMemberId}` : null);

  const [picked, setPicked] = useState<MemberSummary | null>(null);
  const [touchedMember, setTouchedMember] = useState(false);
  const member = touchedMember ? picked : (picked ?? preset.data ?? null);

  const [planId, setPlanId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Default plan: the member's current one if still on sale, else the first plan.
  const usualPlan = plans.find((p) => p.name === member?.current?.planName);
  const plan = plans.find((p) => p.id === planId) ?? usualPlan ?? plans[0];
  const amountText = amount || (plan ? centsToPriceInput(plan.priceCents) : '');
  const start = member ? renewalStart(member.paidThrough, paidAt) : null;
  const end = start && plan ? subscriptionEndDate(start, plan.durationMonths) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSaved(null);
    const next: Record<string, string> = {};
    if (!member) next.member = t('attendance.pickMember');
    const parsed = renewalInputSchema.safeParse({
      planId: plan?.id ?? '',
      amountCents: parsePriceToCents(amountText),
      method,
      paidAt,
      reference,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= t(issue.message);
    } else if (plan && parsed.data.amountCents > plan.priceCents) {
      next.amountCents = t('payments.tooMuch', {
        balance: formatMoney(plan.priceCents, currency, i18n.language),
      });
    }
    if (paidAt > today) next.paidAt = t('errors.PAYMENT_IN_FUTURE');
    setErrors(next);
    if (!parsed.success || !member || Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await apiFetch(`/members/${member.id}/renewals`, { method: 'POST', body: parsed.data });
      setSaved(t('payments.renewed', { name: member.firstName }));
      setPicked(null);
      setTouchedMember(true);
      setAmount('');
      setReference('');
      onSaved();
    } catch (err) {
      setFormError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  if (plansApi.data && plans.length === 0) {
    return (
      <p className="text-sm text-soft">
        {t('subscriptions.noPlans')}{' '}
        <Link to="/admin/plans" className="text-lime underline">
          {t('subscriptions.createPlan')}
        </Link>
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-2.5">
      <h2 className="mb-1 text-lg font-semibold">{t('payments.recordTitle')}</h2>
      <MemberPicker
        label={t('payments.member')}
        selected={member}
        onSelect={(m) => {
          setPicked(m);
          setTouchedMember(true);
          setPlanId('');
          setAmount('');
          setSaved(null);
        }}
        error={errors.member}
      />
      <SelectField
        label={t('subscriptions.plan')}
        value={plan?.id ?? ''}
        onChange={(e) => {
          setPlanId(e.target.value);
          setAmount('');
        }}
        error={errors.planId}
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {formatMoney(p.priceCents, currency, i18n.language)}
          </option>
        ))}
      </SelectField>
      <TextField
        label={t('payments.amount', { currency })}
        inputMode="decimal"
        dir="ltr"
        value={amountText}
        onChange={(e) => setAmount(e.target.value)}
        error={errors.amountCents}
      />
      <span className="text-xs text-soft">{t('payments.method')}</span>
      <Segmented
        label={t('payments.method')}
        value={method}
        onChange={setMethod}
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`paymentMethod.${m}`) }))}
      />
      <TextField
        label={t('payments.date')}
        type="date"
        max={today}
        value={paidAt}
        onChange={(e) => setPaidAt(e.target.value)}
        error={errors.paidAt}
      />
      {start && end && (
        <p className="rounded-md bg-lime-wash p-3 text-[13px] text-lime">
          {t('payments.newMonth', {
            start: formatDate(start, i18n.language),
            end: formatDate(end, i18n.language),
          })}
        </p>
      )}
      <p className="text-xs text-muted">{t('payments.renewRule')}</p>
      <TextField
        label={t(method === 'WHISH_MONEY' ? 'payments.whishReference' : 'payments.reference')}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        error={errors.reference}
      />
      {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
      {saved && (
        <p role="status" className="text-sm text-lime">
          {saved}
        </p>
      )}
      <Button type="submit" disabled={saving} className="min-h-12">
        {t('payments.saveAndRenew')}
      </Button>
    </form>
  );
}
