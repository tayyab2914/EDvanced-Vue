import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { PacePill } from "@/components/dashboard/revenue-shared";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * "Cash balance by fund" — a transcription of Figma 55:5221, the Cash band's ledger, and
 * the same construction as the Fund Balance band's by-fund table: 16px header with the
 * "View … Details" capsule beside it, 14px column headers over a solid rule, bold fund
 * names, dashed rules between rows, the tinted status pill hard right, and the TOTAL row
 * under its own solid rule.
 *
 * The columns are the cash file's own walk — beginning, receipts, disbursements, ending —
 * plus the days-cash estimate and its rung. The mockup letters the movement columns "YTD";
 * they are labelled (MTD) here because the cash import carries a MONTH's movement and no
 * cumulative column, and a header that claims otherwise would be the table lying about its
 * own grain. The mockup's every cell reads "$120M" / "11.73%" — sample data; these rows
 * carry the district's own figures.
 *
 * A fund below zero letters its ending cash red — the one figure on this card a board must
 * not skim past.
 */

export interface CashFundRow {
  id: string;
  /** Already through DimLabel, so it honours Codes / Names. */
  fund: ReactNode;
  beginning: string;
  receipts: string;
  disbursements: string;
  ending: string;
  endingNegative?: boolean;
  /** "78 days" — or "—" when the fund has no budget to divide by. */
  days: string;
  status: { label: string; rung: StatusRung };
}

/** The design's column grid — the fund wide, four figures, days, the pill. */
const COLS =
  "grid grid-cols-[minmax(168px,1.5fr)_minmax(96px,1fr)_minmax(96px,1fr)_minmax(110px,1fr)_minmax(96px,1fr)_minmax(84px,0.9fr)_minmax(56px,auto)] items-center gap-x-[12px]";

export function CashByFundTable({
  title = "Cash balance by fund",
  subtitle,
  ctaLabel,
  ctaHref,
  rows,
  total,
  empty,
  footer,
}: {
  title?: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  rows: CashFundRow[];
  total: {
    beginning: string;
    receipts: string;
    disbursements: string;
    ending: string;
    days: string;
  };
  empty: string;
  /** The methodology note under the table. */
  footer?: ReactNode;
}) {
  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <OverviewPanelHeader title={title} subtitle={subtitle} ctaLabel={ctaLabel} ctaHref={ctaHref} />

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-[36px] text-[12px] text-[#797979]">
          {empty}
        </p>
      ) : (
        <div className="-mx-[18px] overflow-x-auto px-[18px]">
          <div className="min-w-[840px]">
            {/* ---- column headers ---- */}
            <div
              className={cn(
                COLS,
                "mt-[14px] pb-[10px] text-[14px] leading-[1.15] tracking-[0.14px] text-[#060606]",
              )}
            >
              <span>Fund</span>
              <span>
                Beginning
                <br />
                cash
              </span>
              <span>
                Receipts
                <br />
                (MTD)
              </span>
              <span>
                Disbursements
                <br />
                (MTD)
              </span>
              <span>
                Ending
                <br />
                cash
              </span>
              <span>
                Days cash
                <br />
                on hand
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
                    {r.receipts}
                  </span>
                  <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
                    {r.disbursements}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap text-[14px] leading-normal",
                      r.endingNegative ? "font-bold text-[#fd4438]" : "text-[#060606]",
                    )}
                  >
                    {r.ending}
                  </span>
                  <span className="whitespace-nowrap text-[14px] leading-normal text-[#060606]">
                    {r.days}
                  </span>
                  <span className="flex justify-end">
                    <PacePill status={r.status} />
                  </span>
                </li>
              ))}
            </ul>

            {/* ---- total — under its own solid rule, as drawn ---- */}
            <div aria-hidden className="h-px w-full bg-[#060606]/20" />
            <div
              className={cn(
                COLS,
                "pb-[4px] pt-[16px] text-[14px] font-bold leading-normal text-[#060606]",
              )}
            >
              <span>TOTAL</span>
              <span className="whitespace-nowrap">{total.beginning}</span>
              <span className="whitespace-nowrap">{total.receipts}</span>
              <span className="whitespace-nowrap">{total.disbursements}</span>
              <span className="whitespace-nowrap">{total.ending}</span>
              <span className="whitespace-nowrap">{total.days}</span>
              <span className="text-right">—</span>
            </div>
          </div>
        </div>
      )}

      {footer}
    </OverviewPanel>
  );
}
