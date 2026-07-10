import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

export interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  actorLabel: string;
  districtLabel?: string | null;
  createdAt: Date;
}

function humanize(action: string): string {
  const s = action.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toneForAction(
  action: string,
): "gray" | "green" | "red" | "amber" | "blue" | "indigo" {
  if (action.includes("FAILED") || action.includes("LOCKED") || action.includes("DISABLED") || action.includes("DEACTIVATED"))
    return "red";
  if (action.includes("CREATED") || action.includes("SUCCESS") || action.includes("ACTIVATED"))
    return "green";
  if (action.includes("INVITE") || action.includes("RESET")) return "amber";
  return "gray";
}

export function AuditTable({
  rows,
  showDistrict = false,
}: {
  rows: AuditRow[];
  showDistrict?: boolean;
}) {
  const colSpan = showDistrict ? 5 : 4;
  return (
    <Table>
      <THead>
        <TR>
          <TH>When</TH>
          <TH>Action</TH>
          {showDistrict && <TH>District</TH>}
          <TH>Actor</TH>
          <TH>Entity</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 && (
          <EmptyRow colSpan={colSpan}>No activity recorded yet.</EmptyRow>
        )}
        {rows.map((r) => (
          <TR key={r.id}>
            <TD className="whitespace-nowrap text-muted">
              {formatDateTime(r.createdAt)}
            </TD>
            <TD>
              <Badge tone={toneForAction(r.action)}>{humanize(r.action)}</Badge>
            </TD>
            {showDistrict && <TD>{r.districtLabel ?? "—"}</TD>}
            <TD>{r.actorLabel}</TD>
            <TD className="text-muted">{r.entityType ?? "—"}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
