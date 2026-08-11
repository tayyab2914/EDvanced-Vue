"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that counts up to itself on first view — "$22.17M" runs 0 → 22.17 with its
 * currency and magnitude intact.
 *
 * The value arrives PRE-FORMATTED, because formatting is the page's job everywhere in
 * this product (see the note on LineChart) — so this animates the first number it can
 * find in the string and leaves every other character exactly where it was: "($4.83M)"
 * keeps its accounting parentheses, "−15.13%" its true-minus sign, "66 days" its unit.
 * A value with no number in it ("—", "-----") renders as-is, untouched.
 *
 * Server-renders the FINISHED string. The zero state exists only after hydration and
 * only once the element is actually in view, so the PDF export, a no-JS render and a
 * reduced-motion reader all get the real figure with no intermediate state.
 */

const NUM = /-?\d[\d,]*(?:\.\d+)?/;

export function CountUp({
  value,
  duration = 1100,
  className,
}: {
  value: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(value);

  // Render-phase reset when the figure itself changes (a filter narrowed the scope) —
  // the sanctioned alternative to setting state synchronously inside the effect.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(value);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const m = value.match(NUM);
    if (!m || m.index === undefined) return;
    const target = parseFloat(m[0].replace(/,/g, ""));
    if (!Number.isFinite(target)) return;

    const decimals = (m[0].split(".")[1] ?? "").length;
    const grouped = m[0].includes(",");
    const prefix = value.slice(0, m.index);
    const suffix = value.slice(m.index + m[0].length);
    const fmt = (n: number) =>
      grouped
        ? n.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : n.toFixed(decimals);

    let raf = 0;
    let started = false;
    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setText(p >= 1 ? value : prefix + fmt(target * eased) + suffix);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started) {
            started = true;
            io.disconnect();
            run();
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
