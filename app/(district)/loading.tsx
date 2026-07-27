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
 * It sits on the ROUTE GROUP rather than on each of the seven pages because the segment a
 * soft navigation re-renders is the page, and the group is the nearest boundary above all
 * of them. One file covers every district route, including the ones added later.
 *
 * The shape deliberately matches the real dashboards — a header, a KPI row, then cards —
 * rather than a spinner. Matching the layout means the content lands in the same places it
 * was already sketched into, instead of the page jumping when it arrives.
 *
 * The `(district)` layout does its own database work (the session, the fiscal-year chip,
 * the pending-request count), and Next.js cannot show this until that layout resolves. On
 * a soft navigation between sidebar links the layout is preserved and never re-runs, which
 * is exactly the case this is for. On a cold entry to the app it appears a beat later.
 * ---------------------------------------------------------------------------
 */

/** A neutral block. `animate-pulse` is Tailwind's own; nothing custom is needed. */
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-line-soft ${className}`} />;
}

function Card({ height = "h-[280px]" }: { height?: string }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,32,56,0.03)]">
      <header className="mb-3.5">
        <Bar className="h-[11px] w-40" />
        <Bar className="mt-2 h-[10px] w-56" />
      </header>
      <Bar className={`w-full ${height}`} />
    </section>
  );
}

function Tile() {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,32,56,0.03)]">
      <div className="flex items-center gap-2">
        <Bar className="h-[26px] w-[26px] rounded-lg" />
        <Bar className="h-[9px] w-20" />
      </div>
      <Bar className="mt-3.5 h-[26px] w-28" />
      <Bar className="mt-2.5 h-[10px] w-32" />
    </div>
  );
}

export default function DistrictLoading() {
  return (
    // `aria-busy` and the status role are what a screen reader gets instead of the visual
    // pulse — otherwise this is a silent gap between the old page and the new one.
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-[18px]">
      <span className="sr-only">Loading…</span>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Bar className="h-[19px] w-64" />
          <Bar className="mt-2.5 h-[12px] w-80" />
        </div>
        <Bar className="h-[30px] w-52 rounded-lg" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Tile key={i} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card />
        <Card />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card height="h-[320px]" />
        <Card height="h-[320px]" />
      </div>
    </div>
  );
}
