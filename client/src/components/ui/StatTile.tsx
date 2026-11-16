import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface Props {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** Color of the value; defaults to the main text color. */
  tone?: 'fg' | 'lime' | 'warn' | 'danger';
  /** Makes the whole tile a link. */
  to?: string;
}

const tones = { fg: '', lime: 'text-lime', warn: 'text-warn', danger: 'text-danger' };

/** Label, big number, one line of context. */
export function StatTile({ label, value, note, tone = 'fg', to }: Props) {
  const body = (
    <>
      <span className="text-xs text-muted">{label}</span>
      <span className={`font-display text-[34px] font-bold leading-tight ${tones[tone]}`}>
        {value}
      </span>
      {note && <span className="text-xs text-soft">{note}</span>}
    </>
  );
  const box = 'flex flex-col gap-1 rounded-lg border border-line bg-surface p-4';
  return to ? (
    <Link to={to} className={`${box} transition-colors hover:border-lime`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
