"use client";

import { useState, type ReactNode } from "react";

/**
 * The "Key Insight" bar under the Fund Balance Trend chart — Figma 3:12493, which is a
 * macOS "Mini Tip" popover instance: white card, soft shadow, an arrow notch pointing up
 * at the card it annotates, and a close control.
 *
 * The design's SF Pro sizes are kept (17px semibold title at 85% black, 15px body at 50%);
 * the family itself inherits the app stack like every other card in the redesign. The 💡
 * belongs to the design's own title text.
 *
 * A CLIENT component, alone in this band, because the ✕ genuinely does something — it
 * dismisses the tip for the render it is on. Not persisted: an insight is recomputed from
 * the district's own figures each period, and a dismissal that outlived the sentence it
 * dismissed would hide a different insight than the one the reader closed.
 */
export function OverviewInsightTip({ children }: { children: ReactNode }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative mt-[22px] rounded-[12px] bg-white px-[16px] pb-[16px] pt-[18px] shadow-[0_6px_18px_rgba(0,0,0,0.08)]">
      {/* The popover notch — a rotated square clipped by the bar's own top edge. */}
      <span
        aria-hidden
        className="absolute -top-[7px] left-1/2 size-[15px] -translate-x-1/2 rotate-45 rounded-[2px] bg-white"
      />
      <div className="flex items-start gap-[12px]">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-[22px] tracking-[-0.43px] text-[#060606]">
            Key Insight 💡
          </p>
          <p className="mt-[4px] text-[14px] leading-[20px] tracking-[-0.23px] text-[#060606]">
            {children}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss insight"
          className="flex size-[30px] flex-none items-center justify-center rounded-full bg-[rgba(120,120,128,0.16)] text-[#060606] transition-opacity hover:opacity-75"
        >
          <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
