export interface Bar {
  key: string;
  label: string;
  value: number;
  /** The one bar the story is about (the current month): drawn in the accent. */
  highlight?: boolean;
}

/**
 * A few columns from one baseline, each value printed on its cap, so nothing
 * hides behind hover. 4px rounded tops, square at the baseline; the others
 * recede in the dim accent.
 */
export function BarChart({
  bars,
  formatValue,
  label,
  height = 180,
}: {
  bars: Bar[];
  formatValue: (value: number) => string;
  /** Accessible summary of the whole chart. */
  label: string;
  height?: number;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  // Leave room above the tallest bar for its value.
  const plot = height - 24;

  return (
    // Time runs left to right in both languages.
    <figure dir="ltr" className="m-0 flex flex-col gap-2" aria-label={label}>
      <ul
        className="flex items-end gap-3 border-b border-line px-2 sm:gap-[18px]"
        style={{ height }}
      >
        {bars.map((b) => (
          <li
            key={b.key}
            className="flex flex-1 flex-col items-center justify-end gap-1.5"
            aria-label={`${b.label}: ${formatValue(b.value)}`}
          >
            <span
              className={`whitespace-nowrap text-xs ${b.highlight ? 'font-semibold text-lime' : 'text-soft'}`}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatValue(b.value)}
            </span>
            <span
              className={`block w-full max-w-10 rounded-t ${b.highlight ? 'bg-lime' : 'bg-lime-dim'}`}
              style={{ height: Math.max(2, (b.value / max) * plot) }}
            />
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="flex gap-3 px-2 text-center text-xs sm:gap-[18px]">
        {bars.map((b) => (
          <span key={b.key} className={`flex-1 ${b.highlight ? 'text-fg' : 'text-muted'}`}>
            {b.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
