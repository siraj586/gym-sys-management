import { useId, type ComponentProps } from 'react';

type Props = ComponentProps<'select'> & { label: string; error?: string; hint?: string };

/** Label + select + message, styled and wired like TextField. */
export function SelectField({ label, error, hint, id, className = '', children, ...props }: Props) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const messageId = `${selectId}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm text-soft">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`min-h-11 rounded-md border bg-surface px-3 text-fg outline-none transition-colors focus:border-lime ${error ? 'border-danger' : 'border-line'} ${className}`}
        {...props}
      >
        {children}
      </select>
      {message && (
        <p id={messageId} className={`text-sm ${error ? 'text-danger' : 'text-muted'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
