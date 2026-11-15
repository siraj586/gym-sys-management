import { MEMBER_STATUSES, type MemberListResponse, type MemberStatus } from '@calisthenics/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { errorMessage } from '../../features/auth/errorMessage';
import { Owes } from '../../features/payments/SubscriptionPayments';
import { formatDate } from '../../lib/format';

function isMemberStatus(value: string | null): value is MemberStatus {
  return MEMBER_STATUSES.includes(value as MemberStatus);
}

export function MembersPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();

  // Filters live in the URL, so a filtered list can be bookmarked and Back works.
  const search = params.get('search') ?? '';
  const statusParam = params.get('status');
  const status = isMemberStatus(statusParam) ? statusParam : null;
  const archived = params.get('archived') === 'true';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const update = (changes: Record<string, string | null>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        // Any new filter starts again from the first page.
        if (!('page' in changes)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  // Typing updates the URL after a short pause instead of on every key.
  const [searchInput, setSearchInput] = useState(search);
  // When the URL changes from elsewhere (a nav link, Back), the box follows it.
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setSearchInput(search);
  }
  useEffect(() => {
    if (searchInput.trim() === search) return;
    const timer = setTimeout(() => update({ search: searchInput.trim() || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update only reads the latest params
  }, [searchInput, search]);

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  if (archived) query.set('archived', 'true');
  query.set('page', String(page));
  const { data, error, loading } = useApi<MemberListResponse>(`/members?${query}`);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const chip = (active: boolean) =>
    `min-h-9 rounded-full border px-3 text-sm ${active ? 'border-lime bg-lime text-ink' : 'border-line text-soft hover:border-soft'}`;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-bold uppercase">{t('members.title')}</h1>
        <ButtonLink to="/admin/members/new">{t('members.add')}</ButtonLink>
      </div>

      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('members.searchPlaceholder')}
          aria-label={t('members.search')}
          className="min-h-11 w-full max-w-md rounded-md border border-line bg-surface px-3 text-fg outline-none focus:border-lime"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('members.filterStatus')}>
          <button
            type="button"
            className={chip(!status)}
            aria-pressed={!status}
            onClick={() => update({ status: null })}
          >
            {t('members.allStatuses')}
          </button>
          {MEMBER_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={chip(status === s)}
              aria-pressed={status === s}
              onClick={() => update({ status: s })}
            >
              {t(`status.${s}`)}
            </button>
          ))}
          <label className="ms-auto flex min-h-9 items-center gap-2 text-sm text-soft">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => update({ archived: e.target.checked ? 'true' : null })}
              className="size-4 accent-lime"
            />
            {t('members.showArchived')}
          </label>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-danger">
          {errorMessage(error, t)}
        </p>
      ) : !data ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : data.members.length === 0 ? (
        <p className="rounded-lg border border-line p-6 text-center text-muted">
          {search || status ? t('members.noMatches') : t('members.empty')}
        </p>
      ) : (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <p className="text-sm text-muted">{t('members.count', { count: data.total })}</p>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {data.members.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/admin/members/${m.id}`}
                  className="grid gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {m.firstName} {m.lastName}
                    </span>
                    <span className="text-sm text-muted" dir="ltr">
                      {m.phone}
                    </span>
                  </span>
                  <span className="flex flex-col text-sm text-soft">
                    <span>
                      {m.paidThrough
                        ? t('members.paidThrough', {
                            date: formatDate(m.paidThrough, i18n.language),
                          })
                        : t('members.neverPaid')}
                    </span>
                    {m.balanceCents > 0 && <Owes cents={m.balanceCents} />}
                  </span>
                  <span className="flex gap-2">
                    {m.archivedAt && (
                      <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
                        {t('members.archived')}
                      </span>
                    )}
                    <StatusBadge status={m.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label={t('members.pages')}>
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                {t('common.previous')}
              </Button>
              <span className="text-sm text-soft">{t('common.pageOf', { page, pages })}</span>
              <Button
                variant="outline"
                disabled={page >= pages}
                onClick={() => update({ page: String(page + 1) })}
              >
                {t('common.next')}
              </Button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
