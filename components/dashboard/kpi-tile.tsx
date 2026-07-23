import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icons";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { StatusRung } from "@/lib/dashboard/status";
import { NOT_AVAILABLE, type DeltaTone } from "@/lib/dashboard/format";

/**
 * The KPI tile — the top row of every dashboard, and the client's first named requirement:
 * "carry forward the KPI hierarchy".
 *
 * The contract: icon chip · uppercase label · large value · one sub-line of context ·
 * optionally a status badge or a delta. Nothing else. A tile that grew a second sub-line
 * would stop being scannable, which is the only thing it is for.
 *
 * `value` is a STRING, always. Every figure here is a Prisma.Decimal upstream, and a tile
 * that accepted a number would silently round a district's nine-figure total at the
 * component boundary — the dashboard and the CSV export of the same figure would then
 * disagree, which is precisely the trust this product cannot spend.
 */

export type TileTone = "green" | "blue" | "purple" | "amber" | "teal" | "red";

const CHIP: Record<TileTone, string> = {
  green: "bg-strong-bg text-strong",
  blue: "bg-[#e8eef7] text-brand",
  purple: "bg-[#ece8f8] text-[#5b4bb5]",
  amber: "bg-monitor-bg text-monitor",
  teal: "bg-[#e0f2f0] text-[#0a7b70]",
  red: "bg-action-bg text-action",
};

const DELTA: Record<DeltaTone, string> = {
  positive: "text-strong",
  negative: "text-action",
  neutral: "text-muted",
};

export function KpiTile({
  label,
  value,
  sub,
  icon,
  tone = "blue",
  status,
  statusNote,
  delta,
  href,
  hrefLabel,
  unavailableReason,
}: {
  label: string;
  /** Pre-formatted. Pass NOT_AVAILABLE ("—") when the figure cannot be computed. */
  value: string;
  sub?: ReactNode;
  icon?: IconName;
  tone?: TileTone;
  status?: StatusRung;
  /** The rule the status was judged against — "Target ≥ 5.00%". */
  statusNote?: string;
  delta?: { text: string; tone: DeltaTone; note?: string };
  href?: string;
  hrefLabel?: string;
  /** Shown on hover when the value is unavailable. */
  unavailableReason?: string;
}) {
  const unavailable = value === NOT_AVAILABLE;

  const body = (
    <>
      <div className="mb-2.5 flex items-start justify-between gap-2">
        {icon && (
          <span
            className={cn(
              "flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg",
              CHIP[tone],
            )}
          >
            <Icon name={icon} size={15} />
          </span>
        )}
        {href && (
          <span className="text-[11px] font-medium text-brand group-hover:underline">
            {hrefLabel ?? "View"} →
          </span>
        )}
      </div>

      <div className="text-[10.5px] font-semibold uppercase leading-tight tracking-[0.055em] text-muted">
        {label}
      </div>

      <div
        className={cn(
          // Proportional figures, not tabular: at 25px, tabular-nums gives every digit the
          // width of a zero and "121" reads loose. `tabular-nums` belongs in columns.
          "mt-1.5 text-[25px] font-semibold leading-none tracking-[-0.5px] [font-variant-numeric:proportional-nums]",
          unavailable ? "text-muted-2" : "text-ink",
        )}
        title={unavailable ? (unavailableReason ?? "Not enough data to work this out yet.") : undefined}
      >
        {value}
      </div>

      {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-muted-2">{sub}</div>}

      {(status || delta) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {status && <StatusBadge status={status} size="sm" reason={unavailableReason} />}
          {delta && (
            <span className={cn("text-[11.5px] font-semibold tabular-nums", DELTA[delta.tone])}>
              {delta.text}
            </span>
          )}
          {delta?.note && <span className="text-[11px] text-muted-2">{delta.note}</span>}
          {statusNote && <span className="text-[11px] text-muted-2">{statusNote}</span>}
        </div>
      )}
    </>
  );

  const className =
    "group flex min-w-0 flex-col rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,32,56,0.03)]";

  if (href) {
    return (
      <Link href={href} className={cn(className, "transition-colors hover:border-[#c8d3e4]")}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

/**
 * The KPI row.
 *
 * Six tiles do not fit legibly in the 1200px content column at this type scale, and the
 * breakpoint that looks right for a six-up grid — `lg:` — is exactly where the sidebar
 * takes 250px back. So it steps 2 → 3 → 6 and only reaches six on a genuinely wide screen.
 */
export function KpiRow({ children, count = 6 }: { children: ReactNode; count?: number }) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
        count >= 6 ? "2xl:grid-cols-6" : count === 5 ? "2xl:grid-cols-5" : "xl:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}
