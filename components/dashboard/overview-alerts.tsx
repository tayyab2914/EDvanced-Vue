import Link from "next/link";
import { cn } from "@/lib/cn";
import type { AlertRow, DisplaySeverity } from "@/components/dashboard/alert-list";

/**
 * The Alerts Summary rail — a transcription of Figma node 3:11737, the tall right-hand
 * panel of the executive redesign's middle band.
 *
 * The design keeps two of its pieces OUTSIDE the frame they visually belong to, the same
 * way the Overview band's gauge floats over its card (see overview-widgets.tsx): the red
 * warning triangle beside each alert is a page-level instance (3:12423–3:12427) sitting
 * 12px into the panel, and is reunited here. Every colour is the export's: #FD4438 for the
 * triangle and the arrows, rgba(238,32,28,0.18)/#EE201C for the count chip and the
 * "Action Required" pill, black at 42% for the alert's caption, black at 11% for the
 * hairlines, and the odd-but-faithful red "Information" tally.
 *
 * The mockup only ever draws CRITICAL alerts, so the WARNING and INFORMATIONAL rows take
 * the same anatomy in the product's other two severity colours — a design that colour-coded
 * only its worst case cannot mean every row to be red.
 *
 * Font: the mockup sets "Aeonik Pro TRIAL" (a trial licence — see overview-kpi.tsx);
 * nothing here names a family.
 */

const SEVERITY: Record<
  DisplaySeverity,
  { chip: string; ink: string; label: string }
> = {
  CRITICAL: { chip: "bg-[rgba(238,32,28,0.18)] text-[#ee201c]", ink: "#FD4438", label: "Action Required" },
  WARNING: { chip: "bg-[rgba(230,95,43,0.18)] text-[#e65f2b]", ink: "#E65F2B", label: "Review" },
  INFORMATIONAL: { chip: "bg-black/[0.08] text-black/[0.56]", ink: "#797979", label: "Informational" },
};

