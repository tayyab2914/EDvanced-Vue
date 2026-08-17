import { cn } from "@/lib/cn";
import { CountUp } from "@/components/count-up";
import type { PaceLabel } from "@/lib/dashboard/pace";

/**
 * The Expenditure redesign's status strip — a transcription of Figma 55:3218 ("Cards") with
 * the two page-level floaters reunited: the outlined "11.06% below expected spending"
 * capsule (55:3226) and the "3.9% of budget" capsule (55:3239).
 *
 * Two panes on one white bordered card, the same construction as the Revenue status strip:
 * "Expenditure Status" with its verdict in 32px ink and the design's cube glyph beside it,
 * then "Encumbrances" with the 25px figure and the purple ledger-lines glyph.
 *
 * The pane titles disagree about their own ink — #1f1f21 on the left, #797979 on the right —
 * and the figures about their size (32px verdict, 25px money). Both are the mockup's own
 * choices and are copied deliberately, same licence as the Executive split card.
 *
 * FONT: DM Sans on the titles and figures, Aeonik Pro TRIAL on the capsules — the trial
 * licence situation overview-kpi.tsx documents. Everything inherits the app stack.
 */

/** The verdict's ink — the design's #e65f2b for Behind, extended along the pace vocabulary. */
const VERDICT_INK: Record<PaceLabel, string> = {
  "On Target": "#1a932e",
  Ahead: "#1a932e",
  Behind: "#e65f2b",
  "Over Budget": "#e65f2b",
  Critical: "#fd4438",
  "N/A": "#797979",
};

/**
 * The design's cube-02 glyph — verbatim from the export, stroke and 12% fill in one ink.
 * Exported: the Fund Balance band's "Reserve status" card (Figma 55:3725) draws the same
 * cube beside its verdict, in the verdict's own colour.
 */
