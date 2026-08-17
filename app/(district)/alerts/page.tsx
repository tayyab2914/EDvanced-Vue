import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { resolveScope } from "@/lib/dashboard/scope";
import { labelMode } from "@/lib/dashboard/label-mode";
import { loadCore } from "@/lib/dashboard/load";
import { PageHeader } from "@/components/page-header";
import {
  SectionCard,
  FooterInfoBar,
  CardActionLink,
  CardFooterLink,
} from "@/components/dashboard/section-card";
import { AlertList, AlertOverview } from "@/components/dashboard/alert-list";
import { EmptyState, SubstitutionNotice, Row } from "@/components/dashboard/shared";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { alertFunds, scopeOptions } from "@/lib/dashboard/options";
import { GO_TO } from "@/lib/dashboard/cta";
import type { AlertGroup } from "@/lib/alerts/catalog";

/**
 * Every alert for the scoped period, in one place (Spec §5.17).
 *
 * ONE PERIOD, and both the header and the footer say so. Alerts are evaluated for the period
 * on screen, not across the year — so a threshold a district crossed in February and has
 * since recovered from shows nothing today. That is the correct behaviour for a status page,
 * but it is not obvious, and a trend chart that visibly dips below a red line with no alert
 * beside it looks broken unless the page explains itself.
 *
 * TWO LINKS PER DOMAIN CARD, and they go to different places. The green one at the top right
 * LEAVES — it opens that domain's dashboard, where the figures behind the alert live. The
 * blue one at the foot STAYS — it re-renders this page narrowed to that domain, which is
 * what a reader wants when a card has more alerts than the two it can show at this size.
 */
interface GroupDef {
  key: AlertGroup;
  /** The card's name, as the design letters it: "Revenue Alerts (1)". */
  title: string;
  /** That domain's dashboard, for the green departure link. */
  href: string;
  cta: string;
  /** The blue foot link when the card is holding alerts — it stays on this page. */
  all: string;
  /**
   * The blue foot link when the card is CLEAR. "View all cash alerts" would land a reader on
   * an empty filtered page; with nothing to triage, the useful destination is the dashboard.
   */
  quiet: string;
  empty: string;
  emptyNote: string;
}

const GROUPS: GroupDef[] = [
  {
    key: "revenue",
    title: "Revenue",
    href: "/revenues",
    cta: GO_TO.revenues,
    all: "View all revenue alerts",
    quiet: "View revenue position",
    empty: "No revenue thresholds have been crossed.",
    emptyNote: "Collections are within all policy thresholds.",
  },
  {
    key: "expenditure",
    title: "Expenditure",
    href: "/expenditures",
    cta: GO_TO.expenditures,
    all: "View all expenditure alerts",
    quiet: "View expenditure position",
    empty: "No expenditure thresholds have been crossed.",
    emptyNote: "Spending is within all policy thresholds.",
  },
  {
    key: "cash",
    title: "Cash",
    href: "/cash",
    cta: GO_TO.cash,
    all: "View all cash alerts",
    quiet: "View cash position",
    empty: "No cash thresholds have been crossed.",
    emptyNote: "Cash position is within all policy thresholds.",
  },
  {
    key: "fundBalance",
    title: "Fund Balance",
    href: "/fund-balance",
    cta: GO_TO.fundBalance,
    all: "View all fund balance alerts",
    quiet: "View fund balance position",
    empty: "No fund balance thresholds have been crossed.",
    emptyNote: "The reserve is within all policy thresholds.",
  },
];

/**
 * How many alerts a domain card shows before it defers to its own foot link.
 *
 * Two, because four cards sitting in a two-column grid stretch to their tallest sibling: one
 * domain having eight alerts would otherwise leave three cards mostly white space, and the
 * reader would have to scroll past the emptiness to reach the footer note that explains the
 * period. The count is in the card's title either way, so nothing is hidden — see AlertList's
 * "and N more." line, which appears in the same place the link does.
 */