/** The design's alert-triangle instance — 24px, a 12% fill under a 2px round stroke. */
function AlertTriangleGlyph({ color }: { color: string }) {
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" className="flex-none">
      <g transform="translate(2.112 2.513)">
        <path
          opacity="0.12"
          d="M17.7874 18.9757L2.00262 18.976C0.516295 18.976 -0.450753 17.4123 0.213253 16.0825L7.69143 1.10652C8.41043 -0.333356 10.4491 -0.377505 11.2297 1.0299L19.5363 16.0056C20.2757 17.3386 19.3118 18.9757 17.7874 18.9757Z"
          fill={color}
        />
      </g>
      <g transform="translate(1.112 1.513)">
        <path
          d="M10.4633 7.80919V12.8092M10.4633 15.8092H10.4733M3.00391 19.976L18.7887 19.9757C20.3131 19.9757 21.277 18.3386 20.5376 17.0056L12.231 2.02991C11.4504 0.622501 9.41172 0.666649 8.69272 2.10653L1.21454 17.0825C0.550535 18.4123 1.51758 19.976 3.00391 19.976Z"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** The vuesax arrow-right — 12.33×9.09, verbatim from the export. */
function ArrowGlyph({ color, className }: { color: string; className?: string }) {
  return (
    <svg
      aria-hidden
      width="12.333"
      height="9.093"
      viewBox="0 0 12.3333 9.09334"
      fill="none"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.43311 0.146453C7.62838 -0.0488088 7.94496 -0.0488088 8.14022 0.146453L12.1869 4.19312C12.2807 4.28689 12.3333 4.41407 12.3333 4.54667C12.3333 4.67928 12.2807 4.80646 12.1869 4.90023L8.14022 8.94689C7.94496 9.14216 7.62838 9.14216 7.43311 8.94689C7.23785 8.75163 7.23785 8.43505 7.43311 8.23979L11.1262 4.54667L7.43311 0.85356C7.23785 0.658298 7.23785 0.341715 7.43311 0.146453Z"
        fill={color}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 4.54667C0 4.27053 0.223858 4.04667 0.5 4.04667H11.72C11.9961 4.04667 12.22 4.27053 12.22 4.54667C12.22 4.82282 11.9961 5.04667 11.72 5.04667H0.5C0.223858 5.04667 0 4.82282 0 4.54667Z"
        fill={color}
      />
    </svg>
  );
}

/** The footer's CRITICAL triangle — the 74px glyph with its count set inside it. */
function CriticalTally({ count }: { count: number }) {
  return (
    <div className="relative size-[74px]">
      <svg aria-hidden width="74" height="74" viewBox="0 0 74 74" fill="none" className="absolute inset-0">
        <g transform="translate(6.512 7.748)">
          <path
            opacity="0.12"
            d="M54.8446 58.5084L6.17474 58.5093C1.59191 58.5094 -1.38982 53.6878 0.657531 49.5878L23.7153 3.41178C25.9322 -1.02785 32.218 -1.16397 34.625 3.17553L60.2371 49.3505C62.5169 53.4607 59.5447 58.5083 54.8446 58.5084Z"
            fill="#FD4438"
          />
        </g>
      </svg>
      <p className="absolute inset-x-0 top-[23px] text-center text-[20px] font-bold leading-[23px] tracking-[0.2px] text-[#fd4438]">
        {count}!
      </p>
      <p className="absolute inset-x-0 top-[49px] text-center text-[8px] font-bold leading-[9px] tracking-[0.08px] text-[#fd4438]">
        CRITICAL
      </p>
    </div>
  );
}

export function OverviewAlertsPanel({
  alerts,
  critical,
  warning,
  informational,
  href,
  max = 5,
}: {
  alerts: AlertRow[];
  critical: number;
  warning: number;
  informational: number;
  href: string;
  max?: number;
}) {
  // The design's two numbers are not the same number: the header chip counts what needs a
  // person (4 critical + 2 warnings = "6"), the way out counts everything ("View All 8").
  const actionable = critical + warning;
  const total = critical + warning + informational;
  const shown = alerts.slice(0, max);

  return (
    <section
      data-reveal
      className="relative flex h-full min-w-0 flex-col overflow-clip rounded-[14px] bg-white/[0.62]"
    >
      {/* ---- header ---- */}
      <header className="flex items-center gap-[10px] pl-[43px] pr-[10px] pt-[22px]">
        <h2 className="text-[16px] font-normal leading-[18px] tracking-[0.16px] text-[#060606]">
          Alerts Summary
        </h2>
        <span className="rounded-[20px] bg-[rgba(238,32,28,0.18)] px-[8px] py-[5px] text-[8px] leading-[9px] tracking-[0.08px] text-[#ee201c]">
          {actionable}
        </span>
      </header>

      {/*
        ---- the alerts themselves ----

        The list is ABSOLUTE inside a flex-1 box, so however many alerts there are, the rail
        cannot grow: its height is whatever the two budget cards beside it come to, and the
        list scrolls inside that. The same call KeyInsightsWidget makes, for the same reason —
        the panel with the most rows must not be the one that sets the band's height, and a
        rail that stopped short of the charts' foot would leave the band visibly ragged.
      */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto">
      {shown.length === 0 ? (
        <p className="px-[20px] pb-[10px] pt-[24px] text-center text-[12px] leading-relaxed text-black/[0.42]">
          No thresholds have been crossed this period.
        </p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((a) => {
            const sev = SEVERITY[a.severity];
            const funds = a.funds ?? [];
            return (
              <li key={a.id} className="relative">
                <span aria-hidden className="absolute left-[12px] top-[14px]">
                  <AlertTriangleGlyph color={sev.ink} />
                </span>

                <div className="flex items-start justify-between gap-[8px] pl-[43px] pr-[10px] pt-[14px]">
                  <p className="min-w-0 pt-[6px] text-[12px] leading-[normal] tracking-[0.12px] text-black">
                    {a.message}
                  </p>
                  <span
                    className={cn(
                      "flex-none whitespace-nowrap rounded-[20px] px-[8px] py-[5px] text-[8px] leading-[9px] tracking-[0.08px]",
                      sev.chip,
                    )}
                  >
                    {sev.label}
                  </span>
                </div>

                <div className="mt-[6px] flex items-center justify-between gap-[8px] pl-[43px] pr-[22px]">
                  <p className="min-w-0 text-[8px] leading-[normal] tracking-[0.08px] text-black/[0.42]">
                    {a.title}
                  </p>
                  <Link
                    href={href}
                    aria-label={`Open alerts: ${a.title}`}
                    className="flex size-[23px] flex-none items-center justify-center rounded-full bg-white transition-opacity hover:opacity-75"
                  >
                    <ArrowGlyph color="#FD4438" />
                  </Link>
                </div>

                {funds.length > 0 && (
                  <div className="mt-[8px] flex items-start gap-[9px] pl-[4px] pr-[8px]">
                    <span className="pt-[5px] text-[8px] font-bold uppercase leading-[9px] tracking-[0.08px] text-black/[0.56]">
                      Where
                    </span>
                    <span className="flex min-w-0 flex-col items-start gap-[3px]">
                      {funds.map((f) => {
                        const body = (
                          <>
                            <span className="font-bold">
                              {f.code} - {f.name}
                            </span>
                            {f.detail && <span>{`  ${f.detail}`}</span>}
                          </>
                        );
                        const shape =
                          "max-w-full truncate whitespace-pre rounded-[20px] bg-white px-[8px] py-[5px] text-[8px] leading-[9px] tracking-[0.08px] text-black";
                        return f.href ? (
                          <Link
                            key={f.id}
                            href={f.href}
                            className={cn(shape, "transition-opacity hover:opacity-75")}
                          >
                            {body}
                          </Link>
                        ) : (
                          <span key={f.id} className={shape}>
                            {body}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                )}

                <span aria-hidden className="mx-[7px] mt-[8px] block h-[0.5px] bg-black/[0.11]" />
              </li>
            );
          })}
        </ul>
      )}
        </div>
      </div>

      {/* ---- the tallies and the way out, pinned to the panel's foot ---- */}
      <footer className="pt-[10px]">
        <div className="flex items-center pl-[28px]">
          <CriticalTally count={critical} />
          <div className="relative ml-[9px] size-[51px] rounded-[8px] bg-[rgba(230,95,43,0.18)]">
            <p className="absolute inset-x-0 top-[8px] text-center text-[20px] font-bold leading-[23px] tracking-[0.2px] text-[#e65f2b]">
              {warning}
            </p>
            <p className="absolute inset-x-0 top-[34px] text-center text-[8px] font-bold leading-[9px] tracking-[0.08px] text-[#e65f2b]">
              Warnings
            </p>
          </div>
          <div className="ml-[31px] flex flex-col items-center gap-[5px]">
            <p className="text-[20px] font-bold leading-[23px] tracking-[0.2px] text-[#fd4438]">
              {informational}
            </p>
            <p className="text-[6px] font-bold leading-[7px] tracking-[0.06px] text-[#fd4438]">
              Information
            </p>
          </div>
        </div>

        <Link
          href={href}
          className="mx-auto mb-[20px] mt-[34px] flex h-[20px] w-fit items-center gap-[2px] rounded-[22px] bg-white pl-[3px] pr-[9px] transition-opacity hover:opacity-75"
        >
          <span className="flex size-[16px] items-center justify-center">
            <ArrowGlyph color="#FD4438" className="-rotate-45" />
          </span>
          <span className="whitespace-nowrap text-[10px] leading-[12px] tracking-[0.2px] text-black">
            View All {total} Alerts
          </span>
        </Link>
      </footer>
    </section>
  );
}
