import {
  SkeletonHeader,
  SkeletonOverview,
  SkeletonCard,
} from "@/components/dashboard/skeleton";

/**
 * The skeleton every district route shows while its server render is in flight.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS ACTUALLY FOR
 *
 * Without a loading boundary anywhere under `app/`, a soft navigation keeps the CURRENT
 * page on screen until the destination has finished rendering — data and all. A sidebar
 * click therefore produced no visual feedback whatsoever for the whole of that render,
 * and a click that changes nothing reads as a click that did not register. Several people
 * clicked twice.
 *
 * This does not make anything faster. It is the other half of the complaint: the delay is
 * the query count (see lib/request-cache.ts for that half), and this is the part that
 * makes the app answer immediately whatever the delay turns out to be.
 *
 * It sits on the ROUTE GROUP as the fallback for every district route; the five dashboards
 * carry their own loading.tsx beside their page (the nearest boundary wins), each drawn at
 * that page's real card grid. This one keeps the shared anatomy — header, the Overview
 * band, a card grid — for the routes without a tailored sketch, so the content still lands
 * roughly where it was sketched in.
 *
 * The surfaces are the live cards' own 62% white on the tinted canvas, not solid white —
 * see components/dashboard/skeleton.tsx, which owns the vocabulary all six files share.
 *
 * The `(district)` layout does its own database work (the session, the fiscal-year chip,
 * the pending-request count), and Next.js cannot show this until that layout resolves. On
 * a soft navigation between sidebar links the layout is preserved and never re-runs, which
 * is exactly the case this is for. On a cold entry to the app it appears a beat later.
 * ---------------------------------------------------------------------------
 */
export default function DistrictLoading() {
  return (
    // `aria-busy` and the status role are what a screen reader gets instead of the visual
    // pulse — otherwise this is a silent gap between the old page and the new one.
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-[18px]">
      <span className="sr-only">Loading…</span>

      <SkeletonHeader />
      <SkeletonOverview strip={null} />

      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] lg:grid-cols-2">
        <SkeletonCard className="h-[320px]" />
        <SkeletonCard className="h-[320px]" />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-x-[10px] gap-y-[12px] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SkeletonCard className="h-[360px]" />
        <SkeletonCard className="h-[360px]" />
      </div>
    </div>
  );
}