export function CubeGlyph({ color }: { color: string }) {
  return (
    <svg
      aria-hidden
      width="55"
      height="59"
      viewBox="0 0 55.25 59.46"
      fill="none"
      className="block"
      style={{ color }}
    >
      {/* The export ships the shaded face as its own layer at left-1/2 / top-31.25% of the
          71px box; translated back into the icon's own coordinates that is (26.6, 15.4). */}
      <path
        opacity="0.12"
        transform="translate(26.63 15.4)"
        d="M26.625 22.534V4.09105C26.625 2.85593 26.625 1.99705 26.5575 1.30997C26.4864 0.587116 25.8667 0.0891784 25.1458 0L2.82129e-06 13.3125L0 39.9375V42.0441C0.399365 42.0441 0.79873 42.0036 1.19192 41.9228C2.08043 41.74 2.91943 41.2739 4.59742 40.3417L21.7558 30.8093C23.5279 29.8248 24.414 29.3325 25.0593 28.6323C25.6301 28.0129 26.062 27.2788 26.3263 26.479C26.625 25.5749 26.625 24.5613 26.625 22.534Z"
        fill="currentColor"
      />
      <path
        d="M27.6252 29.7316L27.6252 56.3566M27.6252 29.7316L2.47939 16.4191M27.6252 29.7316L52.7711 16.4191M27.6252 29.7316L54.2502 44.5232M27.6252 29.7316L1.00022 43.0441M27.6252 29.7316V1.62741M32.2226 56.7608L49.381 47.2284C51.1532 46.2438 52.0392 45.7516 52.6845 45.0514C53.2553 44.432 53.6873 43.6978 53.9515 42.898C54.2502 41.994 54.2502 40.9803 54.2502 38.953V20.5101C54.2502 18.4828 54.2502 17.4692 53.9515 16.5651C53.6873 15.7653 53.2553 15.0312 52.6845 14.4118C52.0392 13.7116 51.1532 13.2193 49.381 12.2348L32.2226 2.70237C30.5446 1.77015 29.7057 1.30404 28.8171 1.1213C28.0308 0.959567 27.2197 0.959567 26.4333 1.1213C25.5448 1.30404 24.7058 1.77015 23.0278 2.70237L5.86947 12.2348C4.09728 13.2193 3.21119 13.7116 2.56597 14.4118C1.99515 15.0312 1.56317 15.7653 1.29892 16.5651C1.00022 17.4692 1.00022 18.4828 1.00022 20.5101V38.953C1.00022 40.9803 1.00022 41.994 1.29892 42.898C1.56317 43.6978 1.99515 44.432 2.56597 45.0514C3.21119 45.7516 4.09728 46.2438 5.86947 47.2284L23.0278 56.7608C24.7058 57.693 25.5448 58.1591 26.4333 58.3419C27.2197 58.5036 28.0308 58.5036 28.8171 58.3419C29.7057 58.1591 30.5446 57.693 32.2226 56.7608Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The design's ledger-lines glyph beside the Encumbrances figure — the export's #8E62EF. */
function LinesGlyph() {
  return (
    <svg aria-hidden width="63" height="44" viewBox="0 0 63 44" fill="none" className="block">
      <path
        d="M1 33.7334C1 34.5939 1 35.0242 1.03482 35.3869C1.42183 39.4189 4.92899 42.6155 9.35253 42.9683C9.75051 43 10.2226 43 11.1667 43H51.8333C52.7774 43 53.2495 43 53.6475 42.9683C58.071 42.6155 61.5782 39.4189 61.9652 35.3869C62 35.0242 62 34.5939 62 33.7334M13.3728 32.4807H49.6927M13.0332 20.9957H49.6927M13.3728 10.7299H49.1923M13.3728 1H46.8888"
        stroke="#8E62EF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ExpenditureStatusStrip({
  verdict,
  /** Replaces the coloured verdict word when the pace cannot be judged. */
  verdictLabel,
  /** "11.06% below expected spending" — the outlined capsule under the verdict. */
  note,
  /** Pre-formatted encumbrances total — "$8.18M". */
  encumbrances,
  /** "3.9% of budget" — the arrowed capsule under the figure. */
  encumbranceNote,
}: {
  verdict: PaceLabel;
  verdictLabel?: string;
  note: string;
  encumbrances: string;
  encumbranceNote: string;
}) {
  const ink = VERDICT_INK[verdict];

  return (
    <div
      data-reveal
      className="mx-auto flex w-[676px] max-w-full flex-col rounded-[24px] bg-[#FFFFFF9E]"
    >
      <div className="flex w-full flex-col items-stretch gap-[8px] px-[8px] pb-[8px] pt-0 sm:flex-row sm:gap-[16px]">
        {/* ---- Expenditure status ---- */}
        <div className="flex w-full min-w-0 flex-col gap-[10px] rounded-[16px] p-[16px] sm:w-[290px] sm:min-w-[254px] sm:flex-none">
          <div className="flex items-start justify-between gap-[8px]">
            <div className="flex min-w-0 flex-col items-start gap-[8px]">
              <span className="text-[15px] font-medium leading-[20px] text-[#1f1f21]">
                Expenditure Status
              </span>
              <span
                className="whitespace-nowrap text-[32px] font-medium leading-[36px]"
                style={{ color: ink }}
              >
                {verdictLabel ?? (verdict === "N/A" ? "Not available" : verdict)}
              </span>
            </div>
            <span aria-hidden className="flex size-[71px] flex-none items-center justify-center">
              <CubeGlyph color={ink} />
            </span>
          </div>
          <span className="inline-flex w-fit max-w-full items-center rounded-[20px] border-[0.8px] border-[#9e9e9e] bg-white px-[8px] py-px text-[10px] leading-normal tracking-[0.1px] text-black">
            <span className="truncate">{note}</span>
          </span>
        </div>

        {/* The 40px hairline driver — full-width when the panes stack on a phone. */}
        <div
          aria-hidden
          className={cn(
            "h-px w-full flex-none self-stretch bg-[#e7e7e7]",
            "sm:h-[40px] sm:w-px sm:self-center",
          )}
        />

        {/* ---- Encumbrances ---- */}
        <div className="flex w-full min-w-0 flex-col gap-[8px] rounded-[16px] p-[16px] sm:w-[301px] sm:min-w-[254px] sm:flex-none">
          <div className="flex items-start justify-between gap-[8px]">
            <div className="flex min-w-0 flex-col items-start">
              <span className="text-[15px] font-medium leading-[20px] text-[#797979]">
                Encumbrances
              </span>
              <span className="text-[14px] leading-normal text-[rgba(121,121,121,0.55)]">
                Committed, not yet spent
              </span>
              <span className="whitespace-nowrap text-[25px] font-medium leading-[36px] text-[#1f1f21] [font-variant-numeric:proportional-nums]">
                <CountUp value={encumbrances} />
              </span>
            </div>
            <span
              aria-hidden
              className="flex h-[42px] w-[61px] flex-none items-center justify-center self-center"
            >
              <LinesGlyph />
            </span>
          </div>
          {/* NO ARROW GLYPH. "→ 3.6% of budget" implied a movement; the figure is a share,
              and the design's own arrow was decoration on a statement. */}
          <span className="inline-flex w-fit max-w-full items-center rounded-[20px] border-[0.8px] border-[#9e9e9e] bg-white px-[8px] py-px text-[10px] leading-normal tracking-[0.1px] text-black">
            <span className="truncate">{encumbranceNote}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
