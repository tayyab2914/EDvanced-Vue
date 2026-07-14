"use client";

import { useMemo, useState, useTransition } from "react";
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
import { Input, Select } from "@/components/ui/input";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/modal";
import { Menu, MenuItem } from "@/components/ui/menu";
import { SortTH, useSort } from "@/components/ui/sortable";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { InviteUserForm } from "@/components/users/invite-user-form";
import { EditUserForm } from "@/components/users/edit-user-form";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { ASSIGNABLE_ROLES } from "@/lib/validation/user";
import { formatDateTime } from "@/lib/format";
import {
  setUserStatus,
  resendInvite,
  adminResetPassword,
  unlockUser,
  deleteUser,
} from "@/app/actions/users";

export interface UserRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
}

type BadgeTone = "gray" | "green" | "red" | "amber" | "blue" | "indigo";

function statusInfo(u: UserRow): { key: string; label: string; tone: BadgeTone } {
  const locked = u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();
  if (locked) return { key: "locked", label: "Locked out", tone: "red" };
  if (u.status === "DISABLED") return { key: "disabled", label: "Disabled", tone: "gray" };
  if (u.status === "INVITED") return { key: "invited", label: "Invited", tone: "amber" };
  if (!u.lastLoginAt) return { key: "never", label: "Never logged in", tone: "blue" };
  return { key: "active", label: "Active", tone: "green" };
}

const STATUS_FILTERS = [
  { key: "active", label: "Active" },
  { key: "invited", label: "Invited" },
  { key: "never", label: "Never logged in" },
  { key: "disabled", label: "Disabled" },
  { key: "locked", label: "Locked out" },
];

