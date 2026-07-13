import { switchDistrict } from "@/app/actions/external-access";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ACCESS_LEVEL_LABELS,
  GRANT_STATE_LABELS,
  GRANT_STATE_TONES,
  daysUntil,
  deriveGrantState,
} from "@/lib/external-access";
import { formatDate } from "@/lib/format";
import type { ExternalAccessLevel, ExternalAccessStatus } from "@/lib/enums";

export interface DistrictListItem {
  districtId: string;
  districtName: string;
  status: ExternalAccessStatus;
  level: ExternalAccessLevel | null;
  expiresAt: string | null;
}

/** Why the user can't get in, phrased for the person reading it rather than the database. */
function explain(state: string, districtName: string): string {
  switch (state) {
    case "PENDING":
      return `${districtName} hasn't approved your access yet. You'll get an email when they decide.`;
    case "DENIED":
      return `${districtName} declined your access request.`;
    case "REVOKED":
      return `${districtName} has revoked your access.`;
    case "EXPIRED":
      return `Your access to ${districtName} has expired. The district can extend it.`;
    default:
      return "";
  }
}

export function DistrictList({ grants }: { grants: DistrictListItem[] }) {
  const now = new Date();

  return (
    <div className="space-y-3">
      {grants.map((g) => {
        // Never trust `status` alone — an ACTIVE row past its expiry is EXPIRED.
        const state = deriveGrantState(
          { status: g.status, expiresAt: g.expiresAt },
          now,
        );
        const isOpen = state === "ACTIVE";
        const left = g.expiresAt ? daysUntil(g.expiresAt, now) : null;

        return (
          <Card key={g.districtId}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-ink">
                    {g.districtName}
                  </span>
                  <Badge tone={GRANT_STATE_TONES[state]}>
                    {GRANT_STATE_LABELS[state]}
                  </Badge>
                  {isOpen && g.level && (
                    <Badge tone="blue">{ACCESS_LEVEL_LABELS[g.level]}</Badge>
                  )}
                </div>

                <p className="mt-1 text-[13px] text-muted-2">
                  {isOpen
                    ? `Access expires ${formatDate(g.expiresAt)}${
                        left !== null && left <= 7
                          ? ` — ${left <= 0 ? "today" : `in ${left} day${left === 1 ? "" : "s"}`}`
                          : ""
                      }`
                    : explain(state, g.districtName)}
                </p>
              </div>

              {isOpen && (
                <form action={switchDistrict} className="flex-none">
                  <input type="hidden" name="districtId" value={g.districtId} />
                  <Button type="submit">Open</Button>
                </form>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
