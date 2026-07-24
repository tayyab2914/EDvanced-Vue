"use client";

import { useEffect, useRef } from "react";

/**
 * Opens the browser's print dialogue once the Executive Summary view has painted.
 *
 * The summary IS a PDF export — §8.5's bargain is that the browser's own Save as PDF is the
 * export, which is what lets these charts be server-rendered SVG rather than a client
 * charting library that would print blank. But an export the user has to find Ctrl+P for is
 * not an export, so the route opens the dialogue itself.
 *
 * Two frames of delay, not zero: the fonts and the SVG layout settle in the first, and
 * printing before they do produces a page whose charts have not been measured. `useRef`
 * guards against Strict Mode's double-invoke in development, which would otherwise stack
 * two dialogues.
 */
export function SummaryPrint() {
  const printed = useRef(false);

  useEffect(() => {
    if (printed.current) return;
    printed.current = true;

    const id = window.setTimeout(() => {
      window.requestAnimationFrame(() => window.print());
    }, 350);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <p className="rounded-lg border border-[#d5e3fb] bg-[#f2f7ff] px-3.5 py-2.5 text-[12px] text-[#33507a] print:hidden">
      This is the one-page Executive Summary. Your browser&apos;s print dialogue should open
      automatically — choose <strong className="font-semibold">Save as PDF</strong>, landscape.
      If it did not, press Ctrl/Cmd + P.
    </p>
  );
}
