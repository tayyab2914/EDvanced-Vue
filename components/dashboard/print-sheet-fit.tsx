"use client";

import { useEffect } from "react";
import { SHEET_HEIGHT } from "./print-sheet";

/**
 * Scales the sheet so it cannot become a second page, then opens the print dialogue.
 *
 * WHY THE MEASUREMENT IS TRUSTWORTHY HERE
 *
 * Measuring on screen and printing on paper normally give different answers — the print
 * layout runs at the paper's width, which the page has no way to read. The sheet sidesteps
 * that by being a fixed 990px canvas with no viewport breakpoints inside it (see
 * `PrintSheet`), so the box measured here is the box that prints. One ratio, computed once,
 * is therefore correct for both.
 *
 * `zoom` rather than `transform: scale()`: a transform paints smaller but still reserves its
 * original height, so the page break lands where it always would have. `zoom` is a layout
 * property — the print engine paginates the scaled box, which is the entire point.
 *
 * The floor is 0.55. Below that a board packet is no longer readable, and silently printing
 * something nobody can read would be a worse failure than a second page; if a district ever
 * hits it, the sheet has too much on it and that is a design problem, not a scaling one.
 */
const MIN_ZOOM = 0.55;

export function SheetFit({ autoPrint = true }: { autoPrint?: boolean }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-sheet-fit]");
    if (!el) return;

    const fit = () => {
      // Measure unscaled. Reading the rect after resetting zoom forces the reflow that
      // makes the number current rather than the one from the previous fit.
      el.style.zoom = "1";
      const height = el.getBoundingClientRect().height;
      if (!height) return;
      const zoom = Math.min(1, SHEET_HEIGHT / height);
      // Floor to 3dp so a hairline of rounding cannot push the box back over the page.
      el.style.zoom = String(Math.max(MIN_ZOOM, Math.floor(zoom * 1000) / 1000));
    };

    fit();
    // Fonts land after first paint and change every line's height with them.
    void document.fonts?.ready.then(fit).catch(() => {});

    // Ctrl+P long after load, or a window resize that changed nothing inside the fixed
    // canvas but did change the scrollbar — re-measure rather than trust the first answer.
    window.addEventListener("beforeprint", fit);
    window.addEventListener("resize", fit);

    let timer: number | undefined;
    if (autoPrint && !sessionStorage.getItem(printedKey())) {
      // The sheet IS the PDF export — the browser's own Save as PDF is what §8.5 buys by
      // server-rendering every chart as SVG. An export the reader has to find Ctrl+P for is
      // not an export, so the dialogue opens itself, once per view.
      sessionStorage.setItem(printedKey(), "1");
      timer = window.setTimeout(() => {
        fit();
        window.requestAnimationFrame(() => window.print());
      }, 400);
    }

    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("resize", fit);
      if (timer) window.clearTimeout(timer);
    };
  }, [autoPrint]);

  return null;
}

/**
 * One key per URL. Without it, React Strict Mode's double-invoke in development stacks two
 * dialogues, and a back-then-forward returns to a page that prints at you again.
 */
function printedKey(): string {
  return `sheet-printed:${window.location.pathname}${window.location.search}`;
}