const PER_CARD = 2;

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; period?: string; fund?: string; group?: string }>;
}) {
  const { db, user, districtId } = await getTenantDb();
  if (!userCan(user, "view_dashboards")) redirect("/master-data");

  const sp = await searchParams;
  const scope = await resolveScope(db, districtId, sp, await labelMode());

  if (scope.empty) {
    return (
      <div className="animate-fade-up space-y-[18px]">
        <PageHeader title="Financial Alerts" description="Everything needing attention this period." />
        <EmptyState title="No data to monitor yet" action="Upload data" href="/data/upload">
          Alerts are raised from committed data against the thresholds you have set. Upload a
          reporting period to begin.
        </EmptyState>
      </div>
    );
  }

  const core = await loadCore(db, districtId, scope);
  const alerts = core.alerts;
  const options = scopeOptions(scope);

  const raised = alerts?.alerts ?? [];
  const observations = alerts?.observations ?? [];

  /** `?group=cash` — one domain, uncapped. Anything unrecognised falls back to the full page. */
  const focus = GROUPS.find((g) => g.key === sp.group);
  const shown = focus ? [focus] : GROUPS;

  /** "4 alerts requiring attention across 3 financial areas". */
  const areas = new Set(raised.map((a) => a.group)).size;
  const overview =
    raised.length === 0
      ? "No thresholds have been crossed this period."
      : `${raised.length} alert${raised.length === 1 ? "" : "s"} requiring attention across ` +
        `${areas} financial area${areas === 1 ? "" : "s"}`;

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Financial Alerts"
        description="Alerts across revenue, expenditures, cash position, and fund balance."
        note={
          focus
            ? `Showing ${focus.title.toLowerCase()} alerts for ${scope.label} only.`
            : `Evaluated for ${scope.label} only.`
        }
        actions={<DashboardFilters scope={scope} />}
      />
      {scope.substituted && (
        <SubstitutionNotice asked={scope.substituted.asked} showing={scope.substituted.showing} />
      )}

      {!focus && (
        <Row cols="2">
          {/*
            No foot link. Every alert this card counts is already on the same screen a few
            hundred pixels down, in the domain card that owns it — a "View all alerts" here
            would scroll the reader to content they can see, and each of those four cards
            carries its own way in.
          */}
          <SectionCard title="Alert Overview" subtitle={overview}>
            <AlertOverview
              critical={alerts?.criticalCount ?? 0}
              warning={alerts?.warningCount ?? 0}
              informational={alerts?.informationalCount ?? 0}
            />
          </SectionCard>

          <SectionCard
            title="For Awareness"
            subtitle="Financial items to monitor that have not triggered an alert threshold."
          >
            <AlertList
              mode={scope.labelMode}
              alerts={observations.map((o) => ({
                id: o.id,
                severity: "INFORMATIONAL" as const,
                title: o.title,
                message: o.message,
              }))}
              empty="Nothing else of note this period."
              emptyNote="No observations were raised for this period."
            />
          </SectionCard>
        </Row>
      )}

      <div className="grid gap-2.5 lg:grid-cols-2">
        {shown.map((g) => {
          const group = raised.filter((a) => a.group === g.key);
          const foot = focus
            ? { label: "View all alerts", href: options.link("/alerts") }
            : group.length > 0
              ? { label: g.all, href: options.link(`/alerts?group=${g.key}`) }
              : { label: g.quiet, href: options.link(g.href) };

          return (
            <SectionCard
              key={g.key}
              title={`${g.title} Alerts (${group.length})`}
              control={<CardActionLink href={options.link(g.href)}>{g.cta}</CardActionLink>}
              className={focus ? "lg:col-span-2" : undefined}
              bodyClassName="flex flex-col"
            >
              <AlertList
                mode={scope.labelMode}
                max={focus ? undefined : PER_CARD}
                alerts={group.map((a) => ({
                  id: a.id,
                  severity: a.severity,
                  title: a.title,
                  message: a.message,
                  // The drill-down stays on this page rather than jumping to the group's
                  // dashboard: the reader came here to triage, and narrowing to a fund
                  // re-triages everything, not just the row they clicked.
                  funds: alertFunds(scope, "/alerts", a.funds),
                }))}
                empty={g.empty}
                emptyNote={g.emptyNote}
              />
              <CardFooterLink href={foot.href}>{foot.label}</CardFooterLink>
            </SectionCard>
          );
        })}
      </div>

      <FooterInfoBar>
        <span className="block font-medium text-[#060606]/[0.88]">
          Alerts are evaluated for {scope.label} only.
        </span>
        <span className="mt-0.5 block">
          A threshold crossed in an earlier month appears on that month, not here — use the
          period selector to look back.
        </span>
      </FooterInfoBar>
    </div>
  );
}
