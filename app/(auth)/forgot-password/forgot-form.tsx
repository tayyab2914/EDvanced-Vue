"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    requestPasswordReset,
    EMPTY_FORM_STATE,
  );

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h2 className="text-[22px] font-semibold text-ink">
            Reset your password
          </h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            Enter your work email and we&apos;ll send a secure reset link.
          </p>
        </div>
        {state.success && <Alert tone="success">{state.success}</Alert>}
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {!state.success && (
          <form action={action} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
              />
            </Field>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <div className="text-center text-sm">
          <Link
            href="/login"
            className="font-medium text-brand hover:text-brand-dark"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </Card>
  );
}
