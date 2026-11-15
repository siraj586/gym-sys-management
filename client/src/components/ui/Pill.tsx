import type { ReactNode } from 'react';

export type Tone = 'lime' | 'warn' | 'danger' | 'neutral';

const tones: Record<Tone, string> = {
  lime: 'bg-lime-wash text-lime',
  warn: 'bg-warn-wash text-warn',
  danger: 'bg-danger-wash text-danger',
  neutral: 'border border-line text-muted',
};

/** A small filled label for a state. The words carry the meaning, the color only repeats it. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
