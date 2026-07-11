"use client";

import { useActionState, useState } from "react";
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
  user: { id: string; firstName: string; lastName: string; role: string };
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    editUser,
    EMPTY_FORM_STATE,
  );

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) onDone();
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="districtId" value={districtId} />
      <input type="hidden" name="userId" value={user.id} />
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
