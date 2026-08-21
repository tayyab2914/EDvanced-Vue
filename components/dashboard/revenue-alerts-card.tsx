import Link from "next/link";
import { cn } from "@/lib/cn";
import { CARD_TITLE } from "@/components/dashboard/type-scale";
import { OverviewPanel, ArrowGlyph } from "@/components/dashboard/overview-panel";
import { PillLink } from "@/components/dashboard/revenue-shared";
import type { DisplaySeverity } from "@/components/dashboard/alert-list";

/**
 * "Revenue Alerts" — a transcription of Figma 46:3402.
 *
 * The band's 16px title with the red count capsule beside it; each alert as a 12px sentence
 * with its severity pill at the right, the alert's rule named underneath in 42% black, a
 * red ↗ linking into the Alerts page, and the "Where" row of solid-white fund capsules the
 * client asked for ("the Alerts doesn't tell me which fund… so I do not know where to go").
 * Hairlines between alerts, and the centred "View All N Alerts" capsule at the foot.
 *
 * The mockup's 8px chips and labels are set at 10px — the redesign's standard
 * normalisation — and its severity vocabulary is the alert list's own: Action Required /
 * Review / Informational, from the same severity the alert engine graded.
 */

export interface RevenueAlertItem {
  id: string;
  severity: DisplaySeverity;
  /** The sentence — "Collections are 29.1% below budget ($24.69M against $208.9M)." */
  message: string;
  /** The rule that fired — "Collections Below Expected". */
  title: string;
  funds?: {
    id: string;
    label: string;
    detail: string;
    href?: string;
    /** `total` is the closing "+ 9 other funds" line, not a fund. See attribution.ts. */
    role?: "driver" | "offset" | "total";
  }[];
}

const SEVERITY_PILL: Record<DisplaySeverity, { bg: string; fg: string; label: string }> = {
  CRITICAL: { bg: "rgba(238,32,28,0.18)", fg: "#ee201c", label: "Action Required" },
  WARNING: { bg: "rgba(230,95,43,0.18)", fg: "#e65f2b", label: "Review" },
  INFORMATIONAL: { bg: "rgba(92,106,128,0.18)", fg: "#4d5a6e", label: "Informational" },
};

export function RevenueAlertsCard({
  title = "Revenue Alerts",
  alerts,
  totalCount,
  href,
  empty = "No revenue thresholds have been crossed this period.",
}: {
  title?: string;
  alerts: RevenueAlertItem[];
  totalCount: number;
  href: string;
  empty?: string;
}) {
  return (
    <OverviewPanel className="flex flex-col px-[24px] py-[20px]">
      {/* ---- header ---- */}
      <div className="flex items-center gap-[10px] pl-[19px]">
        <h2 className={CARD_TITLE}>{title}</h2>
        {alerts.length > 0 && (
          <span className="inline-flex min-w-[21px] items-center justify-center rounded-[20px] bg-[rgba(238,32,28,0.18)] px-[7px] py-px text-[10px] leading-[17px] tracking-[0.08px] text-[#ee201c]">
            {alerts.length}
          </span>
        )}
      </div>

      {/* ---- the alerts ---- */}
      {alerts.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-[36px] text-center text-[12px] text-[#060606]">
          {empty}
        </p>
      ) : (
        <ul className="mt-[10px] flex flex-1 flex-col">
          {alerts.map((a, i) => {
            const sev = SEVERITY_PILL[a.severity];
            return (
              <li
                key={a.id}
                className={cn("py-[14px]", i > 0 && "border-t border-[#e3e3e3]")}
              >
                <div className="flex items-start gap-[10px]">
                  <p className="min-w-0 flex-1 pl-[19px] text-[12px] leading-normal tracking-[0.12px] text-[#060606]">
                    {a.message}
                  </p>
                  <span
                    className="inline-flex flex-none items-center whitespace-nowrap rounded-[20px] px-[8px] py-[5px] text-[10px] leading-normal tracking-[0.08px]"
                    style={{ background: sev.bg, color: sev.fg }}
                  >
                    {sev.label}
                  </span>
                </div>
                <div className="mt-[6px] flex items-center justify-between gap-[10px] pl-[19px]">
                  <span className="text-[10px] leading-normal tracking-[0.08px] text-[#060606]">
                    {a.title}
                  </span>
                  <Link
                    href={href}
                    aria-label={`Open alerts: ${a.title}`}
                    className="flex size-[23px] flex-none items-center justify-center transition-opacity hover:opacity-70"
                  >
                    <ArrowGlyph color="#ee201c" />
                  </Link>
                </div>
                {(a.funds?.length ?? 0) > 0 && (
                  <div className="mt-[8px] flex flex-col items-start gap-[4px] sm:flex-row sm:gap-[8px]">
                    {/* The label sits ABOVE the chips on a phone. Beside them it takes
                        ~52px of a ~291px row, and the chips need every pixel of what is
                        left: a fund name is 192px and its detail up to 252px, so the
                        label's own gutter was what pushed both into an ellipsis. */}
                    <span className="whitespace-nowrap text-[10px] font-bold leading-normal tracking-[0.08px] text-[#060606] sm:pt-[4px]">
                      Where
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-[4px]">
                      {a.funds!.map((f) => {
                        /**
                         * STACKED ON A PHONE, the design's one-line capsule from `sm`.
                         *
                         * The fund and its detail share ~239px there, and they need ~340:
                         * side by side both truncated, so the chip read "3200 — Ca…" beside
                         * "$306K down · $7.…" — which names neither the fund nor the figure.
                         * One above the other each gets the whole width and neither clips.
                         */
                        const chip = (
                          <span
                            className={cn(
                              "inline-flex max-w-full flex-col items-start gap-[2px] rounded-[14px] px-[8px] py-[5px] text-[10px] leading-normal tracking-[0.08px] text-[#060606] sm:flex-row sm:items-center sm:gap-[6px] sm:truncate sm:rounded-[20px]",
                              // The closing total carries no capsule — it sums the chips
                              // above rather than naming another fund to open.
                              f.role === "total" ? "opacity-70" : "bg-white",
                            )}
                          >
                            <span className="max-w-full font-bold">{f.label}</span>
                            <span className="max-w-full truncate">{f.detail}</span>
                          </span>
                        );
                        return f.href ? (
                          <Link key={f.id} href={f.href} className="max-w-full transition-opacity hover:opacity-75">
                            {chip}
                          </Link>
                        ) : (
                          <span key={f.id} className="max-w-full">
                            {chip}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ---- footer ---- */}
      <div className="mt-auto flex justify-center pt-[12px]">
        <PillLink href={href} arrow="#ee201c">
          View All {totalCount} Alerts
        </PillLink>
      </div>
    </OverviewPanel>
  );
}
