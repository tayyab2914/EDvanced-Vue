"use client";

import { useActionState } from "react";
import { createUser } from "@/app/actions/users";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { ASSIGNABLE_ROLES } from "@/lib/validation/user";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function AddUserForm({ districtId }: { districtId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createUser,
    EMPTY_FORM_STATE,
  );

  return (
    <Card>
      <form action={action} className="space-y-4">
        <input type="hidden" name="districtId" value={districtId} />
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {state.success && (
          <Alert tone="success">
            <span className="whitespace-pre-line break-all">{state.success}</span>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="u-name" error={state.fieldErrors?.name?.[0]}>
            <Input id="u-name" name="name" required />
          </Field>
          <Field
            label="Email"
            htmlFor="u-email"
            error={state.fieldErrors?.email?.[0]}
          >
            <Input id="u-email" name="email" type="email" required />
          </Field>
          <Field label="Role" htmlFor="u-role" error={state.fieldErrors?.role?.[0]}>
            <Select id="u-role" name="role" defaultValue="VIEWER">
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Send invitation"}
        </Button>
      </form>
    </Card>
  );
}
