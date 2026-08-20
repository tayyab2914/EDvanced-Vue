import { cn } from "@/lib/cn";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import type { StatusBand, StatusRung } from "@/lib/dashboard/status";

/**
 * "Unassigned Fund Balance" — a transcription of Figma 55:4200, the policy benchmark strip on the
 * redesign's card: the 12px segmented band over its 8%-black track (Action #EE201C,
 * Monitor #E65F2B, Acceptable #4AB1D9, Strong #1A932E — the exported fills), the value as
 * a tinted capsule riding above its own position with the design's short tick lines
 * punching through the band, the boundary figures under their boundaries, the rung names
 * over a hairline with each band's range beneath, and the policy sentence at the floor.
 *
 * The bands are the district's OWN thresholds (lib/dashboard/status.ts#bands), so this
 * strip and the badges above it cannot disagree — the same guarantee the old BenchmarkBand
 * carried, in the new clothes.
 *
 * The value capsule is tinted by the rung the value actually sits on. The mockup paints
 * its "4.94%" orange while calling 4–5% Acceptable two rows down — its one internal
 * contradiction, resolved in favour of the ladder.
 */

const BAND_FILL: Record<StatusRung, string> = {
  "Action Required": "#EE201C",
  Monitor: "#E65F2B",
  Acceptable: "#4AB1D9",
  Strong: "#1A932E",
  "N/A": "#ACACAB",
};

/** The value capsule's 18% wash + ink, along the same inks the band paints. */
const VALUE_PILL: Record<StatusRung, { bg: string; fg: string }> = {
  "Action Required": { bg: "rgba(238,32,28,0.18)", fg: "#ee201c" },
  Monitor: { bg: "rgba(230,95,43,0.18)", fg: "#e65f2b" },
  Acceptable: { bg: "rgba(74,177,217,0.22)", fg: "#1b7ba3" },
  Strong: { bg: "rgba(26,147,46,0.18)", fg: "#1a932e" },
  "N/A": { bg: "rgba(172,172,171,0.18)", fg: "#3a3a3a" },
};

/** The band's own short display names — the design letters "Action", not the full rung. */
const BAND_NAME: Partial<Record<StatusRung, string>> = { "Action Required": "Action" };

