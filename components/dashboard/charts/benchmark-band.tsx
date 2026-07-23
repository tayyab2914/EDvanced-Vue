import { RUNG_MARK } from "@/components/dashboard/status-badge";
import type { StatusBand } from "@/lib/dashboard/status";

/**
 * The policy benchmark strip — §6.1's "Fund Balance % – Policy Benchmark".
 *
 * A horizontal bar divided into the district's four policy bands with a marker showing
 * where it currently sits. The bands come from the district's OWN thresholds
 * (lib/dashboard/status.ts#bands), so the strip, the badge beside it and the alert
 * underneath cannot disagree.
 *
 * Not a gradient. The reference screenshot fades red into green, which reads as though the
 * boundaries are soft — and they are not: 2.99% and 3.00% are different answers with
 * different consequences. Discrete segments with the numbers printed on them tell the truth
 * about a threshold.
 */
export function BenchmarkBand({
  value,
  bands,
  format = (v) => `${v}%`,
  label,
}: {
  value: number | null;
  /** Worst-first, as `bands()` returns them. */
  bands: StatusBand[];
  format?: (v: number) => string;
  label?: string;
}) {
  if (bands.length === 0) return null;

  // The strip's span: from the first band's upper bound stepped down, to the last band's
  // lower bound stepped up, so the open-ended bands at each end still have width.
  const lower = bands[0].to ?? 0;
  const upperFrom = bands[bands.length - 1].from ?? lower;
  const step = Math.max((upperFrom - lower) / Math.max(bands.length - 2, 1), lower || 1);
  const min = Math.max(0, lower - step);
  const max = upperFrom + step;
  const span = max - min || 1;

  const pct = (v: number) => ((Math.max(min, Math.min(v, max)) - min) / span) * 100;

  return (
    <div>
      <div className="relative">
        {/* The bands. A 2px surface gap separates them, as everywhere else. */}
        <div className="flex h-[26px] w-full overflow-hidden rounded-md">
          {bands.map((b, i) => {
            const from = b.from ?? min;
            const to = b.to ?? max;
            const width = ((Math.min(to, max) - Math.max(from, min)) / span) * 100;
            return (
              <div
                key={b.rung}
                className="flex items-center justify-center"
                style={{
                  width: `${Math.max(width, 4)}%`,
                  background: RUNG_MARK[b.rung],
                  marginRight: i < bands.length - 1 ? 2 : 0,
                }}
                title={`${b.rung}: ${b.label}`}
              >
                <span className="truncate px-1 text-[9.5px] font-semibold text-white/95">
                  {b.rung}
                </span>
              </div>
            );
          })}
        </div>

        {value !== null && (
          <div
            className="absolute -top-[3px] flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${pct(value)}%` }}
          >
            <span className="rounded bg-ink px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-white">
              {format(value)}
            </span>
            <span className="h-[30px] w-[2px] bg-ink" />
          </div>
        )}
      </div>

      {/* The boundaries, printed. A band chart whose thresholds are only implied is asking
          the reader to estimate the very number the policy exists to make exact. */}
      <div className="mt-[13px] flex justify-between text-[10px] tabular-nums text-muted-2">
        <span>{format(min)}</span>
        {bands
          .map((b) => b.from)
          .filter((v): v is number => v !== null)
          .map((v) => (
            <span key={v}>{format(v)}</span>
          ))}
        <span>{format(max)}+</span>
      </div>

      {label && <p className="mt-2 text-[11.5px] leading-relaxed text-muted-2">{label}</p>}
    </div>
  );
}
