import { planInputSchema, type Plan } from '@calisthenics/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { errorMessage } from '../../features/auth/errorMessage';
import { useSettings } from '../../features/settings/SettingsContext';
import { centsToPriceInput, formatMoney, parsePriceToCents } from '../../lib/format';

// The coach types a price like "50" or "49.50"; the API stores whole cents.
const formSchema = z.object({
  name: planInputSchema.shape.name,
  price: z.string().refine((v) => !Number.isNaN(parsePriceToCents(v)), 'validation.price'),
  durationMonths: planInputSchema.shape.durationMonths,
  description: z.string(),
  isActive: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

export function PlansPage() {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const { data, error, reload } = useApi<{ plans: Plan[] }>('/plans');
  // null: nothing open; 'new': the add form; otherwise the id of the plan being edited.
  const [editing, setEditing] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const saved = () => {
    setEditing(null);
    reload();
  };

  const remove = async (plan: Plan) => {
    if (!window.confirm(t('plans.confirmDelete', { name: plan.name }))) return;
    setActionError(null);
    try {
      await apiFetch(`/plans/${plan.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setActionError(errorMessage(err, t));
    }
  };

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">{t('plans.title')}</h1>
          <p className="text-sm text-muted">{t('plans.intro')}</p>
        </div>
        {editing !== 'new' && <Button onClick={() => setEditing('new')}>{t('plans.add')}</Button>}
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      {editing === 'new' && <PlanForm onSaved={saved} onCancel={() => setEditing(null)} />}

      {error ? (
        <p className="text-danger">{errorMessage(error, t)}</p>
      ) : !data ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : data.plans.length === 0 ? (
        editing !== 'new' && (
          <p className="rounded-lg border border-line p-6 text-center text-muted">
            {t('plans.empty')}
          </p>
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {data.plans.map((plan) =>
            editing === plan.id ? (
              <li key={plan.id}>
                <PlanForm plan={plan} onSaved={saved} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li
                key={plan.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 ${plan.isActive ? '' : 'opacity-60'}`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">
                    {plan.name}
                    {!plan.isActive && (
                      <span className="ms-2 text-xs font-normal text-muted">
                        ({t('plans.retired')})
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-soft">
                    {formatMoney(plan.priceCents, currency, i18n.language)} ·{' '}
                    {t('plans.months', { count: plan.durationMonths })}
                  </span>
                  {plan.description && (
                    <span className="text-sm text-muted">{plan.description}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditing(plan.id)}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    className="!border-line !text-soft hover:!border-danger hover:!text-danger"
                    onClick={() => void remove(plan)}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function PlanForm({
  plan,
  onSaved,
  onCancel,
}: {
  plan?: Plan;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { currency } = useSettings();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: plan?.name ?? '',
      price: plan ? centsToPriceInput(plan.priceCents) : '',
      durationMonths: plan?.durationMonths ?? 1,
      description: plan?.description ?? '',
      isActive: plan?.isActive ?? true,
    },
  });

  const fieldError = (name: keyof FormValues) => {
    const message = errors[name]?.message;
    return message && t(message);
  };

  const onSubmit = handleSubmit(async ({ price, ...values }) => {
    setFormError(null);
    try {
      await apiFetch(plan ? `/plans/${plan.id}` : '/plans', {
        method: plan ? 'PUT' : 'POST',
        body: { ...values, priceCents: parsePriceToCents(price) },
      });
      onSaved();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-lg border border-lime-dim bg-surface p-4"
    >
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <TextField label={t('plans.name')} error={fieldError('name')} {...register('name')} />
        <TextField
          label={t('plans.price', { currency })}
          inputMode="decimal"
          dir="ltr"
          error={fieldError('price')}
          {...register('price')}
        />
        <TextField
          label={t('plans.duration')}
          type="number"
          min={1}
          max={24}
          error={fieldError('durationMonths')}
          {...register('durationMonths', { valueAsNumber: true })}
        />
      </div>
      <TextField
        label={t('plans.description')}
        error={fieldError('description')}
        {...register('description')}
      />
      {plan && (
        <label className="flex items-center gap-2 text-sm text-soft">
          <input type="checkbox" className="size-4 accent-lime" {...register('isActive')} />
          {t('plans.offered')}
        </label>
      )}
      {plan && <p className="text-xs text-muted">{t('plans.editNote')}</p>}
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {t('common.save')}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
