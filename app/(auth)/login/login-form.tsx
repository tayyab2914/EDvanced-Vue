"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    login,
    EMPTY_FORM_STATE,
  );

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h2 className="text-[22px] font-semibold text-ink">Sign in</h2>
          <p className="mt-1 text-[13.5px] text-muted">
            Access your district&apos;s finance workspace.
          </p>
        </div>
        {notice && <Alert tone="success">{notice}</Alert>}
        {state.error && <Alert tone="error">{state.error}</Alert>}
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
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="text-center text-sm">
          <Link
            href="/forgot-password"
            className="font-medium text-brand hover:text-brand-dark"
          >
            Forgot your password?
          </Link>
        </div>
      </div>
    </Card>
  );
}
