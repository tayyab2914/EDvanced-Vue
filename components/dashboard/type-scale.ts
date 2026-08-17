/**
 * The dashboard type scale — ONE ramp, read by every card on every dashboard.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 *
 * Each card in this product was transcribed from its own Figma frame, and the frames do not
 * agree with each other: the source table headed itself at 20px, the executive cards at 16px
 * regular, the widget cards at 16px semibold, the revenue insight card at 14px bold. Read one
 * at a time each is faithful; read down a page they look like four different products, which
 * is exactly the inconsistency the client called out.
 *
 * So the sizes below OUT-RANK the individual mockups. A card heading is 16px bold black
 * wherever it appears, a card's sub-line is 11px semibold black, and a column header is
 * 11px bold black. Import these rather than retyping the numbers — a literal that drifts is
 * how the ramp broke the first time.
 *
 * BLACK, not grey. Every one of these ends in `text-[#060606]` and none of them carries an
 * opacity: the client's rule is that no text on a dashboard is set in grey. Hierarchy is
 * carried by SIZE and WEIGHT instead, which is the one channel that survives a projector, a
 * printed board pack and a reader who does not have perfect contrast vision.
 * ---------------------------------------------------------------------------
 */

/** The band title above a group of cards — "Overview". One step above a card. */
export const BAND_TITLE =
  "text-[22px] font-bold leading-[26px] tracking-[0.22px] text-[#060606]";

/** Every card's heading, on every dashboard. */
export const CARD_TITLE =
  "text-[16px] font-bold leading-[1.4] tracking-[0.16px] text-[#060606]";

/** The sub-line under a card heading — "Top five sources compared to expected YTD". */
export const CARD_SUBTITLE =
  "text-[11px] font-semibold leading-[1.5] tracking-[0.1px] text-[#060606]";

/** A heading INSIDE a card — the sub-section of a card that carries two blocks. */
export const CARD_SUBHEAD =
  "text-[13px] font-bold leading-[1.4] tracking-[0.1px] text-[#060606]";

/**
 * A table's column header row.
 *
 * The SAME SIZE as the cells beneath it, and bold — the dashboards carry two table
 * implementations (the generic `DataTable` and the four hand-built Figma grids) and they
 * used to disagree twice over: 11.5px medium headers over 12.5px cells in one, 14px regular
 * headers over 14px cells in the other. Weight is what makes a header a header here, because
 * colour no longer can: everything on these screens is black.
 */
export const COLUMN_HEADER =
  "text-[14px] font-bold leading-[1.15] tracking-[0.14px] text-[#060606]";

/** A label above or beneath a figure — the metric rails, the KPI tiles, the stat strips. */
export const METRIC_LABEL = "text-[11px] font-semibold leading-[1.4] text-[#060606]";

/** Body copy inside a card — alert messages, insight sentences, footnotes. */
export const CARD_BODY = "text-[12px] leading-[1.5] text-[#060606]";
