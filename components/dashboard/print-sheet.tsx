import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { SheetFit } from "./print-sheet-fit";

/**
 * The one-page landscape sheet every dashboard prints to.
 *
 * ---------------------------------------------------------------------------
 * WHY A FIXED CANVAS AND NOT A PRINT STYLESHEET
 *
 * The first attempt at this was a `@media print` block that trimmed padding and stepped the
 * type down, and it printed FIVE pages. The reason is worth writing down, because it is the
 * trap any second attempt would fall into as well.
 *
 * A print stylesheet cannot see the page it is laying out. The dashboard's grids are keyed
 * to viewport breakpoints — the six KPI tiles need `2xl` (1536px) to sit six across — and an
 * A4 landscape page at 8mm margins is 1062 CSS pixels wide. So on paper the row silently
 * became two rows of three, the three chart cards kept their screen heights, and 1545px of
 * content went at a 733px page. `break-inside: avoid` then did what it was asked to: rather
 * than slicing a 670px card in half it pushed each one to a fresh sheet, turning a 2.1x
 * overflow into five pages.
 *
 * So the sheet is a FIXED CANVAS instead: 990px wide, laid out identically on screen and on
 * paper, with no viewport breakpoint anywhere inside it. 990px is not arbitrary — it is
 * narrower than the printable width of both A4 landscape (1062px) and US Letter landscape
 * (995px), so the same sheet fits whichever paper the print dialogue is left on.
 *
 * That makes the on-screen view a true preview of the PDF, and — the part that matters — it
 * makes the height measurable BEFORE printing, which is what `SheetFit` needs. A district
 * with four insights instead of two, or fund names twice as long, still gets one page: the
 * fitter scales the canvas down a few percent rather than letting it become page two.
 * ---------------------------------------------------------------------------
 */

/**
 * The canvas, in CSS pixels.
 *
 * Height is the printable box of A4 landscape at 8mm margins (194mm) less a few pixels of
 * slack, because a sheet measured at exactly the page height is one rounding error from
 * being two pages.
 */
export const SHEET_WIDTH = 990;
export const SHEET_HEIGHT = 720;

export function PrintSheet({
  /** "Executive Summary" — what this sheet is. */
  title,
  /** The district, printed above the title. A board packet is filed by district. */
  district,
  /** "June 2027 · FY 2026-27 · All funds" — the scope the figures were computed under. */
  scope,
  /** "Data as of 30 June 2027". */
  asOf,
  /** Where the on-screen "back" link goes. Never printed. */
  backHref,
  children,
}: {
  title: string;
  district: string;
  scope: string;
  asOf?: string;
  backHref: string;
  children: ReactNode;
}) {
  return (
    <div className="sheet-shell">
      {/*
        Scoped to the routes that render a sheet, so the ordinary multi-page print of the
        same dashboard stays portrait. `size` is a request, not a guarantee — the dialogue
        can still be set to Letter, which is exactly why the canvas is 990px wide.
      */}
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>

      <div className="sheet-notice print:hidden">
        <p>
          This is the one-page <strong>{title}</strong>. Your browser&apos;s print dialogue
          should open by itself — choose <strong>Save as PDF</strong> and leave the layout on{" "}
          <strong>Landscape</strong>. If it did not open, press Ctrl/Cmd + P.
        </p>
        <Link href={backHref} className="sheet-back">
          ← Back to dashboard
        </Link>
      </div>

      <div className="sheet-page" data-sheet>
        <div data-sheet-fit className="sheet-fit">
          <header className="sheet-head">
            <div className="min-w-0">
              <p className="sheet-district">{district}</p>
              <h1 className="sheet-title">{title}</h1>
            </div>
            <div className="sheet-meta">
              <span>{scope}</span>
              {asOf && <span className="sheet-asof">{asOf}</span>}
            </div>
          </header>

          <div className="sheet-body">{children}</div>

          <footer className="sheet-foot">
            <span>All amounts are unaudited.</span>
            <span>
              {district} · {scope}
            </span>
          </footer>
        </div>
      </div>

      <SheetFit />
    </div>
  );
}

/**
 * A horizontal band of the sheet.
 *
 * `cols` is a raw grid-template, not a breakpoint name, because the canvas has one width and
 * a breakpoint inside it would be a lie. `grow` hands a band the leftover vertical space so
 * the sheet fills the page rather than leaving a white gutter at the bottom.
 */
export function SheetBand({
  cols,
  grow,
  className,
  children,
}: {
  /** e.g. "1fr 1fr 1fr" or "2fr 1fr". Every track wants `minmax(0,…)` semantics. */
  cols: string;
  grow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("sheet-band", grow && "sheet-band-grow", className)}
      style={{
        gridTemplateColumns: cols
          .split(/\s+/)
          .map((t) => (t.startsWith("minmax") ? t : `minmax(0,${t})`))
          .join(" "),
      }}
    >
      {children}
    </div>
  );
}

/**
 * The sheet's KPI tile.
 *
 * Purpose-built rather than a compacted `KpiTile`. That tile is laid out for a 170px column
 * on a 1440px laptop and earns its height honestly — a spacer that floors the trend pill so
 * six tiles line up, a footer that wraps to a second line rather than squeezing the figure.
 * Every one of those decisions is right on screen and costs 60px of paper each. This one has
 * four fixed lines and cannot grow.
 */
export function SheetKpi({
  label,
  value,
  sub,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  /** One short line under the figure — "93.13% of full-year budget". */
  sub?: string;
  /** The judgement, if the figure has one — "Acceptable · target ≥ 5.00%". */
  note?: string;
  tone?: "neutral" | "positive" | "negative" | "monitor";
}) {
  return (
    <div className="sheet-kpi" data-tone={tone}>
      <span className="sheet-kpi-label">{label}</span>
      <span className="sheet-kpi-value">{value}</span>
      {sub && <span className="sheet-kpi-sub">{sub}</span>}
      {note && <span className="sheet-kpi-note">{note}</span>}
    </div>
  );
}

/** A hairline key/value row for the sheet — the figures a chart needs spelled out beside it. */
export function SheetStats({
  items,
}: {
  items: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }[];
}) {
  return (
    <dl className="sheet-stats">
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd data-tone={i.tone ?? "neutral"}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A card on the sheet.
 *
 * Deliberately NOT `SectionCard`. That card carries a footer link to the screen it
 * summarises, an ⓘ affordance and a subtitle — all of which are either dead ink or dead
 * pixels on paper, and together they were ~70px per card across six cards.
 */
export function SheetCard({
  title,
  badge,
  note,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  /** A status badge beside the title. */
  badge?: ReactNode;
  /** A short qualifier printed to the right of the title — "Five largest sources". */
  note?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("sheet-card", className)}>
      <header className="sheet-card-head">
        <h2 className="sheet-card-title">
          <span className="truncate">{title}</span>
          {badge}
        </h2>
        {note && <span className="sheet-card-note">{note}</span>}
      </header>
      <div className={cn("sheet-card-body", bodyClassName)}>{children}</div>
    </section>
  );
}
