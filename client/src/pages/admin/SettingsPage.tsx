import {
  galleryInputSchema,
  settingsInputSchema,
  type ContactMessage,
  type GalleryImage,
  type SettingsFormInput,
} from '@calisthenics/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { TextAreaField } from '../../components/ui/TextAreaField';
import { TextField } from '../../components/ui/TextField';
import { errorMessage } from '../../features/auth/errorMessage';
import { useReloadSettings, useSettings } from '../../features/settings/SettingsContext';
import { formatDate } from '../../lib/format';

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.nav.settings')} />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_460px] flex-col gap-5">
          <GymDetails />
          <Gallery />
        </div>
        <div className="min-w-0 flex-[2_1_320px]">
          <Messages />
        </div>
      </div>
    </div>
  );
}

function GymDetails() {
  const { t } = useTranslation();
  const settings = useSettings();
  const reloadSettings = useReloadSettings();
  const [values, setValues] = useState<Record<keyof SettingsFormInput, string>>({
    businessName: settings.businessName,
    coachName: settings.coachName ?? '',
    coachBio: settings.coachBio ?? '',
    address: settings.address ?? '',
    phone: settings.phone ?? '',
    instagram: settings.instagram ?? '',
    openingHours: settings.openingHours ?? '',
    currency: settings.currency,
    timezone: settings.timezone,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const field = (name: keyof typeof values) => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) =>
      setValues({ ...values, [name]: e.target.value }),
    error: errors[name],
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus(null);
    const parsed = settingsInputSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= t(issue.message);
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await apiFetch('/settings', { method: 'PUT', body: parsed.data });
      reloadSettings();
      setStatus({ ok: true, text: t('settings.saved') });
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err, t) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('settings.details')} subtitle={t('settings.detailsNote')}>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('settings.businessName')} {...field('businessName')} />
          <TextField
            label={t('settings.coachName')}
            hint={t('settings.coachNameHint')}
            {...field('coachName')}
          />
        </div>
        <TextAreaField label={t('settings.coachBio')} rows={4} {...field('coachBio')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('settings.address')} {...field('address')} />
          <TextField label={t('settings.phone')} type="tel" dir="ltr" {...field('phone')} />
          <TextField
            label={t('settings.instagram')}
            dir="ltr"
            placeholder="@"
            {...field('instagram')}
          />
          <TextField label={t('settings.openingHours')} {...field('openingHours')} />
          <TextField
            label={t('settings.currency')}
            hint={t('settings.currencyHint')}
            dir="ltr"
            maxLength={3}
            {...field('currency')}
          />
          <TextField
            label={t('settings.timezone')}
            hint={t('settings.timezoneHint')}
            dir="ltr"
            {...field('timezone')}
          />
        </div>
        {status && (
          <p role="status" className={`text-sm ${status.ok ? 'text-lime' : 'text-danger'}`}>
            {status.text}
          </p>
        )}
        <Button type="submit" disabled={saving} className="self-start">
          {t('common.save')}
        </Button>
      </form>
    </Card>
  );
}

function Gallery() {
  const { t } = useTranslation();
  const { data, error, reload } = useApi<{ images: GalleryImage[] }>('/gallery');
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err, t));
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const parsed = galleryInputSchema.safeParse({ url, caption });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= t(issue.message);
      setErrors(next);
      return;
    }
    setErrors({});
    void run(async () => {
      await apiFetch('/gallery', { method: 'POST', body: parsed.data });
      setUrl('');
      setCaption('');
    });
  };

  const images = data?.images ?? [];
  return (
    <Card title={t('settings.gallery')} subtitle={t('settings.galleryNote')}>
      <form
        onSubmit={add}
        noValidate
        className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
      >
        <TextField
          label={t('settings.imageUrl')}
          dir="ltr"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={errors.url}
        />
        <TextField
          label={t('settings.caption')}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          error={errors.caption}
        />
        <Button type="submit">{t('settings.addImage')}</Button>
      </form>
      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}
      {error ? (
        <p className="text-danger">{errorMessage(error, t)}</p>
      ) : images.length === 0 ? (
        data && <p className="text-sm text-muted">{t('settings.noImages')}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {images.map((img, i) => (
            <li
              key={img.id}
              className="flex flex-col gap-2 rounded-md border border-line bg-ink p-2"
            >
              <img
                src={img.url}
                alt={img.caption ?? ''}
                loading="lazy"
                className="aspect-[4/3] w-full rounded object-cover"
              />
              <span className="min-h-5 truncate text-xs text-soft">{img.caption}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() =>
                    void run(() =>
                      apiFetch(`/gallery/${img.id}/move`, {
                        method: 'POST',
                        body: { direction: -1 },
                      }),
                    )
                  }
                  aria-label={t('programs.moveUp')}
                  className="min-h-11 min-w-11 rounded border border-line text-soft disabled:opacity-30"
                >
                  <span className="inline-block rtl:rotate-180">←</span>
                </button>
                <button
                  type="button"
                  disabled={i === images.length - 1}
                  onClick={() =>
                    void run(() =>
                      apiFetch(`/gallery/${img.id}/move`, {
                        method: 'POST',
                        body: { direction: 1 },
                      }),
                    )
                  }
                  aria-label={t('programs.moveDown')}
                  className="min-h-11 min-w-11 rounded border border-line text-soft disabled:opacity-30"
                >
                  <span className="inline-block rtl:rotate-180">→</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.confirm(t('settings.confirmRemoveImage')) &&
                    void run(() => apiFetch(`/gallery/${img.id}`, { method: 'DELETE' }))
                  }
                  className="ms-auto min-h-11 px-2 text-xs text-muted hover:text-danger"
                >
                  {t('progress.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Messages() {
  const { t, i18n } = useTranslation();
  const { data, error, reload } = useApi<{ messages: ContactMessage[] }>('/messages');
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err, t));
    }
  };

  const unread = data?.messages.filter((m) => !m.isRead).length ?? 0;
  return (
    <Card
      title={t('settings.messages')}
      action={
        unread > 0 ? <Pill tone="warn">{t('settings.unread', { count: unread })}</Pill> : undefined
      }
    >
      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}
      {error ? (
        <p className="text-danger">{errorMessage(error, t)}</p>
      ) : !data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : data.messages.length === 0 ? (
        <p className="text-sm text-muted">{t('settings.noMessages')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.messages.map((m) => (
            <li
              key={m.id}
              className={`flex flex-col gap-1.5 rounded-md border p-3 ${m.isRead ? 'border-line' : 'border-lime-dim bg-ink'}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{m.name}</span>
                <span className="text-sm text-soft" dir="ltr">
                  {m.contact}
                </span>
                <span className="ms-auto text-xs text-muted">
                  {formatDate(m.createdAt.slice(0, 10), i18n.language)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{m.message}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void run(() =>
                      apiFetch(`/messages/${m.id}/read`, {
                        method: 'POST',
                        body: { isRead: !m.isRead },
                      }),
                    )
                  }
                  className="min-h-11 px-1 text-xs text-lime"
                >
                  {t(m.isRead ? 'settings.markUnread' : 'settings.markRead')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.confirm(t('settings.confirmRemoveMessage')) &&
                    void run(() => apiFetch(`/messages/${m.id}`, { method: 'DELETE' }))
                  }
                  className="min-h-11 px-1 text-xs text-muted hover:text-danger"
                >
                  {t('progress.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
