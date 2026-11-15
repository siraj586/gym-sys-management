import {
  type MemberListResponse,
  type MemberStatus,
  type MemberStatusCounts,
  type MemberSummary,
} from '@calisthenics/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../../api/useApi';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { FilterChips } from '../../components/ui/FilterChips';
import { Pill } from '../../components/ui/Pill';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { errorMessage } from '../../features/auth/errorMessage';
import { MemberPanel } from '../../features/members/MemberPanel';
import { useSettings } from '../../features/settings/SettingsContext';
import { endsText, formatMoney } from '../../lib/format';

type Filter = 'ALL' | MemberStatus;
const FILTERS: Filter[] = ['ALL', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'NONE'];

/**
 * The members list with the selected member beside it (?m=<id>). On a phone
 * the panel drops below the list.
 */
export function MembersPage() {
  const { t, i18n } = useTranslation();
  const { today, currency } = useSettings();
  const [params, setParams] = useSearchParams();

  // Filters and the selection live in the URL, so Back and bookmarks work.
  const search = params.get('search') ?? '';
  const status = (FILTERS as string[]).includes(params.get('status') ?? '')
    ? (params.get('status') as Filter)
    : 'ALL';
  const archived = params.get('archived') === 'true';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const selectedId = params.get('m');

  const update = (changes: Record<string, string | null>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        // A new filter starts again from the first page.
        if (!('page' in changes) && !('m' in changes)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  // Typing updates the URL after a short pause; the box follows outside changes.
  const [searchInput, setSearchInput] = useState(search);
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
  if (status !== 'ALL') query.set('status', status);
  if (archived) query.set('archived', 'true');
  query.set('page', String(page));
  const list = useApi<MemberListResponse>(`/members?${query}`);
  const counts = useApi<MemberStatusCounts>('/members/counts');

  const total = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : null;
  const countOf = (f: Filter) =>
    !counts.data ? '' : f === 'ALL' ? ` ${total}` : ` ${counts.data[f]}`;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  const statusCell = (m: MemberSummary) =>
    m.status === 'EXPIRING' && m.current ? (
      <Pill tone="warn">{endsText(t, today, m.current.endDate, i18n.language)}</Pill>
    ) : m.status === 'NONE' ? (
      <Pill tone="danger">{t('members.noPaymentYet')}</Pill>
    ) : (
      <StatusBadge status={m.status} />
    );

  const short = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        title={t('members.title')}
        meta={total !== null && t('members.count', { count: total })}
        action={<ButtonLink to="/admin/members/new">{t('members.add')}</ButtonLink>}
      />

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[3_1_440px] flex-col gap-3">
          <label htmlFor="member-search" className="text-xs text-soft">
            {t('members.searchLabel')}
          </label>
          <input
            id="member-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="min-h-11 rounded-md border border-line bg-surface px-3 text-fg outline-none focus:border-lime"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FilterChips
              label={t('members.filterStatus')}
              value={status}
              onChange={(f) => update({ status: f === 'ALL' ? null : f })}
              options={FILTERS.map((f) => ({
                value: f,
                label: `${t(`members.filter.${f}`)}${countOf(f)}`,
              }))}
            />
            <label className="ms-auto flex min-h-11 items-center gap-2 text-[13px] text-soft">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => update({ archived: e.target.checked ? 'true' : null })}
                className="size-4 accent-lime"
              />
              {t('members.showArchived')}
            </label>
          </div>

          {list.error ? (
            <p role="alert" className="text-danger">
              {errorMessage(list.error, t)}
            </p>
          ) : !list.data ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : list.data.members.length === 0 ? (
            <p className="rounded-lg border border-line p-6 text-center text-muted">
              {search || status !== 'ALL' ? t('members.noMatches') : t('members.empty')}
            </p>
          ) : (
            <div
              className={`overflow-x-auto rounded-lg border border-line bg-surface px-4 pb-2 pt-1 transition-opacity ${list.loading ? 'opacity-60' : ''}`}
            >
              <table className="w-full min-w-[500px] border-collapse text-start" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="py-3 pe-2 text-start font-medium">{t('members.col.member')}</th>
                    <th className="px-2 py-3 text-start font-medium">{t('members.col.plan')}</th>
                    <th className="px-2 py-3 text-start font-medium">{t('members.col.started')}</th>
                    <th className="px-2 py-3 text-start font-medium">{t('members.col.ends')}</th>
                    <th className="py-3 ps-2 text-start font-medium">{t('members.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.members.map((m) => (
                    <tr
                      key={m.id}
                      className={`border-t border-line ${m.id === selectedId ? 'bg-surface-2' : ''}`}
                    >
                      <td className="py-3 pe-2">
                        <Link
                          to={`?${new URLSearchParams({ ...Object.fromEntries(params), m: m.id })}`}
                          replace
                          aria-current={m.id === selectedId ? 'true' : undefined}
                          className="font-semibold text-fg hover:text-lime"
                        >
                          {m.firstName} {m.lastName}
                        </Link>
                        {m.archivedAt && (
                          <span className="ms-2 text-xs text-muted">({t('members.archived')})</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-soft">
                        {m.current
                          ? `${m.current.planName} · ${formatMoney(m.current.priceCents, currency, i18n.language)}`
                          : '—'}
                      </td>
                      <td className="px-2 py-3 text-soft">
                        {m.current ? short(m.current.startDate) : t('members.notStarted')}
                      </td>
                      <td className="px-2 py-3">
                        {m.current ? short(m.current.endDate) : t('members.notStarted')}
                      </td>
                      <td className="py-3 ps-2">{statusCell(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
          <p className="text-xs text-muted">{t('members.monthRule')}</p>
        </section>

        <section className="flex min-w-0 flex-[2_1_320px] flex-col gap-3.5" aria-live="polite">
          {selectedId ? (
            <MemberPanel
              key={selectedId}
              memberId={selectedId}
              onChanged={() => {
                list.reload();
                counts.reload();
              }}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-dash p-6 text-center text-muted">
              {t('members.pickOne')}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
