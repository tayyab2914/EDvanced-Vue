import { Disclosure } from "@/components/disclosure";
import { AddUserForm } from "@/components/users/add-user-form";
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
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { ASSIGNABLE_ROLES } from "@/lib/validation/user";
import { formatDateTime } from "@/lib/format";
import {
  changeUserRole,
  setUserStatus,
  resendInvite,
  unlockUser,
} from "@/app/actions/users";
import { Role } from "@/lib/enums";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
}

export function UsersManager({
  districtId,
  users,
  currentUserId,
}: {
  districtId: string;
  users: UserRow[];
  currentUserId: string;
}) {
  const now = new Date();
  return (
    <div className="space-y-5">
      <Disclosure label="Invite users">
        <AddUserForm districtId={districtId} />
      </Disclosure>

      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Status</TH>
            <TH>Last login</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {users.length === 0 && (
            <EmptyRow colSpan={6}>
              No users yet. Invite your first user above.
            </EmptyRow>
          )}
          {users.map((u) => {
            const locked = !!u.lockedUntil && u.lockedUntil > now;
            const isSelf = u.id === currentUserId;
            const isPlatform = u.role === Role.PLATFORM_ADMIN;
            return (
              <TR key={u.id}>
                <TD className="font-medium text-ink">
                  {u.name}
                  {isSelf && (
                    <span className="ml-1 text-xs font-normal text-faint">
                      (you)
                    </span>
                  )}
                </TD>
                <TD>{u.email}</TD>
                <TD>
                  {isPlatform ? (
                    <Badge tone="indigo">Platform Admin</Badge>
                  ) : (
                    <form
                      action={changeUserRole}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="districtId" value={districtId} />
                      <input type="hidden" name="userId" value={u.id} />
                      <Select
                        name="role"
                        defaultValue={u.role}
                        className="w-40"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="secondary" size="sm">
                        Save
                      </Button>
                    </form>
                  )}
                </TD>
                <TD>
                  {locked ? (
                    <Badge tone="red">Locked</Badge>
                  ) : u.status === "ACTIVE" ? (
                    <Badge tone="green">Active</Badge>
                  ) : u.status === "INVITED" ? (
                    <Badge tone="amber">Invited</Badge>
                  ) : (
                    <Badge tone="gray">Disabled</Badge>
                  )}
                </TD>
                <TD className="whitespace-nowrap text-muted">
                  {formatDateTime(u.lastLoginAt)}
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1.5">
                    {u.status === "INVITED" && (
                      <form action={resendInvite}>
                        <input
                          type="hidden"
                          name="districtId"
                          value={districtId}
                        />
                        <input type="hidden" name="userId" value={u.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Resend
                        </Button>
                      </form>
                    )}
                    {locked && (
                      <form action={unlockUser}>
                        <input
                          type="hidden"
                          name="districtId"
                          value={districtId}
                        />
                        <input type="hidden" name="userId" value={u.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Unlock
                        </Button>
                      </form>
                    )}
                    {!isPlatform && !isSelf && (
                      <form action={setUserStatus}>
                        <input
                          type="hidden"
                          name="districtId"
                          value={districtId}
                        />
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={u.status === "DISABLED" ? "ACTIVE" : "DISABLED"}
                        />
                        <Button
                          type="submit"
                          variant={
                            u.status === "DISABLED" ? "secondary" : "danger"
                          }
                          size="sm"
                        >
                          {u.status === "DISABLED" ? "Enable" : "Disable"}
                        </Button>
                      </form>
                    )}
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
