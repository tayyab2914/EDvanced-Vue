import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import { TONE_INK, TONE_TINT, type TileTone } from "@/components/dashboard/kpi-tile";
import { SheetFit } from "./print-sheet-fit";

/**
 * The fixed landscape sheet every dashboard prints to.
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
 * makes the height measurable BEFORE printing, which is what `SheetFit` needs.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SHEET IS PAGINATED, AND WHY BY HAND
 *
 * The sheet used to be exactly one page, and paid for it: every dashboard dropped cards to
 * get there. The Executive summary had no Alerts panel, Revenue and Expenditures showed a
 * merged four-row "Largest variances" instead of the two movers cards and printed neither
 * variance trend, Cash printed no monthly walk, Fund Balance printed neither the policy
 * benchmark nor the reserve components. A board packet that silently omits a third of the
 * dashboard is not a summary of it.
 *
 * So a sheet is now an ARRAY OF PAGES, each its own fixed 990x720 canvas, each measured and
 * scaled on its own, with a page break between them. The pagination is authored, never
 * discovered: the alternative — one long canvas and `break-inside: avoid` — is the exact
 * mechanism that produced five pages, because the print engine decides where the cut lands
 * and it has no idea which cards belong together. Here the route says "these bands, then a
 * break, then these", and the fitter guarantees each side of the break holds its page.
 *
 * Pages carry a full masthead and a "Page 1 of 2" colophon each, because a printed page is
 * separated from its packet the moment somebody photocopies one of them.
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

/** One page of a sheet. */
export interface SheetPage {
  /**
   * What this page is, printed after the title — "Detail & alerts". Page one normally has
   * none: its label is the sheet's own title.
   */
  label?: string;
  content: ReactNode;
}

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
  /** The pages, in order. One entry per printed sheet of paper. */
  pages,
}: {
  title: string;
  district: string;
  scope: string;
  asOf?: string;
  backHref: string;
  pages: SheetPage[];
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
          This is the {pages.length}-page <strong>{title}</strong>. Your browser&apos;s print
          dialogue should open by itself — choose <strong>Save as PDF</strong> and leave the
          layout on <strong>Landscape</strong>. If it did not open, press Ctrl/Cmd + P.
        </p>
        <Link href={backHref} className="sheet-back">
          ← Back to dashboard
        </Link>
      </div>

      {pages.map((page, i) => (
        <div className="sheet-page" data-sheet key={i}>
          {/*
            `minHeight` rather than a CSS rule, so the one number the fitter divides by is
            the one number the page is built to. A page shorter than the paper would leave a
            white gutter under its last band and — worse — let a `grow` band collapse.
          */}
          <div data-sheet-fit className="sheet-fit" style={{ minHeight: SHEET_HEIGHT }}>
            <header className="sheet-head">
              <div className="min-w-0">
                <p className="sheet-district">{district}</p>
                <h1 className="sheet-title">
                  {title}
                  {page.label && <span className="sheet-title-part"> — {page.label}</span>}
                </h1>
              </div>
              <div className="sheet-meta">
                <span>{scope}</span>
                {asOf && <span className="sheet-asof">{asOf}</span>}
              </div>
            </header>

            <div className="sheet-body">{page.content}</div>

            <footer className="sheet-foot">
              <span>All amounts are unaudited.</span>
              <span>
                {district} · {scope}
              </span>
              <span>
                Page {i + 1} of {pages.length}
              </span>
            </footer>
          </div>
        </div>
      ))}

      <SheetFit />
    </div>
  );
}

/**
 * A horizontal band of the sheet.
 *
 * `cols` is a raw grid-template, not a breakpoint name, because the canvas has one width and
 * a breakpoint inside it would be a lie.
 *
 * Bands take their natural height and the page's leftover falls BELOW the last one, above the
 * colophon. There used to be a `grow` flag that handed that leftover to a chosen band, and it
 * had to go: every card on a sheet is a chart at a fixed height or a table of however many
 * rows the district has, so a stretched band did not draw anything bigger — it drew the same
 * card with 200px of white inside it, which reads as a rendering fault where the same 200px
 * at the foot of the page reads as a margin.
 */
export function SheetBand({
  cols,
  className,
  children,
}: {
  /** e.g. "1fr 1fr 1fr" or "2fr 1fr". Every track wants `minmax(0,…)` semantics. */
  cols: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("sheet-band", className)}
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
  icon,
  accent,
}: {
  label: string;
  value: string;
  /** One short line under the figure — "93.13% of full-year budget". */
  sub?: string;
  /** The judgement, if the figure has one — "Acceptable · target ≥ 5.00%". */
  note?: string;
  tone?: "neutral" | "positive" | "negative" | "monitor";
  /** The Overview tile's icon, drawn in the same tinted disc at sheet scale. */
  icon?: IconName;
  /** The disc's tone — the screen tile's `tileTone`, so the two always match. */
  accent?: TileTone;
}) {
  return (
    <div className="sheet-kpi" data-tone={tone}>
      <span className="sheet-kpi-head">
        <span className="sheet-kpi-label">{label}</span>
        {icon && accent && (
          <span
            aria-hidden
            className="sheet-kpi-disc"
            style={{ background: TONE_TINT[accent], color: TONE_INK[accent] }}
          >
            <Icon name={icon} size={11} />
          </span>
        )}
      </span>
      <span className="sheet-kpi-value">{value}</span>
      {sub && <span className="sheet-kpi-sub">{sub}</span>}
      {note && <span className="sheet-kpi-note">{note}</span>}
    </div>
  );
}

/** A hairline key/value row for the sheet — the figures a chart needs spelled out beside it. */
export function SheetStats({
  items,
  stacked,
}: {
  items: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }[];
  /** One figure per row rather than per column — for a card too narrow to run them across. */
  stacked?: boolean;
}) {
  return (
    <dl className="sheet-stats" data-stacked={stacked ? "" : undefined}>
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
