import { cn } from "@/lib/cn";

/**
 * The loading-skeleton vocabulary shared by every district dashboard's loading.tsx.
 *
 * Surfaces wear the live cards' own 62% white (#FFFFFF9E, the tiles' exact fill) rather
 * than solid white, and the pulsing bars a 7% black — so the sketch reads as the page it
 * becomes instead of a stack of stark white boxes on the tinted canvas. The shapes follow
 * the redesigned dashboards' shared anatomy: page header with its pill actions, the
 * Overview band (four tiles and the centred status strip), then each page's own card grid
 * — the per-route loading.tsx files compose these at their page's real column ratios so
 * the content lands in the places it was sketched into.
 */

/** A pulsing placeholder bar. */
export function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[6px] bg-black/[0.07]", className)} />;
}

/** The cards' surface — the tiles' 62% white on a 14px radius, no border. */
export function SkeletonSurface({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 rounded-[14px] bg-[#FFFFFF9E] p-[18px]", className)}>
      {children}
    </div>
  );
}

/** The page header: title and subtitle left, the Views / Filters / Export pills right. */
export function SkeletonHeader() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <SkeletonBar className="h-[26px] w-64" />
        <SkeletonBar className="mt-2 h-[12px] w-72" />
      </div>
      <div className="flex items-center gap-[10px]">
        <SkeletonBar className="h-[34px] w-[92px] rounded-full" />
        <SkeletonBar className="h-[34px] w-[92px] rounded-full" />
        <SkeletonBar className="h-[34px] w-[96px] rounded-full" />
      </div>
    </div>
  );
}

/** One Overview KPI tile — icon disc beside its label, figure, footer lines. */
function SkeletonTile() {
  return (
    <SkeletonSurface className="flex min-h-[176px] flex-col pb-[10px]">
      <div className="flex items-center gap-[12px]">
        <SkeletonBar className="size-[46px] rounded-full" />
        <SkeletonBar className="h-[12px] w-24" />
      </div>
      <SkeletonBar className="mt-[14px] h-[28px] w-28" />
      <div className="mt-auto flex flex-col gap-[8px] pt-[8px]">
        <SkeletonBar className="h-[10px] w-36" />
        <SkeletonBar className="h-[10px] w-24" />
      </div>
    </SkeletonSurface>
  );
}

/** The centred status strip under the tiles — one or two panes on the 24px-radius card. */
export function SkeletonStrip({
  widthClass = "w-[676px]",
  panes = 2,
}: {
  widthClass?: string;
  panes?: 1 | 2;
}) {
  const pane = (
    <div className="flex min-w-0 flex-1 flex-col gap-[8px] p-[16px]">
      <SkeletonBar className="h-[12px] w-28" />
      <SkeletonBar className="h-[28px] w-32" />
      <SkeletonBar className="h-[10px] w-40" />
    </div>
  );
  return (
    <div
      className={cn(
        "mx-auto flex max-w-full flex-col items-stretch rounded-[24px] bg-[#FFFFFF9E] px-[8px] py-[4px] sm:flex-row",
        widthClass,
      )}
    >
      {pane}
      {panes === 2 && (
        <>
          <div
            aria-hidden
            className="h-px w-full flex-none self-stretch bg-black/[0.06] sm:h-[40px] sm:w-px sm:self-center"
          />
          {pane}
        </>
      )}
    </div>
  );
}

/** The Overview band: heading and period pill, the four tiles, then the status strip. */
export function SkeletonOverview({
  strip = "w-[676px]",
  panes = 2,
}: {
  /** The strip's width class, or null for a band without one. */
  strip?: string | null;
  panes?: 1 | 2;
}) {
  return (
    <section className="flex flex-col gap-[20px]">
      <div className="flex items-center justify-between gap-3">
        <SkeletonBar className="h-[22px] w-28" />
        <SkeletonBar className="h-[34px] w-52 rounded-full" />
      </div>
      <div className="flex flex-col gap-[16px]">
        <div className="grid grid-cols-1 items-stretch gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </div>
        {strip && <SkeletonStrip widthClass={strip} panes={panes} />}
      </div>
    </section>
  );
}

/** A content card: header lines over a body block that fills whatever height it is given. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <SkeletonSurface className={cn("flex flex-col", className)}>
      <SkeletonBar className="h-[14px] w-40" />
      <SkeletonBar className="mt-2 h-[10px] w-56" />
      <SkeletonBar className="mt-4 min-h-[80px] w-full flex-1 rounded-[10px]" />
    </SkeletonSurface>
  );
}
