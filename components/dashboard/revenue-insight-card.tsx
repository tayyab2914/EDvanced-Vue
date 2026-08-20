import Link from "next/link";
import { cn } from "@/lib/cn";
import { CARD_TITLE, CARD_BODY } from "@/components/dashboard/type-scale";
import { OverviewPanel, ArrowGlyph } from "@/components/dashboard/overview-panel";

/**
 * "Key Insight" — the 64:9404 revision of the page's closing statement (previously the
 * 30px 46:3284 banner): a slim 95px strip with a 14px bold title over the sentence at
 * 12px in the design's 50% black, and the violet "View Financial Policies" capsule
 * sitting at the strip's bottom right. The copy is the caller's — see the note above the
 * `keyInsight` sentence in app/(district)/revenues/page.tsx.
 */
export function RevenueInsightCard({
  title = "Key Insight",
  ctaLabel = "View Financial Policies",
  ctaHref,
  children,
}: {
  title?: string;
  ctaLabel?: string;
  ctaHref?: string;
  children: React.ReactNode;
}) {
  return (
    <OverviewPanel className="px-[57px] pb-[11px] pt-[9px]">
      <h2 className={CARD_TITLE}>{title}</h2>
      <p className={cn("mt-[2px]", CARD_BODY)}>{children}</p>
      {ctaHref && (
        <div className="mt-[6px] flex justify-end">
          <Link
            href={ctaHref}
            className="flex h-[20px] w-fit flex-none items-center gap-[3px] rounded-[22px] border-[0.4px] border-[#eaeaea] bg-[#8e62ef] pl-[4px] pr-[11px] transition-opacity hover:opacity-85"
          >
            <span className="flex size-[16px] flex-none items-center justify-center">
              <ArrowGlyph color="#ffffff" />
            </span>
            <span className="whitespace-nowrap text-[10px] leading-[12px] tracking-[0.2px] text-white">
              {ctaLabel}
            </span>
          </Link>
        </div>
      )}
    </OverviewPanel>
  );
}
