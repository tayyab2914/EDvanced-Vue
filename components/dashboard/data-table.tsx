import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { COLUMN_HEADER } from "@/components/dashboard/type-scale";
import { FundTag } from "@/components/dashboard/shared";

/**
 * The dashboard table: right-aligned money, sign-coloured variance, and an emphasised
 * TOTAL row.
 *
 * Distinct from components/data/server-table.tsx, which is the paged, sortable, exportable
 * browser over tens of thousands of periodic rows. This one shows five to twelve summary
 * rows that are already in memory, and its job is comparison rather than navigation.
 *
 * It is also the "table view" every chart on the page needs to be accessible — the donut
 * beside it is the same numbers in a different shape.
 */

export interface Column {
  key: string;
  /** Usually a string. A node lets a header stack a qualifier under its title. */
  label: ReactNode;
  align?: "left" | "right";
  /** Narrow columns keep long account names from being squeezed. */
  width?: string;
}

export interface Cell {
  value: ReactNode;
  /** Colours the cell by sign — for variance columns only. */
  tone?: "positive" | "negative" | "neutral";
  /** Pulls one cell up to the ink step — the figure a row exists to show. */
  strong?: boolean;
  title?: string;
}

export interface Row {
  id: string;
  cells: Record<string, Cell | ReactNode>;
  /** Renders as the emphasised TOTAL row, pinned to the bottom. */
  total?: boolean;
  /** Tints the whole row — overspent, or approaching its ceiling. */
  flag?: "negative" | "warning";
  href?: string;
}

const TONE = {
  positive: "text-strong",
  negative: "text-action",
  neutral: "",
};

function isCell(v: Cell | ReactNode): v is Cell {
  return typeof v === "object" && v !== null && "value" in (v as object);
}

export function DataTable({
  columns,
  rows,
  total,
  empty = "Nothing to show for this period yet.",
  dense,
  spacious,
  zebra,
}: {
  columns: Column[];
  rows: Row[];
  /** Rendered last, emphasised. Built from the rows above it, never queried separately. */
  total?: Row;
  empty?: string;
  dense?: boolean;
  /**
   * §3.2a's Financial Health Summary — "more spacing between rows", per the client. A table
   * whose rows carry a full-size status badge needs the height, and this is the one table on
   * the dashboards where the badge IS the answer rather than a footnote to it.
   */
  spacious?: boolean;
  /** Alternating row tint. For long reference tables only, never for a five-row summary. */
  zebra?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-[12px] text-[#060606]">{empty}</p>;
  }

  const pad = dense ? "px-2.5 py-2" : spacious ? "px-3 py-3.5" : "px-3 py-2.5";

  const renderRow = (row: Row, isTotal: boolean, index = 0) => (
    <tr
      key={row.id}
      className={cn(
        isTotal
          ? "border-t-2 border-[#e7e7e7] bg-black/[0.03] font-semibold text-[#060606]"
          : // The first body row sits directly under the header's own hairline; giving it a
            // rule as well would draw a double line.
            index > 0 && "border-t border-black/[0.06]",
        !isTotal && zebra && index % 2 === 1 && "bg-black/[0.02]",
        // A row the caller has flagged — an overspent function, a fund below its floor. The
        // tint is a SECOND channel behind the badge the row already carries, never the only
        // one: "make overspending easier to identify visually" does not mean "identify it
        // by colour alone".
        !isTotal && row.flag === "negative" && "bg-action-bg/40",
        !isTotal && row.flag === "warning" && "bg-monitor-bg/40",
      )}
    >
      {columns.map((c) => {
        const raw = row.cells[c.key];
        const cell = isCell(raw) ? raw : { value: raw as ReactNode };
        return (
          <td
            key={c.key}
            title={cell.title}
            className={cn(
              pad,
              "text-[14px] leading-normal",
              c.align === "right" ? "text-right tabular-nums" : "text-left",
              !isTotal && "text-[#060606]",
              cell.strong && "font-semibold text-[#060606]",
              cell.tone && TONE[cell.tone],
            )}
          >
            {cell.value}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="min-w-full">
        <thead>
          {/* The redesign's header row (Figma 3:12545), set in the dashboards' one column
              header style — 14px bold black over a single hairline at 10% black. */}
          <tr className="border-b border-black/10">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  pad,
                  COLUMN_HEADER,
                  c.align === "right" ? "text-right" : "text-left",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => renderRow(r, false, i))}
          {total && renderRow(total, true)}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A compact list of name/amount pairs — §4.2's Top Positive / Negative Variances.
 *
 * M4 added the percentage and the status badge: "make positive and negative variances stand
 * out more" and "add additional statuses where appropriate". The dollar figure ranks the
 * rows (a tiny line 400% over budget is noise; a large one 3% over is the one to see) and
 * the percentage says how far off pace that dollar figure actually is.
 *
 * M5 added the FUND TAG, and it is the reason the card is worth reading on the All Funds
 * view at all. The client's question — "are these showing the top district-wide items
 * across all funds, or are they aggregated by account/object?" — had the unhappy answer
 * "aggregated", so a row named a variance and named nowhere to go. Each row is now one fund's
 * account (lib/finance/breakdown.ts `revenueBySourceAndFund`), the tag says which, and the
 * tag is a link to this same dashboard scoped to that fund. It is absent on a single-fund
 * page, where it would repeat the scope selector on every row.
 */
export function MoverList({
  items,
  empty = "No material variances.",
}: {
  items: {
    id: string;
    name: string;
    value: string;
    tone: "positive" | "negative";
    /** The same variance as a percentage — context for the amount. */
    percent?: string;
    note?: string;
    /** Where the variance originated. Set only when the page is scoped to All Funds. */
    fund?: { label: string; href?: string };
    status?: ReactNode;
  }[];
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="py-5 text-center text-[12px] text-[#060606]">{empty}</p>;
  }
  return (
    <ul data-mover-list className="flex flex-col">
      {items.map((i, idx) => (
        <li
          key={i.id}
          data-mover-row
          className={cn(
            "flex items-center justify-between gap-3 py-2.5",
            idx < items.length - 1 && "border-b border-line-soft",
          )}
        >
          <span className="min-w-0 flex-1">
            <span
              data-mover-name
              className="block truncate text-[12px] text-[#060606]"
              title={i.name}
            >
              {i.name}
            </span>
            {(i.fund || i.note) && (
              <span className="mt-1 flex min-w-0 items-center gap-1.5">
                {i.fund && <FundTag {...i.fund} />}
                {i.note && <span className="truncate text-[11px] text-[#060606]">{i.note}</span>}
              </span>
            )}
          </span>
          <span className="flex flex-none items-center gap-2">
            <span className="text-right">
              <span
                className={cn("block text-[13px] font-semibold tabular-nums", TONE[i.tone])}
              >
                {i.value}
              </span>
              {i.percent && (
                <span className={cn("block text-[11px] tabular-nums", TONE[i.tone])}>
                  {i.percent}
                </span>
              )}
            </span>
            {i.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
