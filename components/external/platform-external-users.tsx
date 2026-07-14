"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createExternalUser,
  deleteExternalUser,
  resendExternalInvite,
  setExternalUserStatus,
  unlockExternalUser,
  withdrawAssignment,
} from "@/app/actions/external-access";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { SortTH, useSort } from "@/components/ui/sortable";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import {
  ACCESS_LEVEL_LABELS,
  GRANT_STATE_LABELS,
  GRANT_STATE_TONES,
  deriveGrantState,
} from "@/lib/external-access";
import { formatDate, formatDateTime } from "@/lib/format";
import { UserStatus, type ExternalAccessLevel, type ExternalAccessStatus } from "@/lib/enums";

interface GrantSummary {
  id: string;
  status: ExternalAccessStatus;
  level: ExternalAccessLevel | null;
  expiresAt: string | null;
  districtId: string;
  districtName: string;
}

export interface ExternalUserRow {
  id: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  locked: boolean;
  grants: GrantSummary[];
}

type StatusLabel =
  | "Locked"
  | "Disabled"
  | "Invited"
  | "Never signed in"
  | "Active";

/** One source of truth for the account's state, so the badge and the sort agree. */
function statusLabel(u: ExternalUserRow): StatusLabel {
  if (u.locked) return "Locked";
  if (u.status === UserStatus.DISABLED) return "Disabled";
  if (u.status === UserStatus.INVITED) return "Invited";
  if (!u.lastLoginAt) return "Never signed in";
  return "Active";
}

const STATUS_TONES: Record<
  StatusLabel,
  "gray" | "green" | "red" | "amber" | "blue"
> = {
  Locked: "red",
  Disabled: "gray",
  Invited: "amber",
  "Never signed in": "blue",
  Active: "green",
};

function AddForm({
  districts,
  onDone,
}: {
  districts: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createExternalUser, EMPTY_FORM_STATE);

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && (
        <Alert tone="success">
          <span className="whitespace-pre-line">{state.success}</span>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={state.fieldErrors?.firstName?.[0]}>
          <Input name="firstName" required autoComplete="off" />
        </Field>
        <Field label="Last name" error={state.fieldErrors?.lastName?.[0]}>
          <Input name="lastName" required autoComplete="off" />
        </Field>
      </div>
      <Field label="Email address" error={state.fieldErrors?.email?.[0]}>
        <Input type="email" name="email" required autoComplete="off" />
      </Field>

      <Field
        label="Districts"
        hint="Each district is asked to approve. They choose the permission level and expiry — you don't."
        error={state.fieldErrors?.districtIds?.[0]}
      >
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[#d3dae5] p-2">
          {districts.length === 0 ? (
            <p className="px-1 py-2 text-[13px] text-muted-2">
              No active districts yet.
            </p>
          ) : (
            districts.map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] text-ink-soft hover:bg-panel"
              >
                <input
                  type="checkbox"
                  name="districtIds"
                  value={d.id}
                  className="h-4 w-4 rounded border-[#d3dae5] text-brand focus:ring-brand"
                />
                {d.name}
              </label>
            ))
          )}
        </div>
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Close
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Add & request access"}
        </Button>
      </div>
    </form>
  );
}

function AssignForm({
  user,
  districts,
  onDone,
}: {
  user: ExternalUserRow;
  districts: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createExternalUser, EMPTY_FORM_STATE);
  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  // Only offer districts they don't already have a live/pending relationship with.
  const taken = new Set(
    user.grants
      .filter((g) => g.status === "PENDING" || g.status === "ACTIVE")
      .map((g) => g.districtId),
  );
  const available = districts.filter((d) => !taken.has(d.id));

  return (
    <form action={action} className="space-y-4">
      {/* createExternalUser is reused: it upserts by email, so an existing external user
          simply gains new PENDING grants rather than being recreated. */}
      <input type="hidden" name="firstName" value={user.name.split(" ")[0] || "External"} />
      <input
        type="hidden"
        name="lastName"
        value={user.name.split(" ").slice(1).join(" ") || "User"}
      />
      <input type="hidden" name="email" value={user.email} />

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field label="Districts to request" error={state.fieldErrors?.districtIds?.[0]}>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[#d3dae5] p-2">
          {available.length === 0 ? (
            <p className="px-1 py-2 text-[13px] text-muted-2">
              {user.name} is already assigned to every active district.
            </p>
          ) : (
            available.map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] text-ink-soft hover:bg-panel"
              >
                <input
                  type="checkbox"
                  name="districtIds"
                  value={d.id}
                  className="h-4 w-4 rounded border-[#d3dae5] text-brand focus:ring-brand"
                />
                {d.name}
              </label>
            ))
          )}
        </div>
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || available.length === 0}>
          {pending ? "Requesting…" : "Request access"}
        </Button>
      </div>
    </form>
  );
}

