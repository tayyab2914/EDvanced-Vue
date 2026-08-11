import Link from "next/link";
import { OverviewPanel, ArrowGlyph } from "@/components/dashboard/overview-panel";

/**
 * "Key insight" — a transcription of Figma 46:3284.
 *
 * The page's closing statement, promoted from the old FooterInfoBar: a 30px bold title with
 * the violet "View Financial Policies" capsule beside it, and the sentence itself at 30px
 * in the design's 50% black with its generous 43px leading. The copy is the caller's —
 * the same sentence the info bar carried, so nothing the page used to say is lost.
 */
export function RevenueInsightCard({
  title = "Key insight",
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
    <OverviewPanel className="px-[41px] py-[31px]">
      <div className="flex flex-wrap items-center gap-[20px]">
        <h2 className="text-[30px] font-bold leading-[22px] tracking-[-0.43px] text-black/[0.85]">
          {title}
        </h2>
        {ctaHref && (
          <Link
            href={ctaHref}
            className="flex h-[28px] w-fit flex-none items-center gap-[3px] rounded-[22px] border-[0.4px] border-[#eaeaea] bg-[#8e62ef] pl-[4px] pr-[11px] transition-opacity hover:opacity-85"
          >
            <span className="flex size-[16px] flex-none items-center justify-center">
              <ArrowGlyph color="#ffffff" />
            </span>
            <span className="whitespace-nowrap text-[10px] leading-[12px] tracking-[0.2px] text-white">
              {ctaLabel}
            </span>
          </Link>
        )}
      </div>
      <p className="mt-[19px] text-[30px] leading-[43px] tracking-[-0.23px] text-black/50">
        {children}
      </p>
    </OverviewPanel>
  );
}
