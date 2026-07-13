"use client";

import { useActionState, useEffect, useState } from "react";
import {
  approveAccess,
  changeAccessLevel,
  denyAccess,
  extendAccess,
  inviteExternalUser,
  revokeAccess,
} from "@/app/actions/external-access";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_LABELS,
  GRANT_STATE_LABELS,
  GRANT_STATE_TONES,
  MAX_ACCESS_DAYS,
  daysUntil,
  deriveGrantState,
  maxExpiryDate,
  minExpiryDate,
  toDateInputValue,
} from "@/lib/external-access";
import { formatDate } from "@/lib/format";
import type { ExternalAccessLevel, ExternalAccessStatus } from "@/lib/enums";

export interface GrantRow {
  id: string;
  status: ExternalAccessStatus;
  level: ExternalAccessLevel | null;
  expiresAt: string | null;
  createdAt: string;
  user: {
    name: string;
    email: string;
    status: string;
    lastLoginAt: string | null;
  };
}

/**
 * The expiry field. A native date input — no picker dependency — bounded to today..+30d so
 * the 30-day rule is visible in the UI. The same rule is re-checked server-side; these
 * attributes are a hint, not the enforcement.
 */
function ExpiryField({
  error,
  defaultToMax = true,
}: {
  error?: string[];
  defaultToMax?: boolean;
}) {
  const min = toDateInputValue(minExpiryDate());
  const max = toDateInputValue(maxExpiryDate());
  return (
    <Field
      label="Access expires"
      hint={`Up to ${MAX_ACCESS_DAYS} days from today. You can extend or revoke this later.`}
      error={error?.[0]}
    >
      <Input
        type="date"
        name="expiresAt"
        required
        min={min}
        max={max}
        defaultValue={defaultToMax ? max : undefined}
      />
    </Field>
  );
}