/** The per-district grant chips under each user — the whole point of an external user. */
function GrantChips({ grants }: { grants: GrantSummary[] }) {
  const now = new Date();
  if (!grants.length) {
    return <span className="text-[12.5px] text-muted-2">No districts assigned</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {grants.map((g) => {
        const state = deriveGrantState(
          { status: g.status, expiresAt: g.expiresAt },
          now,
        );
        return (
          <span
            key={g.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel py-0.5 pl-2 pr-1"
            title={
              state === "ACTIVE" && g.expiresAt
                ? `${ACCESS_LEVEL_LABELS[g.level!]} · expires ${formatDate(g.expiresAt)}`
                : GRANT_STATE_LABELS[state]
            }
          >
            <span className="text-[12px] font-medium text-ink-soft">
              {g.districtName}
            </span>
            <Badge tone={GRANT_STATE_TONES[state]}>
              {state === "ACTIVE" && g.level
                ? ACCESS_LEVEL_LABELS[g.level]
                : GRANT_STATE_LABELS[state]}
            </Badge>
            {/* Only a request nobody has answered yet can be withdrawn. */}
            {state === "PENDING" && (
              <form action={withdrawAssignment}>
                <input type="hidden" name="grantId" value={g.id} />
                <button
                  type="submit"
                  title={`Withdraw the request to ${g.districtName}`}
                  aria-label={`Withdraw the request to ${g.districtName}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-line-soft hover:text-bad"
                >
                  ×
                </button>
              </form>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function PlatformExternalUsers({
  users,
  districts,
}: {
  users: ExternalUserRow[];
  districts: { id: string; name: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState<ExternalUserRow | null>(null);
  const [deleting, setDeleting] = useState<ExternalUserRow | null>(null);

  // Same idiom as UsersManager: build the FormData and call the action, so menu items stay
  // plain buttons rather than nested forms.
  function fire(
    action: (fd: FormData) => Promise<void>,
    u: ExternalUserRow,
    extra?: Record<string, string>,
  ) {
    const fd = new FormData();
    fd.set("userId", u.id);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    void action(fd);
  }

  // "Districts" holds a set of chips rather than one value, so it isn't sortable by content —
  // we sort it by how many districts the user is involved with, which is the only ordering
  // that means anything there.
  const { sorted, sort, toggle } = useSort<ExternalUserRow>(users, (u, key) => {
    switch (key) {
      case "name":
        return u.name;
      case "email":
        return u.email;
      case "districts":
        return u.grants.length;
      case "status":
        return statusLabel(u);
      case "lastLoginAt":
        return u.lastLoginAt ? new Date(u.lastLoginAt) : null;
      default:
        return null;
    }
  });

  const pg = usePagination(sorted);

  function statusBadge(u: ExternalUserRow) {
    const tone = STATUS_TONES[statusLabel(u)];
    return <Badge tone={tone}>{statusLabel(u)}</Badge>;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>Add external user</Button>
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <SortTH sortKey="name" sort={sort} onSort={toggle}>
                Name
              </SortTH>
              <SortTH sortKey="email" sort={sort} onSort={toggle}>
                Email
              </SortTH>
              <SortTH sortKey="districts" sort={sort} onSort={toggle}>
                Districts
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
            {sorted.length === 0 ? (
              <EmptyRow colSpan={6}>
                No external users yet. Add one above to get started.
              </EmptyRow>
            ) : (
              pg.pageItems.map((u) => (
                <TR key={u.id}>
                  <TD>{u.name}</TD>
                  <TD>
                    <span className="text-ink-soft">{u.email}</span>
                  </TD>
                  <TD>
                    <GrantChips grants={u.grants} />
                  </TD>
                  <TD>{statusBadge(u)}</TD>
                  <TD className="whitespace-nowrap text-muted">
                    {formatDateTime(u.lastLoginAt)}
                  </TD>
                  <TD>
                    <div className="flex justify-end">
                      <Menu
                        align="right"
                        triggerLabel={`Actions for ${u.name}`}
                        trigger={
                          <span className="flex h-8 w-8 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-line-soft hover:text-ink">
                            ⋮
                          </span>
                        }
                      >
                        {(close) => (
                          <div className="w-56 py-1">
                            <MenuItem
                              onClick={() => {
                                close();
                                setAssigning(u);
                              }}
                            >
                              Assign districts
                            </MenuItem>

                            {u.status === UserStatus.INVITED && (
                              <MenuItem
                                onClick={() => {
                                  fire(resendExternalInvite, u);
                                  close();
                                }}
                              >
                                Resend invite
                              </MenuItem>
                            )}

                            {u.locked && (
                              <MenuItem
                                onClick={() => {
                                  fire(unlockExternalUser, u);
                                  close();
                                }}
                              >
                                Unlock
                              </MenuItem>
                            )}

                            <MenuItem
                              onClick={() => {
                                fire(setExternalUserStatus, u, {
                                  status:
                                    u.status === UserStatus.DISABLED
                                      ? UserStatus.ACTIVE
                                      : UserStatus.DISABLED,
                                });
                                close();
                              }}
                            >
                              {u.status === UserStatus.DISABLED
                                ? "Enable account"
                                : "Disable account"}
                            </MenuItem>

                            <MenuItem
                              danger
                              onClick={() => {
                                close();
                                setDeleting(u);
                              }}
                            >
                              Delete user
                            </MenuItem>
                          </div>
                        )}
                      </Menu>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>

        <div className="mt-4">
          <Pagination
            page={pg.page}
            pageCount={pg.pageCount}
            pageSize={pg.pageSize}
            onPageSize={pg.setPageSize}
            total={pg.total}
            from={pg.from}
            to={pg.to}
            onPage={pg.setPage}
            noun="external users"
          />
        </div>
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add external user">
        <AddForm districts={districts} onDone={() => setAdding(false)} />
      </Modal>

      <Modal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        title={`Assign districts — ${assigning?.name ?? ""}`}
      >
        {assigning && (
          <AssignForm
            user={assigning}
            districts={districts}
            onDone={() => setAssigning(null)}
          />
        )}
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete user">
        {deleting && (
          <div className="space-y-4">
            <p className="text-[13.5px] text-ink-soft">
              Delete <strong>{deleting.name}</strong>? This removes their account and
              every district grant they hold. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <form action={deleteExternalUser}>
                <input type="hidden" name="userId" value={deleting.id} />
                <Button
                  type="submit"
                  variant="danger"
                  onClick={() => setDeleting(null)}
                >
                  Delete user
                </Button>
              </form>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
