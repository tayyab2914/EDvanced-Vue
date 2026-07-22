"use client";

import { csvFilename, downloadCsv, toCsv } from "@/lib/csv-export";

export interface TemplateItem {
  slug: string;
  label: string;
  description: string;
  headers: string[];
}

/**
 * A district's starting point: a blank CSV with the exact columns each importer expects, in
 * the order the file is read. The headers come straight from the dataset registry
 * (`templateHeaders`), so a template can never list a column the importer doesn't accept —
 * which is the whole reason to offer them here rather than have districts guess.
 *
 * Header-only, no rows: `toCsv(headers, [])` writes just the first line. Same writer the
 * exports use, so what a district downloads is exactly what the parser reads back.
 */
export function ImportTemplates({
  annual,
  monthly,
}: {
  annual: TemplateItem[];
  monthly: TemplateItem[];
}) {
  function download(t: TemplateItem) {
    downloadCsv(csvFilename(`${t.label} template`), toCsv(t.headers, []));
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Import templates</h2>
        <p className="mt-0.5 text-[12.5px] text-muted-2">
          Download a blank template with the exact columns each file needs, fill it in, then
          upload it above. One dataset per file.
        </p>
      </div>

      <Group title="Once a year" items={annual} onDownload={download} />
      <Group title="Every reporting period" items={monthly} onDownload={download} />
    </div>
  );
}

function Group({
  title,
  items,
  onDownload,
}: {
  title: string;
  items: TemplateItem[];
  onDownload: (t: TemplateItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-2">
        {title}
      </h3>
      <ul className="divide-y divide-line-soft rounded-lg border border-line">
        {items.map((t) => (
          <li
            key={t.slug}
            className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3"
          >
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">{t.label}</div>
              <div className="mt-0.5 text-[12px] text-muted-2">{t.description}</div>
            </div>
            <button
              type="button"
              onClick={() => onDownload(t)}
              className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-line-soft"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Download template
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
