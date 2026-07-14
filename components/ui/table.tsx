import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="min-w-full text-[13px]">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-panel">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="divide-y divide-line-soft border-t border-line">
      {children}
    </tbody>
  );
}

export function TR({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <tr className={className}>{children}</tr>;
}

// Split so a sortable header (components/ui/sortable.tsx) can put the PADDING on its inner
// button — making the whole cell the click target — while keeping the same type styles on the
// cell itself. Merging a `p-0` override onto TH would not work: Tailwind emits the `padding`
// shorthand before the axis utilities, so `px-5 py-3` would win over `p-0`.
export const TH_TYPE =
  "text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted";
export const TH_PADDING = "px-5 py-3";

export function TH({
  children,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th className={cn(TH_PADDING, TH_TYPE, className)} {...props}>
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td className={cn("px-5 py-3.5 text-ink-muted", className)} {...props}>
      {children}
    </td>
  );
}

export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-5 py-10 text-center text-[13px] text-muted-2"
      >
        {children}
      </td>
    </tr>
  );
}
