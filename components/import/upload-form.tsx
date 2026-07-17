"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DatasetMeta, DatasetSlug } from "@/lib/datasets/kinds";
import { periodOptions } from "@/lib/periods/fiscal";
import { PeriodType } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Select, Input } from "@/components/ui/input";

/**
 * Step 1 of the lifecycle: pick what this file is, and send it.
 *
 * Posts to a ROUTE HANDLER, not a Server Action — Next caps action bodies at 1MB, which a
 * finance workbook clears immediately. That is also why this is hand-rolled rather than
 * using useActionState like every other form in the product.
 */
export function UploadForm({
  datasets,
  fiscalYears,
  startMonth,
  districtId,
}: {
  datasets: { annual: DatasetMeta[]; monthly: DatasetMeta[] };
  fiscalYears: string[];
  startMonth: number;
  districtId: string;
}) {
  const router = useRouter();
  const all = [...datasets.annual, ...datasets.monthly];

  const [slug, setSlug] = useState<DatasetSlug>(datasets.monthly[0]?.slug ?? all[0].slug);
  const [fiscalYear, setFiscalYear] = useState(fiscalYears[0]);
  const [period, setPeriod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const meta = all.find((d) => d.slug === slug)!;
  const isAnnual = meta.periodType === PeriodType.ANNUAL;
  const periods = periodOptions(meta.periodType, startMonth);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) return setError("Choose a file to upload.");
    if (!isAnnual && !period) return setError("Choose a reporting period.");

    const body = new FormData();
    body.set("dataset", slug);
    body.set("fiscalYear", fiscalYear);
    // An annual import covers the whole year and carries no period at all — sending one
    // would be refused server-side, and rightly.
    body.set("period", isAnnual ? "" : period);
    body.set("districtId", districtId);
    body.set("file", file);

    setBusy(true);
    try {
      const res = await fetch("/api/import/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setBusy(false);
        return setError(json.error ?? "That upload didn't work. Please try again.");
      }
      // Straight to the report — the district's next question is always "is it clean?"
      router.push(`/data/batches/${json.batchId}`);
    } catch {
      setBusy(false);
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      <Field label="What are you uploading?" htmlFor="dataset">
        <Select
          id="dataset"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value as DatasetSlug);
            setPeriod("");
          }}
        >
          {/* Grouped by rhythm: a district sets its year up once, then reports monthly. */}
          <optgroup label="Once a year">
            {datasets.annual.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Every reporting period">
            {datasets.monthly.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.label}
              </option>
            ))}
          </optgroup>
        </Select>
        <p className="mt-1.5 text-[12px] text-muted-2">{meta.description}</p>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fiscal year" htmlFor="fiscalYear">
          <Select
            id="fiscalYear"
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
          >
            {fiscalYears.map((fy) => (
              <option key={fy} value={fy}>
                {fy}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reporting period" htmlFor="period">
          {isAnnual ? (
            <div className="flex h-[38px] items-center rounded-lg border border-line bg-panel px-3 text-[13px] text-muted">
              Full year — this file has no period
            </div>
          ) : (
            <Select id="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="">Select a period…</option>
              {periods.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field label="File" htmlFor="file">
        <Input
          id="file"
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="mt-1.5 text-[12px] text-muted-2">
          Excel (.xlsx) or CSV. One dataset per file.
        </p>
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload and validate"}
        </Button>
        {busy && (
          <span className="text-[12.5px] text-muted-2">
            Reading your file. Large files take a moment.
          </span>
        )}
      </div>
    </form>
  );
}