function LevelField({ error }: { error?: string[] }) {
  return (
    <Field
      label="Permission level"
      hint="View only can read and export. Full access can also add and edit master data."
      error={error?.[0]}
    >
      <Select name="level" defaultValue="VIEW_ONLY">
        {ACCESS_LEVELS.map((l) => (
          <option key={l} value={l}>
            {ACCESS_LEVEL_LABELS[l]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Closes the modal once the action reports success (never during render). */
function useCloseOnSuccess(success: string | undefined, onDone: () => void) {
  useEffect(() => {
    if (success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);
}

function ApproveForm({ grant, onDone }: { grant: GrantRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(approveAccess, EMPTY_FORM_STATE);
  useCloseOnSuccess(state.success, onDone);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="grantId" value={grant.id} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <p className="text-[13px] text-muted-2">
        Granting <strong className="text-ink">{grant.user.name}</strong> (
        {grant.user.email}) access to your district&apos;s data.
      </p>
      <LevelField error={state.fieldErrors?.level} />
      <ExpiryField error={state.fieldErrors?.expiresAt} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Approving…" : "Approve access"}
        </Button>
      </div>
    </form>
  );
}

function ExtendForm({ grant, onDone }: { grant: GrantRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(extendAccess, EMPTY_FORM_STATE);
  useCloseOnSuccess(state.success, onDone);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="grantId" value={grant.id} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <p className="text-[13px] text-muted-2">
        {grant.user.name}&apos;s access currently runs until{" "}
        <strong className="text-ink">{formatDate(grant.expiresAt)}</strong>.
      </p>
      <ExpiryField error={state.fieldErrors?.expiresAt} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Extend access"}
        </Button>
      </div>
    </form>
  );
}

function ChangeLevelForm({ grant, onDone }: { grant: GrantRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(changeAccessLevel, EMPTY_FORM_STATE);
  useCloseOnSuccess(state.success, onDone);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="grantId" value={grant.id} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field
        label="Permission level"
        hint="View only can read and export. Full access can also add and edit master data."
        error={state.fieldErrors?.level?.[0]}
      >
        <Select name="level" defaultValue={grant.level ?? "VIEW_ONLY"}>
          {ACCESS_LEVELS.map((l) => (
            <option key={l} value={l}>
              {ACCESS_LEVEL_LABELS[l]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function InviteForm({
  districtId,
  onDone,
}: {
  districtId: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(inviteExternalUser, EMPTY_FORM_STATE);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="districtId" value={districtId} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && (
        <Alert tone="success">
          <span className="whitespace-pre-line">{state.success}</span>
        </Alert>
      )}
      <p className="text-[13px] text-muted-2">
        You&apos;re inviting them, so no approval is needed — their access starts
        immediately.
      </p>
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
      <LevelField error={state.fieldErrors?.level} />
      <ExpiryField error={state.fieldErrors?.expiresAt} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Close
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Grant access"}
        </Button>
      </div>
    </form>
  );
}

/** A plain submit button inside its own form — for the void-returning actions. */
function ActionForm({
  action,
  grantId,
  children,
}: {
  action: (formData: FormData) => void;
  grantId: string;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="grantId" value={grantId} />
      {children}
    </form>
  );
}

export function ExternalAccessManager({
  districtId,
  grants,
}: {
  districtId: string;
  grants: GrantRow[];
}) {
  const [inviting, setInviting] = useState(false);
  const [approving, setApproving] = useState<GrantRow | null>(null);
  const [extending, setExtending] = useState<GrantRow | null>(null);
  const [leveling, setLeveling] = useState<GrantRow | null>(null);
  const [revoking, setRevoking] = useState<GrantRow | null>(null);

  const now = new Date();
  const pending = grants.filter((g) => g.status === "PENDING");
  // Everything already decided — active, expired, denied or revoked.
  const decided = grants.filter((g) => g.status !== "PENDING");

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setInviting(true)}>Invite external user</Button>
      </div>

      {/* ---- Pending requests ------------------------------------------------ */}
      {pending.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[14.5px] font-semibold text-ink">
              Pending requests
            </h2>
            <Badge tone="amber">{pending.length}</Badge>
          </div>
          <p className="mb-4 text-[13px] text-muted-2">
            These people have been assigned to your district by the platform team. They
            cannot see any of your data until you approve them.
          </p>
          <div className="space-y-2.5">
            {pending.map((g) => (
              <div
                key={g.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-panel px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">
                    {g.user.name}
                  </div>
                  <div className="truncate text-[12.5px] text-muted-2">
                    {g.user.email} · requested {formatDate(g.createdAt)}
                  </div>
                </div>
                <div className="flex flex-none gap-2">
                  <ActionForm action={denyAccess} grantId={g.id}>
                    <Button type="submit" variant="secondary" size="sm">
                      Deny
                    </Button>
                  </ActionForm>
                  <Button size="sm" onClick={() => setApproving(g)}>
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---- Everything already decided -------------------------------------- */}
      <Card>
        <h2 className="mb-3 text-[14.5px] font-semibold text-ink">
          External access
        </h2>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Permission</TH>
              <TH>Status</TH>
              <TH>Expires</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {decided.length === 0 ? (
              <EmptyRow colSpan={6}>
                No external users yet. Invite one, or approve a pending request.
              </EmptyRow>
            ) : (
              decided.map((g) => {
                // An ACTIVE row past its expiry reads as EXPIRED — never trust status alone.
                const state = deriveGrantState(
                  { status: g.status, expiresAt: g.expiresAt },
                  now,
                );
                const isLive = state === "ACTIVE";
                const left = g.expiresAt ? daysUntil(g.expiresAt, now) : null;

                return (
                  <TR key={g.id}>
                    <TD>{g.user.name}</TD>
                    <TD>
                      <span className="text-ink-soft">{g.user.email}</span>
                    </TD>
                    <TD>
                      {g.level ? (
                        <Badge tone="blue">{ACCESS_LEVEL_LABELS[g.level]}</Badge>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <Badge tone={GRANT_STATE_TONES[state]}>
                        {GRANT_STATE_LABELS[state]}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-muted">
                      {g.expiresAt ? (
                        <>
                          {formatDate(g.expiresAt)}
                          {isLive && left !== null && left <= 7 && (
                            <span className="ml-1.5 text-[12px] font-medium text-warn">
                              {left <= 0 ? "today" : `${left}d left`}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end">
                        {isLive ? (
                          <Menu
                            align="right"
                            triggerLabel={`Actions for ${g.user.name}`}
                            trigger={
                              <span className="flex h-8 w-8 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-line-soft hover:text-ink">
                                ⋮
                              </span>
                            }
                          >
                            {(close) => (
                              <div className="w-52 py-1">
                                <MenuItem
                                  onClick={() => {
                                    close();
                                    setLeveling(g);
                                  }}
                                >
                                  Change permission
                                </MenuItem>
                                <MenuItem
                                  onClick={() => {
                                    close();
                                    setExtending(g);
                                  }}
                                >
                                  Extend access
                                </MenuItem>
                                <MenuItem
                                  danger
                                  onClick={() => {
                                    close();
                                    setRevoking(g);
                                  }}
                                >
                                  Revoke access
                                </MenuItem>
                              </div>
                            )}
                          </Menu>
                        ) : (
                          <span className="text-[12.5px] text-muted-2">—</span>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </Card>

      {/* ---- Modals ---------------------------------------------------------- */}
      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite external user"
      >
        <InviteForm districtId={districtId} onDone={() => setInviting(false)} />
      </Modal>

      <Modal
        open={!!approving}
        onClose={() => setApproving(null)}
        title="Approve access"
      >
        {approving && (
          <ApproveForm grant={approving} onDone={() => setApproving(null)} />
        )}
      </Modal>

      <Modal
        open={!!extending}
        onClose={() => setExtending(null)}
        title="Extend access"
      >
        {extending && (
          <ExtendForm grant={extending} onDone={() => setExtending(null)} />
        )}
      </Modal>

      <Modal
        open={!!leveling}
        onClose={() => setLeveling(null)}
        title="Change permission level"
      >
        {leveling && (
          <ChangeLevelForm grant={leveling} onDone={() => setLeveling(null)} />
        )}
      </Modal>

      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revoke access"
      >
        {revoking && (
          <div className="space-y-4">
            <p className="text-[13.5px] text-ink-soft">
              Revoke <strong>{revoking.user.name}</strong>&apos;s access to your
              district? They lose access immediately. This does not affect any other
              district they work with.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRevoking(null)}>
                Cancel
              </Button>
              <ActionForm action={revokeAccess} grantId={revoking.id}>
                <Button
                  type="submit"
                  variant="danger"
                  onClick={() => setRevoking(null)}
                >
                  Revoke access
                </Button>
              </ActionForm>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
