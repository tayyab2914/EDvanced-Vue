import { requireRole } from "@/lib/auth/dal";
import { listGrantsForUser } from "@/lib/external-access-db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { DistrictList } from "@/components/external/district-list";
import { Role } from "@/lib/enums";

export default async function MyDistrictsPage() {
  const me = await requireRole(Role.EXTERNAL_USER);
  const grants = await listGrantsForUser(me.id);

  return (
    <div>
      <PageHeader
        title="My districts"
        description="Districts you've been given access to. Each district approves your access, sets what you can do, and for how long."
      />

      {grants.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <div className="text-[15px] font-semibold text-ink">
              No districts assigned yet
            </div>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-2">
              A platform administrator needs to assign you to a district. Once they
              do, that district must approve your access before you can see its data.
            </p>
          </div>
        </Card>
      ) : (
        <DistrictList
          grants={grants.map((g) => ({
            districtId: g.districtId,
            districtName: g.district.name,
            status: g.status,
            level: g.level,
            expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
          }))}
        />
      )}
    </div>
  );
}
