"use client";

import { useEffect } from "react";

/**
 * The trigger behind the executive dashboard's entrance animations.
 *
 * Server components mark themselves `data-reveal`; this observer stamps `.in` on each one
 * the first time it scrolls into view, and the CSS in globals.css (the "entrance
 * animations" block) does the actual drawing — needles sweep, rings fill, lines draw,
 * bars grow. One observer for the whole page rather than a client wrapper per card, so
 * every chart stays the Server Component it was and still renders into the PDF export
 * untouched: the hidden pre-states are `@media screen` only, and this component is the
 * only JavaScript in the scheme.
 *
 * `prefers-reduced-motion` short-circuits to the finished state — the animation is
 * decoration, and decoration must never gate the figures.
 */
export function RevealManager() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll("[data-reveal]"));
    if (
      els.length === 0 ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      for (const el of els) el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      // Fire once a fifth of the card is on screen — early enough that the sweep is
      // underway as the card arrives, late enough that it is actually seen.
      { threshold: 0.18 },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, []);
  return null;
}
