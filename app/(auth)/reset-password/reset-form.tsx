"use client";

import { useActionState } from "react";
import { setPassword } from "@/app/actions/auth";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { PASSWORD_HINT } from "@/lib/validation/auth";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function ResetForm({
  token,
  isInvite,
}: {
  token: string;
  isInvite: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setPassword,
    EMPTY_FORM_STATE,
  );

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h2 className="text-[22px] font-semibold text-ink">
            {isInvite ? "Activate your account" : "Set a new password"}
          </h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            {isInvite
              ? "Welcome! Choose a password to activate your account."
              : "Choose a new password for your account."}
          </p>
        </div>
        {state.error && <Alert tone="error">{state.error}</Alert>}
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <Field label="New password" htmlFor="password" hint={PASSWORD_HINT}>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
            />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending
              ? "Saving…"
              : isInvite
                ? "Activate account"
                : "Reset password"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
