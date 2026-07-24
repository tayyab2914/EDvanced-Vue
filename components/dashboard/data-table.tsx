import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

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
  label: string;
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
    return <p className="py-8 text-center text-[12.5px] text-muted-2">{empty}</p>;
  }

  const pad = dense ? "px-2.5 py-2" : spacious ? "px-3 py-3.5" : "px-3 py-2.5";

  const renderRow = (row: Row, isTotal: boolean, index = 0) => (
    <tr
      key={row.id}
      className={cn(
        isTotal
          ? "border-t-2 border-line bg-panel font-semibold text-ink"
          : "border-t border-line-soft",
        !isTotal && zebra && index % 2 === 1 && "bg-panel/60",
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
              "text-[12.5px]",
              c.align === "right" ? "text-right tabular-nums" : "text-left",
              !isTotal && "text-ink-muted",
              cell.strong && "font-semibold text-ink",
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
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  pad,
                  "text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-2",
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
    status?: ReactNode;
  }[];
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="py-5 text-center text-[12.5px] text-muted-2">{empty}</p>;
  }
  return (
    <ul className="flex flex-col">
      {items.map((i, idx) => (
        <li
          key={i.id}
          className={cn(
            "flex items-center justify-between gap-3 py-2.5",
            idx < items.length - 1 && "border-b border-line-soft",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-ink-muted" title={i.name}>
              {i.name}
            </span>
            {i.note && <span className="block truncate text-[11px] text-muted-2">{i.note}</span>}
          </span>
          <span className="flex flex-none items-center gap-2">
            <span className="text-right">
              <span
                className={cn("block text-[13px] font-semibold tabular-nums", TONE[i.tone])}
              >
                {i.value}
              </span>
              {i.percent && (
                <span className={cn("block text-[10.5px] tabular-nums", TONE[i.tone])}>
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
