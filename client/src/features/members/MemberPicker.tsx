import type { MemberListResponse, MemberSummary } from '@calisthenics/shared';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../api/useApi';
import { StatusBadge } from '../../components/ui/StatusBadge';

interface Props {
  label: string;
  /** Visually hide the label (the placeholder says the same). */
  hideLabel?: boolean;
  placeholder?: string;
  selected: MemberSummary | null;
  onSelect: (member: MemberSummary | null) => void;
  error?: string;
  autoFocus?: boolean;
}

/**
 * Type a name or phone, pick a member from the list (mouse or arrow keys and
 * Enter). Shows each match's status so a blocked member is visible before acting.
 */
export function MemberPicker({
  label,
  hideLabel,
  placeholder,
  selected,
  onSelect,
  error,
  autoFocus,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState(selected ? `${selected.firstName} ${selected.lastName}` : '');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // A member chosen from outside (e.g. a "Renew" link) shows its name in the box.
  const [shownId, setShownId] = useState(selected?.id ?? null);
  if ((selected?.id ?? null) !== shownId) {
    setShownId(selected?.id ?? null);
    setText(selected ? `${selected.firstName} ${selected.lastName}` : '');
  }

  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);

  const results = useApi<MemberListResponse>(
    open && search ? `/members?search=${encodeURIComponent(search)}` : null,
  );
  const matches = results.data?.members.slice(0, 8) ?? [];

  const choose = (member: MemberSummary) => {
    onSelect(member);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(matches[Math.min(active, matches.length - 1)]!);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const listId = `${id}-list`;
  return (
    <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-xs text-soft'}>
        {label}
      </label>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          if (selected) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
        // Let a click on a result land before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className={`min-h-11 w-full rounded-md border bg-ink px-3 text-fg outline-none focus:border-lime ${error ? 'border-danger' : 'border-line'}`}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {open && search && results.data && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-line bg-surface-2 py-1 shadow-xl"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{t('members.noMatches')}</li>
          ) : (
            matches.map((m, i) => (
              <li
                key={m.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(m)}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 ${i === active ? 'bg-chip' : ''}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">
                    {m.firstName} {m.lastName}
                  </span>
                  <span className="text-xs text-muted" dir="ltr">
                    {m.phone}
                  </span>
                </span>
                <StatusBadge status={m.status} />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
