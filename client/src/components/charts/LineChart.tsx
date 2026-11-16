import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface ChartPoint {
  /** "YYYY-MM-DD" */
  date: string;
  value: number;
}

interface Props {
  points: ChartPoint[];
  /** Accessible name, e.g. "Push-up results over time". The title above says it visually. */
  label: string;
  formatValue: (value: number) => string;
  formatDate: (isoDate: string) => string;
}

const HEIGHT = 200;
// The right padding holds the end label ("120 reps").
const PAD = { top: 16, right: 80, bottom: 28, left: 44 };
// Chart tokens: the series wears the accent; grid and text stay recessive.
const SERIES = 'var(--color-lime)';
const SURFACE = 'var(--color-surface)';
const GRID = 'var(--color-line)';
const MUTED = 'var(--color-muted)';
const INK = 'var(--color-fg)';

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** About four round-numbered ticks covering [min, max]. */
function niceTicks(min: number, max: number): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

/**
 * One series over time: 2px line, a 10% area wash, the latest value labelled at
 * the end, and a crosshair tooltip that follows the pointer or the arrow keys.
 * Needs at least two points; with fewer, show the number instead of a chart.
 */
export function LineChart({ points, label, formatValue, formatDate }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ticks = niceTicks(
    Math.min(...points.map((p) => p.value)),
    Math.max(...points.map((p) => p.value)),
  );
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const firstDay = dayNumber(points[0]!.date);
  const span = Math.max(1, dayNumber(points[points.length - 1]!.date) - firstDay);

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (iso: string) => PAD.left + ((dayNumber(iso) - firstDay) / span) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const coords = points.map((p) => ({ ...p, cx: x(p.date), cy: y(p.value) }));
  const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.cx},${c.cy}`).join(' ');
  const baseline = PAD.top + plotH;
  const area = `${line} L${coords[coords.length - 1]!.cx},${baseline} L${coords[0]!.cx},${baseline} Z`;
  const last = coords[coords.length - 1]!;
  const shown = active === null ? null : coords[active]!;

  /** Snap the crosshair to the nearest date: readers aim at a date, not at a 2px line. */
  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = event.clientX - box.left;
    let nearest = 0;
    coords.forEach((c, i) => {
      if (Math.abs(c.cx - px) < Math.abs(coords[nearest]!.cx - px)) nearest = i;
    });
    setActive(nearest);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      setActive((i) => Math.min(coords.length - 1, Math.max(0, (i ?? coords.length - 1) + step)));
    }
    if (event.key === 'Escape') setActive(null);
  };

  return (
    // Time runs left to right in both languages, like the numbers on its axis.
    <div ref={wrapper} className="relative w-full" dir="ltr">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${label}. ${formatDate(points[0]!.date)}: ${formatValue(points[0]!.value)}; ${formatDate(last.date)}: ${formatValue(last.value)}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setActive(coords.length - 1)}
        onBlur={() => setActive(null)}
        className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-lime"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill={MUTED}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {t.toLocaleString()}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={HEIGHT - 8} fontSize={11} fill={MUTED}>
          {formatDate(points[0]!.date)}
        </text>
        <text x={PAD.left + plotW} y={HEIGHT - 8} fontSize={11} fill={MUTED} textAnchor="end">
          {formatDate(last.date)}
        </text>

        <path d={area} fill={SERIES} fillOpacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke={SERIES}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* The latest value, labelled at the end of the line. */}
        <circle cx={last.cx} cy={last.cy} r={4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
        <text
          x={last.cx + 8}
          y={last.cy}
          dominantBaseline="middle"
          fontSize={12}
          fontWeight={600}
          fill={INK}
        >
          {formatValue(last.value)}
        </text>

        {shown && (
          <g pointerEvents="none">
            <line
              x1={shown.cx}
              x2={shown.cx}
              y1={PAD.top}
              y2={baseline}
              stroke={MUTED}
              strokeWidth={1}
            />
            <circle
              cx={shown.cx}
              cy={shown.cy}
              r={5}
              fill={SERIES}
              stroke={SURFACE}
              strokeWidth={2}
            />
          </g>
        )}

        {/* The hit area is the whole plot, not the 2px line. */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
        />
      </svg>

      {shown && (
        <div
          role="status"
          className="pointer-events-none absolute flex -translate-x-1/2 flex-col rounded-md border border-line bg-surface-2 px-3 py-2 text-sm shadow-lg"
          style={{
            left: Math.min(Math.max(shown.cx, 70), width - 70),
            top: Math.max(0, shown.cy - 64),
          }}
        >
          <span className="font-semibold text-fg">{formatValue(shown.value)}</span>
          <span className="text-muted">{formatDate(shown.date)}</span>
        </div>
      )}
    </div>
  );
}
