import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { CreateDistrictForm } from "./create-district-form";
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
import { formatDate, monthName } from "@/lib/format";
import { Role } from "@/lib/enums";

export default async function DistrictsPage() {
  await requireRole(Role.PLATFORM_ADMIN);
  const districts = await prisma.district.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      fiscalYearStartMonth: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="District Management"
        description="Create and manage district tenants. Each new district is seeded with the standard chart of accounts."
      />
      <div className="mb-5">
        <Disclosure label="New district">
          <CreateDistrictForm />
        </Disclosure>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>District</TH>
            <TH>Code</TH>
            <TH>Users</TH>
            <TH>FY start</TH>
            <TH>Status</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <TBody>
          {districts.length === 0 && (
            <EmptyRow colSpan={6}>
              No districts yet. Create your first district above.
            </EmptyRow>
          )}
          {districts.map((d) => (
            <TR key={d.id}>
              <TD className="font-medium">
                <Link
                  href={`/platform/districts/${d.id}`}
                  className="text-brand hover:text-brand-dark"
                >
                  {d.name}
                </Link>
              </TD>
              <TD>{d.code}</TD>
              <TD>{d._count.users}</TD>
              <TD>{monthName(d.fiscalYearStartMonth)}</TD>
              <TD>
                {d.status === "ACTIVE" ? (
                  <Badge tone="green">Active</Badge>
                ) : (
                  <Badge tone="gray">Inactive</Badge>
                )}
              </TD>
              <TD className="whitespace-nowrap text-muted">
                {formatDate(d.createdAt)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
