"use client";

import {
  Table,
  THead,
  TBody,
  TR,
  TD,
  EmptyRow,
} from "@/components/ui/table";
import { SortTH, useSort } from "@/components/ui/sortable";
import { Pagination, usePagination } from "@/components/ui/pagination";
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
  if (action.includes("FAILED") || action.includes("LOCKED") || action.includes("DISABLED") || action.includes("DEACTIVATED") || action.includes("DELETED"))
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

  // Sort the humanized Action text, not the raw SCREAMING_SNAKE constant — the user is
  // sorting the column they can see. Starts on newest-first, which is the order the server
  // already returns, so the arrow tells the truth about the initial view.
  const { sorted, sort, toggle } = useSort<AuditRow>(
    rows,
    (r, key) => {
      switch (key) {
        case "createdAt":
          return r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
        case "action":
          return humanize(r.action);
        case "districtLabel":
          return r.districtLabel;
        case "actorLabel":
          return r.actorLabel;
        case "entityType":
          return r.entityType;
        default:
          return null;
      }
    },
    { key: "createdAt", dir: "desc" },
  );

  const pg = usePagination(sorted);

  return (
    <div className="space-y-4">
    <Table>
      <THead>
        <TR>
          <SortTH sortKey="createdAt" sort={sort} onSort={toggle}>
            When
          </SortTH>
          <SortTH sortKey="action" sort={sort} onSort={toggle}>
            Action
          </SortTH>
          {showDistrict && (
            <SortTH sortKey="districtLabel" sort={sort} onSort={toggle}>
              District
            </SortTH>
          )}
          <SortTH sortKey="actorLabel" sort={sort} onSort={toggle}>
            Actor
          </SortTH>
          <SortTH sortKey="entityType" sort={sort} onSort={toggle}>
            Entity
          </SortTH>
        </TR>
      </THead>
      <TBody>
        {sorted.length === 0 && (
          <EmptyRow colSpan={colSpan}>No activity recorded yet.</EmptyRow>
        )}
        {pg.pageItems.map((r) => (
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

      <Pagination
        page={pg.page}
        pageCount={pg.pageCount}
        pageSize={pg.pageSize}
        onPageSize={pg.setPageSize}
        total={pg.total}
        from={pg.from}
        to={pg.to}
        onPage={pg.setPage}
        noun="entries"
      />
    </div>
  );
}
