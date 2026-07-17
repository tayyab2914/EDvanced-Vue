"use client";

import { useActionState } from "react";
import { updateMyName, changeMyPassword } from "@/app/actions/account";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { PASSWORD_HINT } from "@/lib/validation/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function NameForm({
  firstName,
  lastName,
  email,
}: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateMyName,
    EMPTY_FORM_STATE,
  );

  return (
    <Card>
      <h2 className="text-[15px] font-semibold">Your details</h2>
      <p className="mt-0.5 mb-4 text-[12.5px] text-muted-2">
        This is the name shown beside anything you do — uploads, approvals, the audit log.
      </p>

      {state.error && (
        <div className="mb-4">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
      {state.success && (
        <div className="mb-4">
          <Alert tone="success">{state.success}</Alert>
        </div>
      )}

      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={state.fieldErrors?.firstName?.[0]}>
            <Input id="firstName" name="firstName" defaultValue={firstName} required />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={state.fieldErrors?.lastName?.[0]}>
            <Input id="lastName" name="lastName" defaultValue={lastName} required />
          </Field>
        </div>

        <Field label="Email" htmlFor="email">
          <Input id="email" value={email} disabled />
          {/* Changing it would re-open the verification and invitation flows, and an email
              is also an identity — that belongs with an administrator, not a text box. */}
          <p className="mt-1.5 text-[11.5px] text-muted-2">
            Ask an administrator to change your email address.
          </p>
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changeMyPassword,
    EMPTY_FORM_STATE,
  );

  return (
    <Card>
      <h2 className="text-[15px] font-semibold">Password</h2>
      <p className="mt-0.5 mb-4 text-[12.5px] text-muted-2">
        Changing it signs you out on every other device.
      </p>

      {state.error && (
        <div className="mb-4">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
      {state.success && (
        <div className="mb-4">
          <Alert tone="success">{state.success}</Alert>
        </div>
      )}

      {/* key on success so the fields clear once it worked — leaving a password sitting
          in an input after a successful change is careless. */}
      <form key={state.success ?? "form"} action={action} className="space-y-4">
        <Field
          label="Current password"
          htmlFor="current"
          error={state.fieldErrors?.current?.[0]}
        >
          <Input id="current" name="current" type="password" autoComplete="current-password" required />
        </Field>
        <Field
          label="New password"
          htmlFor="next"
          hint={PASSWORD_HINT}
          error={state.fieldErrors?.next?.[0]}
        >
          <Input id="next" name="next" type="password" autoComplete="new-password" required />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="confirm"
          error={state.fieldErrors?.confirm?.[0]}
        >
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </form>
    </Card>
  );
}
