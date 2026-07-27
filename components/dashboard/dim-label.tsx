import { cn } from "@/lib/cn";
import { codeName, LABEL_CHARS, type LabelMode } from "@/lib/text";

/**
 * One dimension value — a fund, function, object, cost centre, project — as it appears in a
 * table cell, a list row or a tag.
 *
 * ---------------------------------------------------------------------------
 * THE CLIENT'S THREE RULES, AND WHY CSS ENFORCES TWO OF THEM
 *
 *   a. "Limit the display name to approximately 25–35 characters (or whatever fits the
 *      column width)."
 *   b. "Add an ellipsis (…) when truncated."
 *   c. "On hover, display the full Code – Name."
 *
 * The parenthesis in (a) is the important half, and it is why this does not cut the string
 * in JavaScript. A hard 32-character slice truncates `1000 — General Fund` in a column with
 * room for sixty, and leaves it overflowing in a column with room for twenty — the count is
 * a guess about a width that only the browser knows. So the budget is set as a `ch` ceiling
 * and CSS ellipsises at whichever is narrower, the ceiling or the column. A short label is
 * never touched, a long one in a wide column keeps everything that fits, and (b) is the
 * browser's own `text-overflow`, which cannot disagree with what was actually clipped.
 *
 * `clip()` in lib/text.ts is the JavaScript counterpart, for SVG text, where none of this
 * is available.
 *
 * (c) IS THE FULL LABEL, NOT THE SHOWN ONE. The title says `1000 — General Fund` even when
 * the reader has chosen Codes Only and the cell reads `1000`, and even when nothing was
 * truncated. The client asked for "the full Code – Name" on hover, and a tooltip that
 * repeats the four characters already on screen is worse than no tooltip: it teaches the
 * reader that hovering tells them nothing.
 * ---------------------------------------------------------------------------
 */
export function DimLabel({
  code,
  name,
  mode,
  note,
  chars = LABEL_CHARS,
  className,
}: {
  code: string | null | undefined;
  name: string | null | undefined;
  /** The reader's setting — see lib/dashboard/label-mode.ts. Omitted means Codes + Names. */
  mode?: LabelMode;
  /**
   * Extra context for the tooltip — a function's classification, say. Appended after the
   * full label rather than replacing it, so a cell that wants to say more than the name on
   * hover does not cost the reader rule (c). Never rendered on screen.
   */
  note?: string;
  /**
   * This column's character budget. The default sits mid-range in the client's 25–35; pass
   * a smaller one for a narrow column and a larger one where the name is the whole point of
   * the row.
   */
  chars?: number;
  className?: string;
}) {
  const full = codeName(code, name);
  const shown = codeName(code, name, mode);
  if (!shown) return null;

  return (
    <span
      title={note ? `${full} · ${note}` : full}
      // `min(100%, …)` rather than a bare ceiling: inside a flex or grid child the column
      // can be narrower than the budget, and a fixed `ch` max-width would push the row wide
      // instead of ellipsising. `align-bottom` keeps an inline-block from shifting the
      // cell's baseline and adding a stray pixel of row height.
      style={{ maxWidth: `min(100%, ${chars}ch)` }}
      className={cn("inline-block truncate align-bottom", className)}
    >
      {shown}
    </span>
  );
}
