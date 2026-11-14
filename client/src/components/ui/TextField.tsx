import { useId, type ComponentProps } from 'react';

type Props = ComponentProps<'input'> & { label: string; error?: string; hint?: string };

/** Label + input + error message, wired together for screen readers. */
export function TextField({ label, error, hint, id, className = '', ...props }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm text-soft">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`min-h-11 rounded-md border bg-surface px-3 text-fg outline-none transition-colors focus:border-lime ${error ? 'border-danger' : 'border-line'} ${className}`}
        {...props}
      />
      {message && (
        <p id={messageId} className={`text-sm ${error ? 'text-danger' : 'text-muted'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
