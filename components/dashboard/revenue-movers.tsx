import { cn } from "@/lib/cn";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { FundChip, PacePill } from "@/components/dashboard/revenue-shared";
import type { PaceStatus } from "@/lib/dashboard/pace";

/**
 * "Top Positive Variances" / "Top Negative Variances" — a transcription of Figma 46:3291
 * and 46:3304.
 *
 * Four fixed slots under the band's 16px/10px header, hairlines between them: the source
 * name at 13px over its outlined fund capsule, the bold amount with its percentage
 * underneath in the movement's ink, and the band's 12px pace pill at the right. A card
 * with fewer movers keeps its empty slots — the hairline grid is the design's, and a card
 * that collapsed would break the row it shares with the chart beside it.
 */

export interface MoverItem {
  id: string;
  name: string;
  /** The outlined capsule under the name — "1000 — General Fund". Omit on a fund-scoped page. */
  fund?: { label: string; href?: string };
  value: string;
  percent: string;
  tone: "positive" | "negative";
  status: PaceStatus;
}

const TONE_INK = { positive: "#1a932e", negative: "#fd4438" } as const;

export function RevenueMoversCard({
  title,
  subtitle,
  items,
  empty,
  fit,
}: {
  title: string;
  subtitle: string;
  items: MoverItem[];
  empty: string;
  /**
   * The 64:8848 revision sizes the POSITIVE card to its content (64:9410 stands 176px tall
   * beside the 539px category card) while the negative card keeps its four slots to match
   * the chart it shares a row with. `fit` renders only the rows there are and lets the card
   * stand at its own height inside a stretched grid row.
   */
  fit?: boolean;
}) {
  // The design's four slots, always — see the card comment. The `fit` card renders only
  // what it has (one slot minimum, so the empty message keeps its home).
  const slots: (MoverItem | null)[] = fit
    ? items.length > 0
      ? items
      : [null]
    : Array.from({ length: 4 }, (_, i) => items[i] ?? null);

  return (
    <OverviewPanel className={cn("flex flex-col p-[18px] pt-[17px]", fit && "self-start")}>
      <OverviewPanelHeader title={title} subtitle={subtitle} />

      <ul className={cn("mt-[10px] flex flex-col", !fit && "flex-1")}>
        {slots.map((item, i) => (
          <li
            key={item?.id ?? `empty-${i}`}
            className={cn(
              "flex items-center border-t border-[#ececec]",
              fit ? "min-h-[70px] py-[8px]" : "min-h-[83px] flex-1",
            )}
          >
            {item ? (
              <div className="flex w-full items-center gap-[10px]">
                <div className="flex min-w-0 flex-1 flex-col items-start gap-[4px]">
                  <span
                    className="line-clamp-2 text-[13px] leading-[1.3] tracking-[0.13px] text-[#060606]"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  {item.fund && <FundChip>{item.fund.label}</FundChip>}
                </div>
                <span
                  className="flex w-[88px] flex-none flex-col leading-[2]"
                  style={{ color: TONE_INK[item.tone] }}
                >
                  <span className="text-[13px] font-bold tracking-[0.13px]">{item.value}</span>
                  <span className="text-[10px] leading-[1.2]">{item.percent}</span>
                </span>
                <PacePill status={item.status} size="md" className="flex-none" />
              </div>
            ) : i === 0 ? (
              <span className="w-full text-center text-[12px] text-[#060606]">{empty}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </OverviewPanel>
  );
}
