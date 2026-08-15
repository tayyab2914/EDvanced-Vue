import {
  SkeletonHeader,
  SkeletonOverview,
  SkeletonCard,
  SkeletonBar,
} from "@/components/dashboard/skeleton";

/**
 * The Fund Balance skeleton — shared by all four tabs, since this boundary sits above
 * them: the page header, the centred tab row, then the Current Position anatomy (tiles,
 * the single-pane reserve strip, the 1.76fr/1fr card grid). The other tabs land close
 * enough to the same sketch that one skeleton serves. See
 * components/dashboard/skeleton.tsx for the surface rules.
 */
export default function FundBalanceLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-[18px]">
      <span className="sr-only">Loading…</span>

      <SkeletonHeader />

      {/* the Current Position / Forecasting / Policies / Alerts tab row */}
      <div className="flex flex-wrap justify-center gap-[8px]">
        <SkeletonBar className="h-[36px] w-[132px] rounded-full" />
        <SkeletonBar className="h-[36px] w-[168px] rounded-full" />
        <SkeletonBar className="h-[36px] w-[92px] rounded-full" />
        <SkeletonBar className="h-[36px] w-[88px] rounded-full" />
      </div>

      <SkeletonOverview strip="w-[335px]" panes={1} />

      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] xl:grid-cols-[minmax(0,1.76fr)_minmax(0,1fr)]">
        <SkeletonCard className="h-[440px]" />
        <SkeletonCard className="h-[440px]" />

        <SkeletonCard className="h-[400px]" />
        <SkeletonCard className="h-[400px]" />
      </div>

      <SkeletonCard className="h-[300px]" />
    </div>
  );
}
