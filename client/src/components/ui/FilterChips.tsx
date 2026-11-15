interface Option<T extends string> {
  value: T;
  label: string;
}

/** A row of toggle chips where one is selected, as in the members and payments filters. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 rounded-full border px-3.5 text-[13px] ${
            o.value === value
              ? 'border-lime bg-chip text-fg'
              : 'border-line text-soft hover:border-soft'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Two or three buttons sharing one box, one selected: Cash | Bank transfer. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-md border border-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 flex-1 px-3 text-[13px] ${
            o.value === value ? 'bg-lime font-semibold text-ink' : 'text-fg hover:bg-surface-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
