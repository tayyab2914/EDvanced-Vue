"use client";

import { useActionState, useEffect, useState } from "react";
import { editUser } from "@/app/actions/users";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { ASSIGNABLE_ROLES } from "@/lib/validation/user";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function EditUserForm({
  districtId,
  user,
  onDone,
}: {
  districtId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    editUser,
    EMPTY_FORM_STATE,
  );

  const [email, setEmail] = useState(user.email);
  // Remember WHICH address was confirmed, not merely that one was. Typing further after
  // ticking the box moves the target, so the confirmation lapses on its own.
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);

  const trimmed = email.trim().toLowerCase();
  const emailChanged = trimmed !== user.email.toLowerCase();
  const confirmed = confirmedFor === trimmed;

  // onDone closes the modal — that's the parent's state, so it can't run during render.
  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="districtId" value={districtId} />
      <input type="hidden" name="userId" value={user.id} />
      <input
        type="hidden"
        name="confirmEmailChange"
        value={emailChanged && confirmed ? "true" : "false"}
      />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          htmlFor="e-first"
          error={state.fieldErrors?.firstName?.[0]}
        >
          <Input
            id="e-first"
            name="firstName"
            defaultValue={user.firstName}
            required
            autoComplete="off"
          />
        </Field>
        <Field
          label="Last name"
          htmlFor="e-last"
          error={state.fieldErrors?.lastName?.[0]}
        >
          <Input
            id="e-last"
            name="lastName"
            defaultValue={user.lastName}
            required
            autoComplete="off"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Email"
            hint="This is the address they sign in with."
            htmlFor="e-email"
            error={state.fieldErrors?.email?.[0]}
          >
            <Input
              id="e-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
        </div>
        <Field label="Role" htmlFor="e-role" error={state.fieldErrors?.role?.[0]}>
          <Select id="e-role" name="role" defaultValue={user.role}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {emailChanged && (
        <Alert tone="warning">
          <div className="space-y-2">
            <p>
              You are changing this user&apos;s sign-in address from{" "}
              <span className="font-medium">{user.email}</span> to{" "}
              <span className="font-medium">{trimmed}</span>.
            </p>
            <p>
              They will be signed out and{" "}
              <span className="font-medium">their current password will stop working</span>
              . An invite goes to the new address, and they must set a new password there
              before they can sign in again.
            </p>
            <label className="flex items-center gap-2 pt-0.5 font-medium">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmedFor(e.target.checked ? trimmed : null)}
                className="h-4 w-4 accent-brand"
              />
              Yes, change the email and reset their password
            </label>
          </div>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || (emailChanged && !confirmed)}>
          {pending ? "Saving…" : emailChanged ? "Save & send new invite" : "Save"}
        </Button>
      </div>
    </form>
  );
}
