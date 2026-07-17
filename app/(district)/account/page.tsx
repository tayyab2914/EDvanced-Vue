import { requireAuth } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NameForm, PasswordForm } from "@/components/account/account-forms";

/**
 * Closes the Spec's §5.1 known gap. Any signed-in user reaches this — it is about them,
 * not about their district, so there is no permission to check beyond being logged in.
 */
export default async function AccountPage() {
  const user = await requireAuth();
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { firstName: true, lastName: true, name: true, email: true, lastLoginAt: true },
  });

  // Accounts predating the first/last split (M1 added those columns later) have only the
  // denormalised name — fall back to splitting it rather than showing empty boxes.
  const [fallbackFirst, ...rest] = (row?.name ?? "").split(" ");

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Your account"
        description="Your name and password. Everything else about your access is set by an administrator."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <NameForm
          firstName={row?.firstName ?? fallbackFirst ?? ""}
          lastName={row?.lastName ?? rest.join(" ")}
          email={row?.email ?? user.email}
        />
        <PasswordForm />
      </div>

      <Card>
        <h2 className="mb-3 text-[15px] font-semibold">Your access</h2>
        <div className="flex flex-col gap-2.5 text-[12.5px]">
          <Row label="Role">
            <Badge tone="blue">{ROLE_LABELS[user.role]}</Badge>
          </Row>
          {user.districtName && <Row label="District">{user.districtName}</Row>}
          {user.accessExpiresAt && (
            <Row label="Access expires">{formatDateTime(user.accessExpiresAt)}</Row>
          )}
          {row?.lastLoginAt && <Row label="Last sign-in">{formatDateTime(row.lastLoginAt)}</Row>}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line-soft pb-2.5 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{children}</span>
    </div>
  );
}
