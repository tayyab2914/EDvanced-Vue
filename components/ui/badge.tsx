import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "gray" | "green" | "red" | "amber" | "blue" | "indigo";

const TONES: Record<Tone, string> = {
  gray: "bg-line-soft text-muted",
  green: "bg-ok-bg text-ok",
  red: "bg-bad-bg text-bad",
  amber: "bg-warn-bg text-warn",
  blue: "bg-[#e8eef7] text-brand",
  indigo: "bg-[#e8eef7] text-brand",
};

export function Badge({
  tone = "gray",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
