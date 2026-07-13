import { cn } from "@/lib/cn";

export const BRAND_NAME = "EDvanced Vue";
export const BRAND_TAGLINE = "School Finance & Analytics";

/**
 * The EDvanced Vue mark: a split navy/green ring around a monitor showing a rising bar
 * chart. Drawn inline rather than shipped as a raster so it stays crisp at every size and
 * can recolor for dark surfaces (on navy the dark strokes flip to white).
 */
export function LogoMark({
  size = 32,
  onDark = false,
  className,
}: {
  size?: number;
  onDark?: boolean;
  className?: string;
}) {
  const dark = onDark ? "#ffffff" : "var(--color-logo-navy)";
  const green = "var(--color-logo-green)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={BRAND_NAME}
      className={cn("flex-none", className)}
    >
      {/* Split ring — green sweeps the top-right, navy carries the rest. */}
      <path
        d="M34.82 5.15 A27 27 0 0 1 46.31 54.90"
        stroke={green}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M29.18 5.15 A27 27 0 0 0 38.99 58.08"
        stroke={dark}
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Monitor */}
      <rect
        x="14.5"
        y="18.5"
        width="35"
        height="25"
        rx="3"
        stroke={dark}
        strokeWidth="2.6"
      />
      <path
        d="M29 44 h6 v4 h-6 z M23 51 h18"
        stroke={dark}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Rising bars, then the trend line on top of them. */}
      <g fill={green}>
        <rect x="20" y="33" width="6" height="7" rx="1" />
        <rect x="29" y="29" width="6" height="11" rx="1" />
        <rect x="38" y="25" width="6" height="15" rx="1" />
      </g>
      <path
        d="M19 38 L26 31 L32 35 L42.2 24.6"
        stroke={dark}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M44.5 21.5 L42.7 27.9 L38.3 23.9 Z" fill={dark} />
    </svg>
  );
}

/** The wordmark: "ED" and "V" in green, the rest in navy (white on dark surfaces). */
export function LogoWordmark({
  onDark = false,
  className,
}: {
  onDark?: boolean;
  className?: string;
}) {
  const dark = onDark ? "text-white" : "text-logo-navy";
  const green = "text-logo-green";

  return (
    <span
      className={cn(
        "whitespace-nowrap font-semibold tracking-[-0.01em]",
        dark,
        className,
      )}
    >
      <span className={green}>ED</span>vanced <span className={green}>V</span>ue
    </span>
  );
}

/** Mark + wordmark, with the tagline underneath when there's room for it. */
export function Logo({
  size = 34,
  onDark = false,
  tagline = false,
  className,
}: {
  size?: number;
  onDark?: boolean;
  tagline?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} onDark={onDark} />
      <div className="min-w-0 leading-tight">
        <LogoWordmark onDark={onDark} className="block text-[17px]" />
        {tagline && (
          <span
            className={cn(
              "block text-[10px] font-medium uppercase tracking-[0.14em]",
              onDark ? "text-[#8fa1bb]" : "text-muted-2",
            )}
          >
            {BRAND_TAGLINE}
          </span>
        )}
      </div>
    </div>
  );
}
