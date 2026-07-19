import Link from "next/link";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { getRecentAuditRows } from "@/lib/audit";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { RevenueExpenseBars, Donut } from "@/components/dashboard/charts";
import { Icon, type IconName } from "@/components/icons";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const REV = [11.8, 11.9, 12.1, 11.6, 12.4, 11.7, 12.0, 11.5, 12.3, 11.9, 12.2, 11.8];
const EXP = [7.4, 7.9, 8.1, 8.6, 7.7, 9.2, 8.0, 8.4, 8.9, 7.6, 8.3, 8.3];

function humanize(action: string): string {
  const s = action.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatTile({
  label,
  value,
  sub,
  delta,
  deltaSub,
  dark,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { text: string; tone: "green" | "bad" };
  deltaSub?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-[17px]",
        dark ? "border-navy bg-navy" : "border-line bg-white",
      )}
    >
      <div className={cn("mb-2 text-[12.5px] font-medium", dark ? "text-[#9fb0c9]" : "text-muted")}>
        {label}
      </div>
      <div className={cn("text-[26px] font-semibold tracking-[-0.5px]", dark ? "text-white" : "text-ink")}>
        {value}
      </div>
      {sub && (
        <div className={cn("mt-1.5 text-[12px]", dark ? "text-[#8ba0bf]" : "text-muted-2")}>
          {sub}
        </div>
      )}
      {delta && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[11.5px] font-semibold",
              delta.tone === "green" ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad",
            )}
          >
            {delta.text}
          </span>
          {deltaSub && <span className="text-[11.5px] text-muted-2">{deltaSub}</span>}
        </div>
      )}
    </div>
  );
}

export default async function DistrictDashboard() {
  const { db, user, districtId } = await getTenantDb();
  const [schools, projects, funds, revenueSources, functions, objects] =
    await Promise.all([
      db.school.count(),
      db.project.count(),
      db.fund.count(),
      db.revenueSource.count(),
      db.accountFunction.count(),
      db.accountObject.count(),
    ]);
  const refCodes = funds + revenueSources + functions + objects;

  const canAudit = userCan(user, "view_audit");
  const activity = canAudit
    ? await getRecentAuditRows({ districtId, take: 6 })
    : [];

  const masterRows: { label: string; count: number; href: string; icon: IconName }[] = [
    { label: "Funds", count: funds, href: "/master-data?tab=funds", icon: "database" },
    { label: "Cost centers", count: schools, href: "/master-data?tab=cost-centers", icon: "building" },
    { label: "Projects", count: projects, href: "/master-data?tab=projects", icon: "reports" },
  ];

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Executive Dashboard"
        description="A district-wide view of budget, revenue, and spending for the current fiscal year."
      />
      <div className="flex items-center gap-2 rounded-lg border border-[#d5e3fb] bg-[#f2f7ff] px-3.5 py-2 text-[12.5px] text-[#33507a]">
        <span className="font-semibold text-brand">ⓘ</span>
        <span>
          Financial figures below are a preview with sample data. Live dashboards
          populate once data uploads ship in Milestone 2.
        </span>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total Budget" value="$142.6M" sub="Adopted · FY 2024–25" />
        <StatTile
          label="Revenue YTD"
          value="$138.2M"
          delta={{ text: "▲ 3.2%", tone: "green" }}
          deltaSub="vs last FY"
        />
        <StatTile
          label="Expenses YTD"
          value="$96.4M"
          delta={{ text: "▲ 5.1%", tone: "bad" }}
          deltaSub="vs last FY"
        />
        <StatTile label="Remaining Budget" value="$46.2M" sub="32.4% of adopted budget" dark />
      </div>

      {/* charts */}
      <div className="grid gap-4 lg:grid-cols-[1.62fr_1fr]">
        <Card className="pb-2">
          <div className="mb-1.5 flex items-start justify-between">
            <div>
              <div className="text-[14.5px] font-semibold">Revenue vs. Expenses</div>
              <div className="mt-0.5 text-[12px] text-muted-2">
                Monthly, fiscal year to date ($M) · sample
              </div>
            </div>
            <div className="flex gap-3.5 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-[9px] w-[9px] rounded-[2px] bg-brand"></span>Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[9px] w-[9px] rounded-[2px] bg-[#c8d3e4]"></span>Expenses
              </span>
            </div>
          </div>
          <RevenueExpenseBars rev={REV} exp={EXP} months={MONTHS} />
        </Card>

        <Card>
          <div className="text-[14.5px] font-semibold">Budget Utilization</div>
          <div className="mb-3.5 text-[12px] text-muted-2">
            Spent against adopted budget · sample
          </div>
          <div className="flex flex-col items-center py-1.5">
            <Donut pct={67.6} />
          </div>
          <div className="mt-3 flex justify-between border-t border-line-soft pt-3.5 text-[12.5px]">
            <span className="text-muted">Spent</span>
            <strong className="font-semibold">$96.4M</strong>
          </div>
          <div className="flex justify-between pt-2 text-[12.5px]">
            <span className="text-muted">Remaining</span>
            <strong className="font-semibold">$46.2M</strong>
          </div>
        </Card>
      </div>

      {/* master data + activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[14.5px] font-semibold">Your master data</div>
            <Link href="/master-data" className="text-[12.5px] font-medium text-brand hover:underline">
              Manage
            </Link>
          </div>
          <div className="flex flex-col">
            {masterRows.map((r, i) => (
              <Link
                key={r.label}
                href={r.href}
                className={cn(
                  "group flex items-center gap-3 py-2.5",
                  i < masterRows.length - 1 && "border-b border-line-soft",
                )}
              >
                <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[7px] bg-[#e8eef7] text-brand">
                  <Icon name={r.icon} size={15} />
                </span>
                <span className="flex-1 text-[13px] font-medium text-ink group-hover:text-brand">
                  {r.label}
                </span>
                <span className="text-[13px] font-semibold">{r.count}</span>
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-3 text-[12.5px]">
              <span className="text-muted">Reference codes (chart of accounts)</span>
              <strong className="font-semibold">{refCodes}</strong>
            </div>
          </div>
        </Card>

        {canAudit ? (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[14.5px] font-semibold">Recent activity</div>
              <Link href="/audit" className="text-[12.5px] font-medium text-brand hover:underline">
                View all
              </Link>
            </div>
            <div className="flex flex-col">
              {activity.length === 0 && (
                <div className="py-6 text-center text-[13px] text-muted-2">
                  No activity recorded yet.
                </div>
              )}
              {activity.map((a, i) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 py-2.5",
                    i < activity.length - 1 && "border-b border-line-soft",
                  )}
                >
                  <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[7px] bg-[#e8f0e9] text-ok">
                    <Icon name="activity" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">
                      {humanize(a.action)}
                    </div>
                    <div className="text-[11.5px] text-muted-2">
                      {a.actorLabel} · {formatDateTime(a.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            <div className="mb-2 text-[14.5px] font-semibold">
              Welcome, {user.name.split(" ")[0]}
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              This is your district&apos;s finance workspace. Explore the{" "}
              <Link href="/master-data" className="font-medium text-brand hover:underline">
                master data
              </Link>{" "}
              that defines your chart of accounts. Data uploads, validation, and
              live analytics arrive in the next milestones.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
