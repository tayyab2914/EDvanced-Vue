import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  note,
  actions,
}: {
  title: string;
  description?: string;
  /**
   * A second line under the description, for the caveat a page cannot be read without —
   * the Alerts page's "Evaluated for September 2026 (FY 2026-27) only." It is a separate
   * line rather than a longer description because it qualifies the whole screen rather
   * than describing it, and a reader scanning the header should be able to skip one and
   * not the other.
   */
  note?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[32px] font-medium leading-[36px] tracking-[0.16px] text-[#060606]">
          {title}
        </h1>
        {description && (
          <p className="mt-[1px] text-[12px] leading-[14px] text-[#060606]">{description}</p>
        )}
        {note && <p className="mt-[6px] text-[12px] leading-[14px] text-[#060606]">{note}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
