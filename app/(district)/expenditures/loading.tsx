import {
  SkeletonHeader,
  SkeletonOverview,
  SkeletonCard,
} from "@/components/dashboard/skeleton";

/**
 * The Expenditures dashboard's skeleton — Overview tiles and status strip, then the
 * 1.76fr/1fr grid: by-function table + positive movers, budget vs actual + negative
 * movers, utilization + alerts, and the key-insight strip. See
 * components/dashboard/skeleton.tsx for the surface rules.
 */
export default function ExpendituresLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-[18px]">
      <span className="sr-only">Loading…</span>

      <SkeletonHeader />
      <SkeletonOverview />

      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] xl:grid-cols-[minmax(0,1.76fr)_minmax(0,1fr)]">
        <SkeletonCard className="h-[440px]" />
        <SkeletonCard className="h-[440px]" />

        <SkeletonCard className="h-[416px]" />
        <SkeletonCard className="h-[416px]" />

        <SkeletonCard className="h-[380px]" />
        <SkeletonCard className="h-[380px]" />

        <SkeletonCard className="h-[95px]" />
      </div>
    </div>
  );
}
