import {
  PAYMENT_METHODS,
  paymentInputSchema,
  type Payment,
  type PaymentStatus,
  type Subscription,
} from '@calisthenics/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, apiFetch } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { SelectField } from '../../components/ui/SelectField';
import { TextField } from '../../components/ui/TextField';
import { centsToPriceInput, formatDate, formatMoney, parsePriceToCents } from '../../lib/format';
import { errorMessage } from '../auth/errorMessage';
import { useSettings } from '../settings/SettingsContext';

const badgeStyles: Record<PaymentStatus, string> = {
  PAID: 'border-lime text-lime',
  PARTIAL: 'border-warn text-warn',
  UNPAID: 'border-danger text-danger',
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeStyles[status]}`}
    >
      {t(`paymentStatus.${status}`)}
    </span>
  );
}

/** "Owes $25" in red, for a member's outstanding balance. */
export function Owes({ cents }: { cents: number }) {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  return (
    <span className="text-sm font-semibold text-danger">
      {t('payments.owes', { amount: formatMoney(cents, currency, i18n.language) })}
    </span>
  );
}

/**
 * Payment status, history and the "record payment" form of one subscription.
 * `onChange` reloads the member after anything is recorded or voided.
 */
export function SubscriptionPayments({
  sub,
  onChange,
}: {
  sub: Subscription;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const [open, setOpen] = useState(false);
  const money = (cents: number) => formatMoney(cents, currency, i18n.language);
  const balance = sub.priceCents - sub.paidCents;
  const canPay = balance > 0 && sub.status !== 'CANCELLED';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <PaymentBadge status={sub.paymentStatus} />
        <span className="text-soft">
          {t('payments.paidOf', { paid: money(sub.paidCents), price: money(sub.priceCents) })}
        </span>
        {canPay && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-11 px-2 font-semibold text-lime hover:underline"
          >
            {t('payments.record')}
          </button>
        )}
      </div>
      {open && (
        <PaymentForm
          sub={sub}
          balance={balance}
          onDone={() => {
            setOpen(false);
            onChange();
          }}
          onCancel={() => setOpen(false)}
        />
      )}
      {sub.payments.length > 0 && <PaymentHistory sub={sub} onChange={onChange} />}
    </div>
  );
}

/** Records a new payment, or corrects the one given as editing. */
function PaymentForm({
  sub,
  balance,
  editing,
  onDone,
  onCancel,
}: {
  sub: Subscription;
  /** What may still be paid on this month (for an edit: including this payment). */
  balance: number;
  editing?: Payment;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { today, currency } = useSettings();
  // A new payment starts at what is left, the usual case.
  const [amount, setAmount] = useState(centsToPriceInput(editing?.amountCents ?? balance));
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>(editing?.method ?? 'CASH');
  const [paidAt, setPaidAt] = useState(editing?.paidAt ?? today);
  const [reference, setReference] = useState(editing?.reference ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    // The shared schema checks the same rules as the server; the date and the
    // balance are checked here too so the coach does not wait for a refusal.
    const parsed = paymentInputSchema.safeParse({
      amountCents: parsePriceToCents(amount),
      method,
      paidAt,
      reference,
      note,
    });
    const nextErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        nextErrors[String(issue.path[0])] ??= t(issue.message);
      }
    } else {
      if (parsed.data.amountCents > balance) {
        nextErrors.amountCents = t('payments.tooMuch', {
          balance: formatMoney(balance, currency, i18n.language),
        });
      }
      if (parsed.data.paidAt > today) nextErrors.paidAt = t('errors.PAYMENT_IN_FUTURE');
    }
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await apiFetch(editing ? `/payments/${editing.id}` : `/subscriptions/${sub.id}/payments`, {
        method: editing ? 'PUT' : 'POST',
        body: parsed.data,
      });
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PAYMENT_EXCEEDS_BALANCE') {
        const { balanceCents } = error.details as { balanceCents: number };
        setFormError(
          t('payments.tooMuch', { balance: formatMoney(balanceCents, currency, i18n.language) }),
        );
      } else {
        setFormError(errorMessage(error, t));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="flex flex-col gap-3 rounded-md border border-lime-dim bg-surface-2 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          label={t('payments.amount', { currency })}
          inputMode="decimal"
          dir="ltr"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amountCents}
        />
        <SelectField
          label={t('payments.method')}
          value={method}
          onChange={(e) => setMethod(e.target.value as typeof method)}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`paymentMethod.${m}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('payments.date')}
          type="date"
          max={today}
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          error={errors.paidAt}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t('payments.reference')}
          hint={t('payments.referenceHint')}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          error={errors.reference}
        />
        <TextField
          label={t('payments.note')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={errors.note}
        />
      </div>
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {t(editing ? 'common.save' : 'payments.save')}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function PaymentHistory({ sub, onChange }: { sub: Subscription; onChange: () => void }) {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const payments = sub.payments;

  const remove = async (p: Payment) => {
    const amount = formatMoney(p.amountCents, currency, i18n.language);
    if (
      !window.confirm(
        t('payments.confirmDelete', { amount, date: formatDate(p.paidAt, i18n.language) }),
      )
    ) {
      return;
    }
    // The month's only payment (e.g. a renewal saved twice): offer to remove the month too.
    const withMonth =
      payments.length === 1 &&
      window.confirm(
        t('payments.alsoDeleteMonth', {
          start: formatDate(sub.startDate, i18n.language),
          end: formatDate(sub.endDate, i18n.language),
        }),
      );
    setError(null);
    try {
      await apiFetch(`/payments/${p.id}${withMonth ? '?withMonth=true' : ''}`, {
        method: 'DELETE',
      });
      onChange();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  };

  return (
    <ul className="flex flex-col gap-2 border-s-2 border-line ps-3 text-sm">
      {payments.map((p) => (
        <li key={p.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={p.voidedAt ? 'text-muted line-through' : 'font-semibold'}>
              {formatMoney(p.amountCents, currency, i18n.language)}
            </span>
            <span className="text-soft">
              {formatDate(p.paidAt, i18n.language)} · {t(`paymentMethod.${p.method}`)}
              {p.reference && <span dir="ltr"> · {p.reference}</span>}
            </span>
            {p.voidedAt ? (
              <span className="text-muted">
                {t('payments.voided', { reason: p.voidReason ?? '' })}
              </span>
            ) : (
              voidingId !== p.id &&
              editingId !== p.id && (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingId(p.id)}
                    className="min-h-11 px-1 text-muted hover:text-fg"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoidingId(p.id)}
                    className="min-h-11 px-1 text-muted hover:text-warn"
                  >
                    {t('payments.void')}
                  </button>
                </>
              )
            )}
            <button
              type="button"
              onClick={() => void remove(p)}
              className="min-h-11 px-1 text-muted hover:text-danger"
            >
              {t('common.delete')}
            </button>
          </div>
          {editingId === p.id && (
            <PaymentForm
              sub={sub}
              editing={p}
              balance={sub.priceCents - sub.paidCents + p.amountCents}
              onDone={() => {
                setEditingId(null);
                onChange();
              }}
              onCancel={() => setEditingId(null)}
            />
          )}
          {p.note && <p className="text-muted">{p.note}</p>}
          {voidingId === p.id && (
            <VoidForm
              payment={p}
              onDone={() => {
                setVoidingId(null);
                onChange();
              }}
              onCancel={() => setVoidingId(null)}
            />
          )}
        </li>
      ))}
      {error && (
        <li role="alert" className="text-sm text-danger">
          {error}
        </li>
      )}
    </ul>
  );
}

function VoidForm({
  payment,
  onDone,
  onCancel,
}: {
  payment: Payment;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError(t('validation.required'));
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/payments/${payment.id}/void`, { method: 'POST', body: { reason } });
      onDone();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="flex flex-col gap-3 rounded-md border border-danger/50 p-3"
    >
      <p className="text-soft">{t('payments.voidExplain')}</p>
      <TextField
        label={t('payments.voidReason')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error ?? undefined}
        maxLength={200}
        autoFocus
      />
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {t('payments.confirmVoid')}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
