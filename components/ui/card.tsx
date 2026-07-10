import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,32,56,0.03)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
