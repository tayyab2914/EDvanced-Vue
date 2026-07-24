import { cn } from "@/lib/cn";
import { RUNG_MARK } from "@/components/dashboard/status-badge";
import type { StatusBand, StatusRung } from "@/lib/dashboard/status";

/**
 * The policy benchmark strip — §6.1's "Fund Balance % – Policy Benchmark".
 *
 * A horizontal bar divided into the district's four policy bands with a marker showing
 * where it currently sits. The bands come from the district's OWN thresholds
 * (lib/dashboard/status.ts#bands), so the strip, the badge beside it and the alert
 * underneath cannot disagree.
 *
 * Not a gradient. The client's inspiration fades red into green, which reads as though the
 * boundaries are soft — and they are not: 2.99% and 3.00% are different answers with
 * different consequences. Discrete segments with the numbers printed on them tell the truth
 * about a threshold.
 *
 * M4 moved the rung names OUT of the bands and under them, which is the one change in the
 * client's mockup that is not cosmetic. Inside the bands, a name had to fit whatever width
 * the district's own thresholds happened to give it — "Acceptable" in a band 9% wide
 * truncated to "Acce…", and a status label that cannot be read is a status label that is
 * not there. Underneath, each name gets the full column and carries its range with it.
 */
export function BenchmarkBand({
  value,
  bands,
  format = (v) => `${v}%`,
  /** The district's aspiration, drawn as a dotted rule across the strip. */
  target,
  label,
}: {
  value: number | null;
  /** Worst-first, as `bands()` returns them. */
  bands: StatusBand[];
  format?: (v: number) => string;
  target?: number;
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

  const RUNG_TEXT: Record<StatusRung, string> = {
    Strong: "text-strong",
    Acceptable: "text-acceptable",
    Monitor: "text-monitor",
    "Action Required": "text-action",
    "N/A": "text-na",
  };

  const widthOf = (b: StatusBand) => {
    const from = b.from ?? min;
    const to = b.to ?? max;
    return Math.max(((Math.min(to, max) - Math.max(from, min)) / span) * 100, 6);
  };

  return (
    <div>
      <div className="relative">
        {/* The marker rides above the strip so it never covers a band boundary. */}
        {value !== null && (
          <div
            className="absolute -top-[26px] z-10 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${pct(value)}%` }}
          >
            <span className="whitespace-nowrap rounded bg-ink px-1.5 py-[3px] text-[11px] font-semibold tabular-nums text-white">
              {format(value)}
            </span>
            <span
              aria-hidden
              className="h-0 w-0 border-x-[4px] border-t-[4px] border-x-transparent border-t-ink"
            />
          </div>
        )}

        <div className="relative flex h-[14px] w-full">
          {bands.map((b, i) => (
            <div
              key={b.rung}
              className={cn("h-full", i === 0 && "rounded-l-full", i === bands.length - 1 && "rounded-r-full")}
              style={{
                width: `${widthOf(b)}%`,
                background: RUNG_MARK[b.rung],
                // 2px of surface between segments, as everywhere else in this product.
                marginRight: i < bands.length - 1 ? 2 : 0,
              }}
              title={`${b.rung}: ${b.label}`}
            />
          ))}

          {/* The current position, punched through the band it sits in. */}
          {value !== null && (
            <span
              aria-hidden
              className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white bg-ink shadow-[0_1px_2px_rgba(15,32,56,0.35)]"
              style={{ left: `${pct(value)}%` }}
            />
          )}

          {target !== undefined && (
            <span
              aria-hidden
              className="absolute -top-1 bottom-[-4px] border-l border-dashed border-ink-muted"
              style={{ left: `${pct(target)}%` }}
            />
          )}
        </div>
      </div>

      {/* The boundaries, printed. A band chart whose thresholds are only implied is asking
          the reader to estimate the very number the policy exists to make exact. */}
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-2">
        <span>{format(min)}</span>
        {bands
          .map((b) => b.from)
          .filter((v): v is number => v !== null)
          .map((v) => (
            <span key={v}>{format(v)}</span>
          ))}
        <span>{format(max)}+</span>
      </div>

      {/* The rung names, each under its own band with the range it covers. */}
      <div className="mt-2 flex">
        {bands.map((b, i) => (
          <div
            key={b.rung}
            className="min-w-0 px-0.5 text-center"
            style={{ width: `${widthOf(b)}%`, marginRight: i < bands.length - 1 ? 2 : 0 }}
          >
            <span className={cn("block truncate text-[10.5px] font-semibold", RUNG_TEXT[b.rung])}>
              {b.rung === "Action Required" ? "Action" : b.rung}
            </span>
            <span className="block truncate text-[10px] tabular-nums text-muted-2">{b.label}</span>
          </div>
        ))}
      </div>

      {label && <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{label}</p>}
    </div>
  );
}
