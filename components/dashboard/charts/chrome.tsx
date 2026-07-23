import type { ReactNode } from "react";
import type { Ticks, LinearScale } from "@/lib/dashboard/scale";

/**
 * The furniture every chart shares: gridlines, axis labels, a legend, an empty state.
 *
 * Pulled out so the charts themselves are only the marks. Two rules from the mark spec
 * are enforced here rather than left to each chart to remember:
 *
 *   - Gridlines and axes are SOLID hairlines one step off the surface. Never dashed —
 *     a dashed rule reads as "threshold" or "projection", and on these dashboards those
 *     both mean something specific.
 *   - Axis text wears a text token, never a series colour.
 *
 * Everything here is a plain function component with no state, so it renders on the
 * server and survives a print to PDF.
 */

export interface Plot {
  /** Outer SVG box. */
  width: number;
  height: number;
  /** Inner drawing area. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  innerWidth: number;
  innerHeight: number;
}

export function plotOf(
  width: number,
  height: number,
  pad: { t?: number; r?: number; b?: number; l?: number } = {},
): Plot {
  const t = pad.t ?? 14;
  const r = pad.r ?? 12;
  // The x-axis band lives INSIDE the box. A chart sized to its plot alone gets a nested
  // scrollbar the moment the month labels render.
  const b = pad.b ?? 28;
  const l = pad.l ?? 52;
  return {
    width,
    height,
    left: l,
    top: t,
    right: width - r,
    bottom: height - b,
    innerWidth: width - l - r,
    innerHeight: height - t - b,
  };
}

export const AXIS_TEXT = 10;

export function Gridlines({
  plot,
  ticks,
  y,
}: {
  plot: Plot;
  ticks: Ticks;
  y: LinearScale;
}) {
  return (
    <g aria-hidden>
      {ticks.values.map((v) => (
        <line
          key={v}
          x1={plot.left}
          x2={plot.right}
          y1={y(v)}
          y2={y(v)}
          stroke="var(--color-viz-grid)"
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      ))}
    </g>
  );
}

export function YAxis({
  plot,
  ticks,
  y,
  format,
}: {
  plot: Plot;
  ticks: Ticks;
  y: LinearScale;
  format: (v: number) => string;
}) {
  return (
    <g aria-hidden>
      {ticks.values.map((v) => (
        <text
          key={v}
          x={plot.left - 8}
          y={y(v) + 3.5}
          textAnchor="end"
          fontSize={AXIS_TEXT}
          fill="var(--color-viz-label)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {format(v)}
        </text>
      ))}
    </g>
  );
}

/**
 * Category labels along the bottom.
 *
 * `every` thins them out. Twelve month labels fit; thirty-six do not, and overlapping
 * axis text is worse than fewer labels — the tooltip and the table carry the rest.
 */
export function XAxis({
  plot,
  categories,
  centers,
  every = 1,
}: {
  plot: Plot;
  categories: string[];
  centers: number[];
  every?: number;
}) {
  return (
    <g aria-hidden>
      {categories.map((c, i) =>
        i % every === 0 ? (
          <text
            key={`${c}-${i}`}
            x={centers[i]}
            y={plot.bottom + 16}
            textAnchor="middle"
            fontSize={AXIS_TEXT}
            fill="var(--color-viz-label)"
          >
            {c}
          </text>
        ) : null,
      )}
    </g>
  );
}

/** The zero rule, drawn a shade stronger than the grid when the data crosses it. */
export function ZeroLine({ plot, y, at = 0 }: { plot: Plot; y: LinearScale; at?: number }) {
  return (
    <line
      x1={plot.left}
      x2={plot.right}
      y1={y(at)}
      y2={y(at)}
      stroke="var(--color-viz-axis)"
      strokeWidth={1}
      shapeRendering="crispEdges"
      aria-hidden
    />
  );
}

/**
 * A policy threshold drawn across the plot.
 *
 * This is the one place a dashed rule is correct, and it is why the gridlines may not be:
 * dashed means "a line the district drew", not "a line the chart drew".
 */
export function ThresholdLine({
  plot,
  y,
  at,
  label,
  color = "var(--color-monitor-mark)",
}: {
  plot: Plot;
  y: LinearScale;
  at: number;
  label: string;
  color?: string;
}) {
  const yy = y(at);
  if (!Number.isFinite(yy) || yy < plot.top || yy > plot.bottom) return null;
  return (
    <g>
      <line
        x1={plot.left}
        x2={plot.right}
        y1={yy}
        y2={yy}
        stroke={color}
        strokeWidth={1.25}
        strokeDasharray="4 3"
      />
      <text
        x={plot.right}
        y={yy - 4}
        textAnchor="end"
        fontSize={AXIS_TEXT}
        fill="var(--color-viz-label)"
      >
        {label}
      </text>
    </g>
  );
}

// ===================== legend =====================

export interface LegendItem {
  label: string;
  color: string;
  /** Renders the key as a dashed rule rather than a solid swatch. */
  dashed?: boolean;
  /** Trailing figure, e.g. the category's amount on a donut legend. */
  value?: string;
  /** Second trailing figure, e.g. the share. */
  meta?: string;
}

/**
 * Always present for two or more series — identity must never rest on colour-matching
 * alone. A single-series chart gets no legend: its title already names what is plotted,
 * and a one-swatch box just restates it.
 */
export function Legend({
  items,
  layout = "row",
}: {
  items: LegendItem[];
  layout?: "row" | "column";
}) {
  if (items.length < 2 && layout === "row") return null;

  return (
    <ul
      className={
        layout === "row"
          ? "flex flex-wrap items-center gap-x-4 gap-y-1.5"
          : "flex flex-col gap-2"
      }
    >
      {items.map((it) => (
        <li key={it.label} className="flex min-w-0 items-center gap-2 text-[11.5px]">
          <Swatch color={it.color} dashed={it.dashed} />
          <span className="min-w-0 flex-1 truncate text-muted">{it.label}</span>
          {it.value && (
            <span className="flex-none font-semibold tabular-nums text-ink">{it.value}</span>
          )}
          {it.meta && <span className="flex-none tabular-nums text-muted-2">{it.meta}</span>}
        </li>
      ))}
    </ul>
  );
}

export function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  if (dashed) {
    return (
      <svg width={14} height={9} className="flex-none" aria-hidden>
        <line
          x1={0}
          y1={4.5}
          x2={14}
          y2={4.5}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="3.5 2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      className="h-[9px] w-[9px] flex-none rounded-[2px]"
      style={{ background: color }}
    />
  );
}

// ===================== states =====================

/**
 * What a chart shows when the platform has nothing to draw.
 *
 * Deliberately not a chart of zeros. §5.17's rule — "a missing figure is silence, never
 * reassurance" — applies just as much to a flat line at the bottom of an axis, which
 * reads as "your cash is gone" rather than "no cash file was uploaded".
 */
export function ChartEmpty({
  height = 200,
  children,
}: {
  height?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-line text-center text-[12.5px] text-muted-2"
      style={{ height }}
    >
      <span className="max-w-[26ch] px-4">{children}</span>
    </div>
  );
}

/**
 * The accessible wrapper every chart sits in.
 *
 * `summary` is the text alternative — a sentence stating what the chart shows and its
 * headline figure, so the chart is not the only way to read it. It is visually hidden but
 * read aloud, and it is genuinely written per chart rather than generated from the title.
 */
export function ChartFigure({
  title,
  summary,
  children,
  className,
}: {
  title: string;
  summary: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={className} role="img" aria-label={`${title}. ${summary}`}>
      <span className="sr-only">{summary}</span>
      <div aria-hidden>{children}</div>
    </figure>
  );
}
