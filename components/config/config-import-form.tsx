"use client";

import { useActionState } from "react";
import { importConfigItems } from "@/app/actions/config";
import {
  EMPTY_CONFIG_IMPORT,
  type ConfigImportResult,
  type ConfigKind,
} from "@/lib/config/registry";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function ConfigImportForm({
  kind,
  title,
  onDone,
}: {
  kind: ConfigKind;
  title: string;
  onDone: () => void;
}) {
  const [result, action, pending] = useActionState<ConfigImportResult, FormData>(
    importConfigItems,
    EMPTY_CONFIG_IMPORT,
  );

  function downloadTemplate() {
    const csv = "Code,Name\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <p className="text-[13px] leading-relaxed text-muted-2">
        Upload a CSV with a <span className="font-medium text-ink-soft">Name</span>{" "}
        column and an optional{" "}
        <span className="font-medium text-ink-soft">Code</span> column to add{" "}
        {title.toLowerCase()} in bulk.
      </p>

      <button
        type="button"
        onClick={downloadTemplate}
        className="text-[13px] font-medium text-brand hover:text-brand-dark hover:underline"
      >
        Download template
      </button>

      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        className="block w-full cursor-pointer rounded-lg border border-[#d3dae5] bg-white text-[13px] text-ink-soft file:mr-3 file:cursor-pointer file:border-0 file:bg-panel file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-ink-soft hover:file:bg-line-soft"
      />

      {result.error && <Alert tone="error">{result.error}</Alert>}
      {result.ok && (
        <Alert tone={result.failed ? "warning" : "success"}>
          Imported {result.imported} row{result.imported === 1 ? "" : "s"}.
          {result.failed ? ` ${result.failed} row(s) skipped — see below.` : ""}
        </Alert>
      )}
      {result.errors && result.errors.length > 0 && (
        <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-line bg-panel p-2.5 text-[12px] text-ink-soft">
          {result.errors.slice(0, 50).map((e, i) => (
            <div key={i}>
              <span className="font-medium">Row {e.row}:</span> {e.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {result.ok ? "Done" : "Cancel"}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </Button>
      </div>
    </form>
  );
}
