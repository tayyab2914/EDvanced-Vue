import { CountUp } from "@/components/count-up";
import { Icon, type IconName } from "@/components/icons";
import { OverviewPanel, OverviewPanelHeader } from "@/components/dashboard/overview-panel";
import { PillLink } from "@/components/dashboard/revenue-shared";

/**
 * "Monthly cash summary" — a transcription of Figma 55:5407: the month's walk as five
 * 105×135 bordered mini-cards — beginning, receipts, disbursements, net, ending — each
 * with its 34px tinted icon disc, 12px label, the figure in its own ink and the tiny
 * comparison note, with the centred "View … Details" capsule at the card's floor.
 *
 * THE INKS ARE THE DESIGN'S OWN, one per step: beginning #066DFF, receipts #8E62EF,
 * disbursements #E65F2B, net #1A932E, ending #04877C — the walk reads left to right as
 * blue → purple → orange → green → teal, which is what lets a reader see the month's
 * shape without reading a single figure. The net step alone changes ink with its sign:
 * a month that burned cash letters its net red, because that is the one figure here with
 * a direction.
 *
 * The mockup's 8px notes are kept at 8px — inside a 105px card a 10px note wraps under
 * the figure it annotates.
 */

export interface CashSummaryStep {
  label: string;
  value: string;
  /** The figure's ink — the design's per-step colour, or the sign-aware net ink. */
  ink: string;
  /** The disc's 18% wash. */
  discBg: string;
  /** The glyph inside the disc — an icon name, or "=" for the net step. */
  icon: IconName | "=";
  /** The glyph's ink. */
  iconInk: string;
  /** "vs period 1" / "−5.96% vs prior period" — the 8px line under the figure. */
  note?: string;
}

export function CashMonthlySummaryCard({
  title = "Monthly cash summary",
  subtitle,
  steps,
  ctaLabel,
  ctaHref,
}: {
  title?: string;
  subtitle: string;
  steps: CashSummaryStep[];
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <OverviewPanel className="flex flex-col p-[18px]">
      <OverviewPanelHeader title={title} subtitle={subtitle} />

      <div className="mt-[14px] flex flex-wrap justify-center gap-[15px]">
        {steps.map((s) => (
          <div
            key={s.label}
            className="flex h-[135px] w-[105px] flex-none flex-col rounded-[11px] border-[0.4px] border-[#c4c4c4] px-[6px] pb-[8px] pt-[14px]"
          >
            <span
              aria-hidden
              className="ml-[-2px] flex size-[34px] flex-none items-center justify-center rounded-full"
              style={{ background: s.discBg, color: s.iconInk }}
            >
              {s.icon === "=" ? (
                <span className="text-[20px] font-bold leading-none">=</span>
              ) : (
                <Icon name={s.icon} size={16} />
              )}
            </span>
            <span className="mt-auto text-[12px] leading-[1.09] tracking-[0.12px] text-black">
              {s.label}
            </span>
            <span
              className="mt-[6px] whitespace-nowrap text-[18px] leading-[1.09] tracking-[0.18px] [font-variant-numeric:proportional-nums]"
              style={{ color: s.ink }}
            >
              <CountUp value={s.value} />
            </span>
            {/* a fixed slot, so the five figures sit on one line whether or not a card
                has something to compare against */}
            <span className="mt-[5px] h-[9px] text-[8px] leading-[1.09] tracking-[0.08px] text-black/[0.56]">
              {s.note}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex justify-center pt-[16px]">
        <PillLink href={ctaHref}>{ctaLabel}</PillLink>
      </div>
    </OverviewPanel>
  );
}
