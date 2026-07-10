import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "error" | "success" | "info" | "warning";

const TONES: Record<Tone, string> = {
  error: "bg-bad-bg text-bad ring-[#f0cdbf]",
  success: "bg-ok-bg text-ok ring-[#c3e2d0]",
  info: "bg-[#f2f7ff] text-[#33507a] ring-[#d5e3fb]",
  warning: "bg-warn-bg text-warn ring-[#ecd6a6]",
};

export function Alert({
  tone = "info",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-3.5 py-2.5 text-[13px] ring-1 ring-inset",
        TONES[tone],
      )}
    >
      {children}
    </div>
  );
}
