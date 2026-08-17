import { ArrowGlyph } from "@/components/dashboard/overview-panel";

/**
 * The Cash band's split card — a transcription of Figma 55:5196, the two info cards riding
 * centred under the Overview tiles the way the Executive band's Available Budget / Alerts
 * pair does (components/dashboard/overview-kpi.tsx#OverviewSplitCard), and on the same
 * chassis: a 676px bordered white card, 24px radius, two 16px-radius panes.
 *
 * The left pane is the CASH STATUS verdict — the rung word at 32px with the distance to
 * the board target in an outlined capsule beneath it. The right pane restates CASH
 * DISBURSEMENTS (MTD), which the design deliberately keeps off the tile row above (four
 * tiles, not five) and parks here at the Executive pair's own type ramp.
 *
 * The two decorative glyphs — the blue cube and the purple ledger lines — are the design's
 * own exported vectors, inlined verbatim (stroke #4AB1D9 / #8E62EF). They are drawings,
 * not data, and aria-hidden accordingly.
 *
 * FONT: the mockup sets the panes in DM Sans and the capsules in Aeonik Pro TRIAL — the
 * same trial-licence situation overview-kpi.tsx documents. Everything inherits the app
 * stack; the size/weight steps survive.
 */

/** The design's cube-02 — 71px box, stroke #4AB1D9 with a 12% fill facet. */
function CubeGlyph() {
  return (
    <svg aria-hidden width="55" height="60" viewBox="0 0 55.2504 59.4632" fill="none" className="block">
      {/* the shaded right facet — the design's separate "Fill" vector, placed where the
          mockup places it inside the cube's own box */}
      <path
        opacity="0.12"
        d="M26.625 22.534V4.09105C26.625 2.85593 26.625 1.99705 26.5575 1.30997C26.4864 0.587116 25.8667 0.0891784 25.1458 0L2.82129e-06 13.3125L0 39.9375V42.0441C0.399365 42.0441 0.79873 42.0036 1.19192 41.9228C2.08043 41.74 2.91943 41.2739 4.59742 40.3417L21.7558 30.8093C23.5279 29.8248 24.414 29.3325 25.0593 28.6323C25.6301 28.0129 26.062 27.2788 26.3263 26.479C26.625 25.5749 26.625 24.5613 26.625 22.534Z"
        fill="#4AB1D9"
        transform="translate(26.625, 15.4)"
      />
      <path
        d="M27.6252 29.7316L27.6252 56.3566M27.6252 29.7316L2.47939 16.4191M27.6252 29.7316L52.7711 16.4191M27.6252 29.7316L54.2502 44.5232M27.6252 29.7316L1.00022 43.0441M27.6252 29.7316V1.62741M32.2226 56.7608L49.381 47.2284C51.1532 46.2438 52.0392 45.7516 52.6845 45.0514C53.2553 44.432 53.6873 43.6978 53.9515 42.898C54.2502 41.994 54.2502 40.9803 54.2502 38.953V20.5101C54.2502 18.4828 54.2502 17.4692 53.9515 16.5651C53.6873 15.7653 53.2553 15.0312 52.6845 14.4118C52.0392 13.7116 51.1532 13.2193 49.381 12.2348L32.2226 2.70237C30.5446 1.77015 29.7057 1.30404 28.8171 1.1213C28.0308 0.959567 27.2197 0.959567 26.4333 1.1213C25.5448 1.30404 24.7058 1.77015 23.0278 2.70237L5.86947 12.2348C4.09728 13.2193 3.21119 13.7116 2.56597 14.4118C1.99515 15.0312 1.56317 15.7653 1.29892 16.5651C1.00022 17.4692 1.00022 18.4828 1.00022 20.5101V38.953C1.00022 40.9803 1.00022 41.994 1.29892 42.898C1.56317 43.6978 1.99515 44.432 2.56597 45.0514C3.21119 45.7516 4.09728 46.2438 5.86947 47.2284L23.0278 56.7608C24.7058 57.693 25.5448 58.1591 26.4333 58.3419C27.2197 58.5036 28.0308 58.5036 28.8171 58.3419C29.7057 58.1591 30.5446 57.693 32.2226 56.7608Z"
        stroke="#4AB1D9"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The design's ledger-lines glyph — 61×42, stroke #8E62EF. */
function LinesGlyph() {
  return (
    <svg aria-hidden width="61" height="42" viewBox="0 0 63 44" fill="none" className="block">
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

export function CashSplitCard({
  status,
  disbursements,
}: {
  status: {
    label: string;
    /** The rung word — "Strong", "Monitor" — or "N/A". */
    value: string;
    /** The outlined capsule under the verdict — "+18 days vs board target". */
    chip?: string;
  };
  disbursements: {
    label: string;
    /**
     * The lighter second line under the label. Optional — the redesigned copy folds the
     * period into the heading ("Cash Disbursements (MTD)") and leaves this empty rather
     * than restating it.
     */
    caption?: string;
    value: string;
    /** The bordered mini-capsule with the tiny arrow — "Cash paid during the current month". */
    note?: string;
  };
}) {
  return (
    <div
      data-reveal
      className="mx-auto flex w-[676px] max-w-full flex-col rounded-[24px] bg-[#FFFFFF9E] py-[4px]"
    >
      {/* Stacked below `sm` for the same reason the Executive pair stacks: side by side the
          two panes need ~615px before either can shrink, which is wider than any phone. */}
      <div className="flex w-full flex-col items-stretch gap-[8px] px-[8px] sm:flex-row sm:gap-[16px]">
        {/* ---- Cash status ---- */}
        <div className="flex w-full min-w-0 flex-col rounded-[16px] px-[16px] py-[16px] sm:w-[290px] sm:flex-none">
          <div className="flex items-start justify-between gap-[10px]">
            <div className="flex min-w-0 flex-col gap-[8px]">
              <span className="text-[14px] font-medium leading-[20px] text-[#060606]">
                {status.label}
              </span>
              <span className="text-[32px] font-bold leading-[36px] text-[#060606] [font-variant-numeric:proportional-nums]">
                {status.value}
              </span>
            </div>
            <span className="flex-none pr-[10px]">
              <CubeGlyph />
            </span>
          </div>
          {status.chip && (
            <span className="mt-[8px] inline-flex w-fit items-center rounded-[20px] border-[0.8px] border-[#9e9e9e] bg-white px-[8px] py-px text-[10px] leading-normal tracking-[0.1px] text-[#060606]">
              {status.chip}
            </span>
          )}
        </div>

        {/* the 40px hairline driver, turned horizontal when the panes stack */}
        <div
          aria-hidden
          className="h-px w-full flex-none self-stretch bg-[#e7e7e7] sm:h-[40px] sm:w-px sm:self-center"
        />

        {/* ---- Cash disbursements (MTD) ---- */}
        <div className="flex w-full min-w-0 flex-col rounded-[16px] px-[16px] py-[16px] sm:w-[301px] sm:flex-none">
          <div className="flex items-start justify-between gap-[10px]">
            <div className="flex min-w-0 flex-col">
              <span className="text-[14px] font-medium leading-[20px] text-[#060606]">
                {disbursements.label}
              </span>
              {disbursements.caption && (
                <span className="text-[14px] leading-normal text-[#060606]">
                  {disbursements.caption}
                </span>
              )}
              <span className="text-[26px] font-medium leading-[36px] text-[#060606] [font-variant-numeric:proportional-nums]">
                {disbursements.value}
              </span>
            </div>
            <span className="flex-none pt-[15px]">
              <LinesGlyph />
            </span>
          </div>
          {disbursements.note && (
            <span className="mt-[5px] inline-flex w-fit items-center gap-[3px] rounded-[20px] border-[0.3px] border-black bg-white px-[7px] py-px text-[10px] leading-normal tracking-[0.1px] text-[#060606]">
              <span className="flex size-[10px] flex-none items-center justify-center">
                <ArrowGlyph color="#060606" className="scale-[0.8]" />
              </span>
              {disbursements.note}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
