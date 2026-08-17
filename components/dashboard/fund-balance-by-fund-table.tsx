import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { PacePill } from "@/components/dashboard/revenue-shared";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * "Fund balance by fund" — a transcription of Figma 55:3755, the Fund Balance band's
 * full-width ledger and the same construction as the Expenditure breakdown table: the 16px
 * header with its "Basis: Actual" capsule at the right, 14px regular column headers over a
 * solid rule, bold fund names, dashed rules between rows, the band's tinted status pill
 * hard right, and the TOTAL row outside everything under its own solid rule.
 *
 * The mockup letters every figure "$113.5M" and every status "Critical" — sample data.
 * The rows here carry the district's own figures on whichever basis the capsule has
 * chosen, and the deficit tint survives from the old table: a fund below zero letters its
 * ending balance red, because that is the one figure on this card a board must not skim.
 */

export interface FundBalanceFundRow {
  id: string;
  /** Already through codeName/DimLabel, so it honours Codes / Names. */
  fund: ReactNode;
  beginning: string;
  revenues: string;
  expenditures: string;
  ending: string;
  endingNegative?: boolean;
  classification: ReactNode;
  status: { label: string; rung: StatusRung };
}

/** The design's column grid — the fund's 228px, four figures, the classification, the pill. */
const COLS =
  "grid grid-cols-[minmax(170px,1.5fr)_minmax(96px,1fr)_minmax(96px,1fr)_minmax(104px,1fr)_minmax(110px,1fr)_minmax(104px,0.9fr)_minmax(56px,auto)] items-center gap-x-[12px]";

export function FundBalanceByFundTable({
  title = "Fund balance by fund",
  subtitle,
  basisLabel,
  control,
  rows,
  total,
  empty,
  footer,
}: {
  title?: string;
  subtitle: string;
  /** "Actual" / "Budgeted" — names the three columns the capsule swaps. */
  basisLabel: string;
  /** The "Basis: …" capsule — a PillSelect, passed in so this card can stay on the server. */
  control?: ReactNode;
  rows: FundBalanceFundRow[];
  total: { beginning: string; revenues: string; expenditures: string; ending: string };
  empty: string;
  /** The corrections note under the table — permission-gated by the page. */
  footer?: ReactNode;
}) {
  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-[10px]">
        <OverviewPanelHeader title={title} subtitle={subtitle} />
        {control}
      </div>

      {rows.length === 0 ? (
        <p className="flex items-center justify-center py-[36px] text-[12px] text-[#060606]">
          {empty}
        </p>
      ) : (
        <div className="-mx-[18px] overflow-x-auto px-[18px]">
          <div className="min-w-[880px]">
            {/* ---- column headers ---- */}
            <div
              className={cn(
                COLS,
                "mt-[14px] pb-[10px] text-[14px] font-bold leading-[1.15] tracking-[0.14px] text-[#060606]",
              )}
            >
              <span>Fund</span>
              <span>
                Beginning
                <br />
                fund balance
              </span>
              <span>Revenues ({basisLabel})</span>
              <span>Expenditures ({basisLabel})</span>
              <span>
                Ending fund
                <br />
                balance ({basisLabel})
              </span>
              <span>
                Primary
                <br />
                classification
              </span>
              <span className="text-right">Status</span>
            </div>
            <div aria-hidden className="h-px w-full bg-[#060606]/20" />

            {/* ---- body ---- */}
            <ul>
              {rows.map((r, i) => (
                <li
                  key={r.id}
                  className={cn(
                    COLS,
                    "py-[11px]",
                    i > 0 && "border-t border-dashed border-[#e7e7e7]",
                  )}
                >
                  <span className="text-[14px] font-bold leading-[1.35] text-[#060606]">
                    {r.fund}
                  </span>
                  <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
                    {r.beginning}
                  </span>
                  <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
                    {r.revenues}
                  </span>
                  <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
                    {r.expenditures}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap text-[14px] leading-normal",
                      r.endingNegative ? "font-bold text-[#fd4438]" : "text-[#060606]",
                    )}
                  >
                    {r.ending}
                  </span>
                  <span className="text-[12px] leading-[1.3] text-[#060606]">
                    {r.classification}
                  </span>
                  <span className="flex justify-end">
                    <PacePill status={r.status} />
                  </span>
                </li>
              ))}
            </ul>

            {/* ---- total — under its own solid rule, as drawn ---- */}
            <div aria-hidden className="h-px w-full bg-[#060606]/20" />
            <div className={cn(COLS, "pb-[4px] pt-[16px] text-[14px] font-bold leading-normal text-[#060606]")}>
              <span>TOTAL</span>
              <span className="whitespace-nowrap">{total.beginning}</span>
              <span className="whitespace-nowrap">{total.revenues}</span>
              <span className="whitespace-nowrap">{total.expenditures}</span>
              <span className="whitespace-nowrap">{total.ending}</span>
              <span>—</span>
              <span className="text-right">—</span>
            </div>
          </div>
        </div>
      )}

      {footer}
    </OverviewPanel>
  );
}
