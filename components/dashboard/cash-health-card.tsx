import { cn } from "@/lib/cn";
import { CARD_TITLE, CARD_SUBTITLE } from "@/components/dashboard/type-scale";
import { OverviewPanel, PanelRungPill } from "@/components/dashboard/overview-panel";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * "Cash Health" — a transcription of Figma 55:5329: the 16px title, the thin 270° gauge
 * with the days figure under its hub, and the four policy rows over hairlines at the
 * card's floor — Status (the rung pill), the board's target and critical thresholds, and
 * the distance from target inked green or red.
 *
 * THE GAUGE IS COMPUTED, NOT TRACED. The mockup ships a widget frozen at a sample sweep
 * (its centre still reads the widget kit's Chinese placeholder text); this one draws the
 * arc from the district's own thresholds — the run below the board target in the band
 * orange, the run at or above it in the design's teal — and the needle at the actual
 * days-cash figure. The scale runs 0 to twice the target so the target always sits at the
 * sweep's midpoint, with the domain stretched when the actual figure runs past it: a
 * district holding three times its target should read as off the top of the dial, not be
 * clamped to it.
 *
 * No figure: the needle stays home, the centre letters "—", and the rows still print the
 * policy — which is real whether or not this month can be measured against it.
 */

const TEAL = "#04877c";
const ORANGE = "#e65f2b";

/** The dial's sweep: 270°, opening at the bottom — the design's own gap. */
const SWEEP = 270;
const START = 135; // degrees, clockwise from 3 o'clock
const R = 78;
const STROKE = 13;
const SIZE = 180;

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: SIZE / 2 + r * Math.cos(rad), y: SIZE / 2 + r * Math.sin(rad) };
}

/** An arc from `fromPct` to `toPct` of the sweep, as an SVG path. */
function arc(fromPct: number, toPct: number): string {
  const a0 = START + (SWEEP * fromPct) / 100;
  const a1 = START + (SWEEP * toPct) / 100;
  const p0 = polar(a0, R);
  const p1 = polar(a1, R);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

export function CashHealthCard({
  title = "Cash Health",
  subtitle = "Days cash on hand compared to policy",
  days,
  rung,
  target,
  critical,
}: {
  title?: string;
  /** What the dial is measuring — the sibling cards all carry one under the title. */
  subtitle?: string;
  /** Days cash on hand — null when it cannot be computed. */
  days: number | null;
  rung: StatusRung;
  /** The board's warning threshold — "Target (board policy)". */
  target: number;
  /** The board's critical threshold. */
  critical: number;
}) {
  // Twice the target keeps the target at the sweep's midpoint; a figure beyond that
  // stretches the domain rather than pinning the needle to the end stop.
  const max = Math.max(target * 2, days === null ? 0 : days * 1.1, critical + 10);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));

  const needleAngle = days === null ? null : START + (SWEEP * pct(days)) / 100;
  const needleTip = needleAngle === null ? null : polar(needleAngle, R - STROKE / 2 - 6);

  const vsTarget = days === null ? null : Math.round(days - target);

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Status", value: <PanelRungPill rung={rung} size="sm" /> },
    {
      label: "Target (board policy)",
      value: (
        <span className="text-[14px] font-semibold leading-normal tabular-nums text-[#060606]">
          {target} days
        </span>
      ),
    },
    {
      label: "Critical (board policy)",
      value: (
        <span className="text-[14px] font-semibold leading-normal tabular-nums text-[#060606]">
          {critical} days
        </span>
      ),
    },
    {
      label: "Current vs target",
      value: (
        <span
          className={cn(
            "text-[14px] font-semibold leading-normal tabular-nums",
            vsTarget === null
              ? "text-[#060606]"
              : vsTarget < 0
                ? "text-[#fd4438]"
                : "text-[#1a932e]",
          )}
        >
          {vsTarget === null ? "—" : `${vsTarget < 0 ? "−" : "+"}${Math.abs(vsTarget)} days`}
        </span>
      ),
    },
  ];

  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <h2 className={cn("pl-[16px]", CARD_TITLE)}>
        {title}
      </h2>
      {subtitle && <p className={cn("pl-[16px]", CARD_SUBTITLE)}>{subtitle}</p>}

      {/* ---- the dial ---- */}
      <div className="mt-[10px] flex justify-center">
        <svg
          width={SIZE}
          height={SIZE - 8}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={
            days === null
              ? "Days cash on hand cannot be computed for this period."
              : `${Math.round(days)} days of cash on hand against a board target of ${target}.`
          }
        >
          {/* below-target run in the band orange, the rest in the design's teal */}
          <path
            d={arc(0, pct(target))}
            fill="none"
            stroke={ORANGE}
            strokeWidth={STROKE}
            strokeLinecap="round"
            className="anim-fade"
          />
          <path
            d={arc(pct(target), 100)}
            fill="none"
            stroke={TEAL}
            strokeWidth={STROKE}
            strokeLinecap="round"
            className="anim-fade"
          />

          {/* the needle — a thin grey pointer with a hollow hub, as drawn */}
          {needleTip && (
            <g className="anim-fade-late">
              <line
                x1={SIZE / 2}
                y1={SIZE / 2}
                x2={needleTip.x}
                y2={needleTip.y}
                stroke="#9e9e9e"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <circle cx={SIZE / 2} cy={SIZE / 2} r={6.5} fill="white" stroke="#c4c4c4" strokeWidth={2} />
            </g>
          )}

          {/* the figure under the hub, inside the dial's open mouth */}
          <text
            x={SIZE / 2}
            y={SIZE / 2 + 46}
            textAnchor="middle"
            fontSize={26}
            fontWeight={700}
            fill="#060606"
          >
            {days === null ? "—" : Math.round(days)}
          </text>
          <text x={SIZE / 2} y={SIZE / 2 + 62} textAnchor="middle" fontSize={11} fill="#060606">
            Days
          </text>
          <text x={SIZE / 2} y={SIZE / 2 + 75} textAnchor="middle" fontSize={11} fill="#060606">
            Cash on hand
          </text>
        </svg>
      </div>

      {/* ---- the policy rows — hairlines between, as drawn ---- */}
      <dl className="mt-auto flex flex-col px-[8px] pt-[6px]">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={cn(
              "flex items-center justify-between gap-[12px] py-[8px]",
              i > 0 && "border-t border-[#e3e3e3]",
            )}
          >
            <dt className="text-[14px] leading-[1.5] text-[#060606]">{r.label}</dt>
            <dd className="flex-none">{r.value}</dd>
          </div>
        ))}
      </dl>
    </OverviewPanel>
  );
}
