import type { ComponentProps, ReactNode } from 'react';

type Props = ComponentProps<'section'> & {
  title?: ReactNode;
  /** Small text after the title, e.g. what the list is sorted by. */
  subtitle?: ReactNode;
  /** Shown at the end of the title row: a button or a pill. */
  action?: ReactNode;
  /** Highlight the card with the accent border, as the design does for the current month. */
  accent?: boolean;
};

/** The surface every dashboard block sits on. */
export function Card({ title, subtitle, action, accent, className = '', children, ...props }: Props) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-3 rounded-lg border bg-surface p-5 ${accent ? 'border-lime' : 'border-line'} ${className}`}
      {...props}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
          {action && <div className="ms-auto">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A divided row inside a Card list. */
export function CardRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 border-t border-line pt-2.5 ${className}`}>
      {children}
    </div>
  );
}
