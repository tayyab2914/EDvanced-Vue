import {
  SkeletonHeader,
  SkeletonOverview,
  SkeletonCard,
} from "@/components/dashboard/skeleton";

/**
 * The Revenue dashboard's skeleton — the 64:8848 canvas: Overview tiles and status strip,
 * the full-width by-source table, then the 1.76fr/1fr card grid (category + positive
 * movers, trend + negative movers, variance + alerts) and the slim key-insight strip.
 * See components/dashboard/skeleton.tsx for the surface rules.
 */
export default function RevenueLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-[18px]">
      <span className="sr-only">Loading…</span>

      <SkeletonHeader />
      <SkeletonOverview />

      <div className="grid grid-cols-1 items-stretch gap-x-[17px] gap-y-[20px] xl:grid-cols-[minmax(0,1.76fr)_minmax(0,1fr)]">
        {/* the by-source table, full width */}
        <SkeletonCard className="h-[500px] xl:col-span-2" />

        {/* category share beside the positive movers (content-sized) */}
        <SkeletonCard className="h-[500px]" />
        <SkeletonCard className="h-[200px] self-start" />

        {/* budget vs actual beside the negative movers */}
        <SkeletonCard className="h-[416px]" />
        <SkeletonCard className="h-[416px]" />

        {/* variance trend beside the alerts */}
        <SkeletonCard className="h-[416px]" />
        <SkeletonCard className="h-[416px]" />

        {/* the key insight strip, alone in the left column */}
        <SkeletonCard className="h-[95px]" />
      </div>
    </div>
  );
}
