import {
  SkeletonHeader,
  SkeletonOverview,
  SkeletonCard,
} from "@/components/dashboard/skeleton";

/**
 * The Cash Position dashboard's skeleton — Overview tiles and split strip, then the
 * 2.45fr/1fr grid: by-fund ledger + health dial, trend + composition, monthly walk +
 * alerts. See components/dashboard/skeleton.tsx for the surface rules.
 */
export default function CashLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-[18px]">
      <span className="sr-only">Loading…</span>

      <SkeletonHeader />
      <SkeletonOverview />

      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] xl:grid-cols-[minmax(0,2.45fr)_minmax(0,1fr)]">
        <SkeletonCard className="h-[420px]" />
        <SkeletonCard className="h-[420px]" />

        <SkeletonCard className="h-[400px]" />
        <SkeletonCard className="h-[400px]" />

        <SkeletonCard className="h-[360px]" />
        <SkeletonCard className="h-[360px]" />
      </div>
    </div>
  );
}