export function FundBalanceBenchmarkCard({
  title = "Unassigned Fund Balance",
  subtitle = "Compared to Board reserve policy",
  value,
  rung,
  bands,
  target,
  format = (v) => `${v.toFixed(v % 1 === 0 ? 0 : 2)}%`,
  note,
}: {
  title?: string;
  subtitle?: string;
  value: number | null;
  /** The rung `value` sits on — tints its capsule. */
  rung: StatusRung;
  /** Worst-first, as `bands()` returns them. */
  bands: StatusBand[];
  /** The district's aspiration, drawn as the dashed rule through the band. */
  target?: number;
  format?: (v: number) => string;
  /** The policy sentence at the card's floor. */
  note: string;
}) {
  if (bands.length === 0) return null;

  // The strip's span — same padding walk as the old BenchmarkBand, so the open-ended bands
  // at each end still have width to be seen at.
  const lower = bands[0].to ?? 0;
  const upperFrom = bands[bands.length - 1].from ?? lower;
  const step = Math.max((upperFrom - lower) / Math.max(bands.length - 2, 1), lower || 1);
  const min = Math.max(0, lower - step);
  const max = upperFrom + step;
  const span = max - min || 1;

  const pct = (v: number) => ((Math.max(min, Math.min(v, max)) - min) / span) * 100;
  const widthOf = (b: StatusBand) => {
    const from = b.from ?? min;
    const to = b.to ?? max;
    return Math.max(((Math.min(to, max) - Math.max(from, min)) / span) * 100, 6);
  };

  const pill = VALUE_PILL[rung];

  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <OverviewPanelHeader title={title} subtitle={subtitle} />

      <div className="mt-[52px]">
        <div className="relative">
          {/* the value capsule and its tick lines, riding at the value's own position */}
          {value !== null && (
            <>
              <div
                className="absolute -top-[44px] flex -translate-x-1/2 justify-center"
                style={{ left: `${pct(value)}%` }}
              >
                <span
                  className="whitespace-nowrap rounded-[20px] px-[8px] py-[5px] text-[12px] leading-normal tracking-[0.12px]"
                  style={{ background: pill.bg, color: pill.fg }}
                >
                  {format(value)}
                </span>
              </div>
              <span
                aria-hidden
                className="absolute -top-[14px] h-[11px] w-px bg-black"
                style={{ left: `${pct(value)}%` }}
              />
              <span
                aria-hidden
                className="absolute top-[15px] h-[11px] w-px bg-black"
                style={{ left: `${pct(value)}%` }}
              />
            </>
          )}

          {/* the segmented band on its 8%-black track */}
          <div className="relative flex h-[12px] w-full rounded-[15px] bg-black/[0.08]">
            {bands.map((b, i) => (
              <div
                key={b.rung}
                className={cn(
                  "h-full",
                  i === 0 && "rounded-l-[15px]",
                  i === bands.length - 1 && "rounded-r-[15px]",
                )}
                style={{
                  width: `${widthOf(b)}%`,
                  background: BAND_FILL[b.rung],
                  marginRight: i < bands.length - 1 ? 2 : 0,
                }}
                title={`${b.rung}: ${b.label}`}
              />
            ))}

            {/* the target, dashed through the band — "the dotted rule marks the target" */}
            {target !== undefined && (
              <span
                aria-hidden
                className="absolute -top-[4px] bottom-[-4px] border-l border-dashed border-[#060606]"
                style={{ left: `${pct(target)}%` }}
              />
            )}
          </div>

          {/* the boundaries, printed under their own positions */}
          <div className="relative mt-[2px] h-[20px] text-[10px] leading-[2] tracking-[0.1px] text-[#060606]">
            <span className="absolute left-0">{format(min)}</span>
            {bands
              .map((b) => b.from)
              .filter((v): v is number => v !== null)
              .map((v) => (
                <span key={v} className="absolute -translate-x-1/2" style={{ left: `${pct(v)}%` }}>
                  {format(v)}
                </span>
              ))}
            <span className="absolute right-0">{format(max)}</span>
          </div>
        </div>

        {/* the rung names over the hairline, the ranges beneath — each under its band */}
        <div className="mt-[40px] flex">
          {bands.map((b, i) => (
            <div
              key={b.rung}
              className="min-w-0 px-0.5 text-center"
              style={{ width: `${widthOf(b)}%`, marginRight: i < bands.length - 1 ? 2 : 0 }}
            >
              <span className="block truncate text-[9px] leading-normal tracking-[0.1px] text-[#060606] sm:text-[10px]">
                {BAND_NAME[b.rung] ?? b.rung}
              </span>
            </div>
          ))}
        </div>
        <div aria-hidden className="mx-[10px] mt-[10px] h-px bg-[#e7e7e7]" />
        <div className="mt-[10px] flex">
          {bands.map((b, i) => (
            <div
              key={b.rung}
              className="min-w-0 px-0.5 text-center"
              style={{ width: `${widthOf(b)}%`, marginRight: i < bands.length - 1 ? 2 : 0 }}
            >
              {/* A step down on a phone. These cells are sized to the BAND they name — the
                  Monitor band is 2%–3% of a 0–7% scale, so its cell is ~39px wide however
                  wide the card is, and "2% – 3%" set at 10px needs 42. The range a rung
                  covers is the whole point of the row, so the type gives way, not the text. */}
              <span className="block truncate text-[9px] leading-[2] tracking-[0.1px] text-[#060606] sm:text-[10px]">
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-auto pt-[28px] text-[10px] leading-[2] tracking-[0.1px] text-[#060606]">
        {note}
      </p>
    </OverviewPanel>
  );
}
