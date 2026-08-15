import {
  SkeletonHeader,
  SkeletonOverview,
  SkeletonCard,
} from "@/components/dashboard/skeleton";

/**
 * The Executive dashboard's skeleton — the page's real bands at their real ratios: the
 * Overview tiles and split strip, the three-widget row, the revenue chart with the alerts
 * rail beside it and the expenditures chart below, the half-width trend and cash pair,
 * then the health summary. See components/dashboard/skeleton.tsx for the surface rules.
 */
export default function ExecutiveLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-[18px]">
      <span className="sr-only">Loading…</span>

      <SkeletonHeader />
      <SkeletonOverview />

      {/* the Revenue Collected / Budget Status / Key Insights widget band */}
      <div className="grid grid-cols-1 items-stretch gap-[10px] lg:grid-cols-2 xl:grid-cols-[1.4652fr_1.4652fr_1fr]">
        <SkeletonCard className="h-[349px]" />
        <SkeletonCard className="h-[349px]" />
        <SkeletonCard className="h-[349px]" />
      </div>

      {/* the budget comparisons with the alerts rail beside the first */}
      <div className="grid grid-cols-1 items-stretch gap-2.5 xl:grid-cols-[minmax(0,2.974fr)_minmax(0,1fr)]">
        <SkeletonCard className="h-[349px]" />
        <SkeletonCard className="h-[349px]" />
        <SkeletonCard className="h-[449px]" />
      </div>

      {/* fund balance trend beside cash position */}
      <div className="grid grid-cols-1 items-stretch gap-[14px] xl:grid-cols-2">
        <SkeletonCard className="h-[386px]" />
        <SkeletonCard className="h-[386px]" />
      </div>

      {/* financial health summary */}
      <SkeletonCard className="h-[414px]" />
    </div>
  );
}