export function UsersManager({
  districtId,
  users,
  currentUserId,
}: {
  districtId: string;
  users: UserRow[];
  currentUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && statusInfo(u).key !== statusFilter) return false;
      if (
        q &&
        !`${u.firstName ?? ""} ${u.lastName ?? ""} ${u.name} ${u.email}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [users, query, roleFilter, statusFilter]);

  // Sort by what the user sees: the role/status LABELS, not the raw enum values.
  const { sorted, sort, toggle } = useSort<UserRow>(filtered, (u, key) => {
    switch (key) {
      case "firstName":
        return u.firstName;
      case "lastName":
        return u.lastName;
      case "email":
        return u.email;
      case "role":
        return ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role;
      case "status":
        return statusInfo(u).label;
      case "lastLoginAt":
        return u.lastLoginAt ? new Date(u.lastLoginAt) : null;
      default:
        return null;
    }
  });

  const pg = usePagination(sorted);

  const activeFilters = (roleFilter ? 1 : 0) + (statusFilter ? 1 : 0);

  function fire(
    action: (fd: FormData) => Promise<void>,
    u: UserRow,
    extra?: Record<string, string>,
  ) {
    const fd = new FormData();
    fd.set("districtId", districtId);
    fd.set("userId", u.id);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    startTransition(async () => {
      await action(fd);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs sm:w-72">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2">
              <Icon name="search" size={16} />
            </span>
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                pg.reset();
              }}
              placeholder="Search name or email…"
              autoComplete="off"
              className="h-9 w-full pl-9"
            />
          </div>

          <Menu
            align="left"
            triggerLabel="Filters"
            triggerClassName="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-[13px] font-medium text-ink-soft transition-colors hover:bg-panel"
            trigger={
              <>
                <Icon name="filter" size={15} />
                Filters
                {activeFilters > 0 && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10.5px] font-semibold text-white">
                    {activeFilters}
                  </span>
                )}
              </>
            }
          >
            {() => (
              <div className="w-64 space-y-3 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                    Filters
                  </span>
                  {activeFilters > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRoleFilter("");
                        setStatusFilter("");
                      }}
                      className="text-[12px] font-medium text-brand hover:text-brand-dark"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-ink-soft">Role</span>
                  <Select
                    value={roleFilter}
                    onChange={(e) => {
                      setRoleFilter(e.target.value);
                      pg.reset();
                    }}
                    className="h-9"
                  >
                    <option value="">All roles</option>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-ink-soft">Status</span>
                  <Select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      pg.reset();
                    }}
                    className="h-9"
                  >
                    <option value="">All statuses</option>
                    {STATUS_FILTERS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            )}
          </Menu>
        </div>

        <Button type="button" onClick={() => setInviting(true)}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Invite user
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <SortTH sortKey="firstName" sort={sort} onSort={toggle}>
              First Name
            </SortTH>
            <SortTH sortKey="lastName" sort={sort} onSort={toggle}>
              Last Name
            </SortTH>
            <SortTH sortKey="email" sort={sort} onSort={toggle}>
              Email
            </SortTH>
            <SortTH sortKey="role" sort={sort} onSort={toggle}>
              Role
            </SortTH>
            <SortTH sortKey="status" sort={sort} onSort={toggle}>
              Status
            </SortTH>
            <SortTH sortKey="lastLoginAt" sort={sort} onSort={toggle}>
              Last login
            </SortTH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {sorted.length === 0 && (
            <EmptyRow colSpan={7}>
              {users.length === 0
                ? "No users yet. Invite your first with “Invite user”."
                : "No matches for these filters."}
            </EmptyRow>
          )}
          {pg.pageItems.map((u) => {
            const st = statusInfo(u);
            const isSelf = u.id === currentUserId;
            return (
              <TR key={u.id}>
                <TD className="font-medium text-ink">
                  <button
                    type="button"
                    onClick={() => setEditing(u)}
                    className="text-left text-ink transition-colors hover:text-brand hover:underline"
                  >
                    {u.firstName || "—"}
                  </button>
                  {isSelf && (
                    <span className="ml-1 text-xs font-normal text-faint">
                      (you)
                    </span>
                  )}
                </TD>
                <TD>{u.lastName || "—"}</TD>
                <TD>
                  <span className="text-ink-soft">{u.email}</span>
                  {!u.emailVerifiedAt && st.key !== "invited" && (
                    <span
                      title="This address hasn't been confirmed yet. Use “Resend invite” to send the verification email again."
                      className="ml-1.5 whitespace-nowrap text-xs font-medium text-warn"
                    >
                      Unverified
                    </span>
                  )}
                </TD>
                <TD>{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</TD>
                <TD>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </TD>
                <TD className="whitespace-nowrap text-muted">
                  {formatDateTime(u.lastLoginAt)}
                </TD>
                <TD>
                  <div className="flex justify-end">
                    <Menu
                      align="right"
                      triggerLabel="User actions"
                      triggerClassName="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-line-soft hover:text-ink"
                      trigger={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.6" />
                          <circle cx="12" cy="12" r="1.6" />
                          <circle cx="12" cy="19" r="1.6" />
                        </svg>
                      }
                    >
                      {(close) => (
                        <div className="min-w-[184px] py-1">
                          <MenuItem
                            icon={<Icon name="pencil" size={15} />}
                            onClick={() => {
                              setEditing(u);
                              close();
                            }}
                          >
                            Edit
                          </MenuItem>
                          {(st.key === "invited" || !u.emailVerifiedAt) && (
                            <MenuItem
                              icon={<Icon name="mail" size={15} />}
                              onClick={() => {
                                fire(resendInvite, u);
                                close();
                              }}
                            >
                              Resend invite
                            </MenuItem>
                          )}
                          {st.key !== "invited" && (
                            <MenuItem
                              icon={<Icon name="key" size={15} />}
                              onClick={() => {
                                fire(adminResetPassword, u);
                                close();
                              }}
                            >
                              Reset password
                            </MenuItem>
                          )}
                          {st.key === "locked" && (
                            <MenuItem
                              icon={<Icon name="unlock" size={15} />}
                              onClick={() => {
                                fire(unlockUser, u);
                                close();
                              }}
                            >
                              Unlock
                            </MenuItem>
                          )}
                          {!isSelf && (
                            <MenuItem
                              icon={<Icon name="power" size={15} />}
                              danger={u.status !== "DISABLED"}
                              onClick={() => {
                                fire(setUserStatus, u, {
                                  status: u.status === "DISABLED" ? "ACTIVE" : "DISABLED",
                                });
                                close();
                              }}
                            >
                              {u.status === "DISABLED" ? "Enable" : "Disable"}
                            </MenuItem>
                          )}
                          {!isSelf && (
                            <MenuItem
                              icon={<Icon name="trash" size={15} />}
                              danger
                              onClick={() => {
                                setDeleting(u);
                                close();
                              }}
                            >
                              Delete
                            </MenuItem>
                          )}
                        </div>
                      )}
                    </Menu>
                  </div>
                </TD>
              </TR>
            );
          })}
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
        noun="users"
      />

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite user"
      >
        <InviteUserForm
          districtId={districtId}
          onDone={() => setInviting(false)}
        />
      </Modal>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Edit user">
          <EditUserForm
            districtId={districtId}
            user={{
              id: editing.id,
              firstName: editing.firstName ?? "",
              lastName: editing.lastName ?? "",
              email: editing.email,
              role: editing.role,
            }}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title="Delete user?">
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-ink-soft">
              This permanently deletes{" "}
              <span className="font-medium text-ink">
                {deleting.name || deleting.email}
              </span>{" "}
              <span className="text-muted-2">({deleting.email})</span>. Their sessions
              and any pending invites are removed. Audit history is kept. This cannot be
              undone.
            </p>
            <p className="text-[13px] leading-relaxed text-muted-2">
              To keep their history and let them back in later, use{" "}
              <span className="font-medium text-ink-soft">Disable</span> instead.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleting(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  fire(deleteUser, deleting);
                  setDeleting(null);
                }}
              >
                Delete user
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
