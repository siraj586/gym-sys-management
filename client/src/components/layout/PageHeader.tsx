import type { ReactNode } from 'react';

/** Big condensed title, a quiet line beside it, the page's main action at the end. */
export function PageHeader({
  title,
  meta,
  action,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="font-display text-4xl font-bold uppercase leading-none">{title}</h1>
      {meta && <span className="text-muted">{meta}</span>}
      {action && <div className="ms-auto flex flex-wrap gap-3">{action}</div>}
    </div>
  );
}
