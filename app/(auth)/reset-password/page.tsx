import Link from "next/link";
import { peekVerificationToken } from "@/lib/tokens";
import { ResetForm } from "./reset-form";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? await peekVerificationToken(token) : null;

  if (!token || !valid) {
    return (
      <Card>
        <div className="space-y-4">
          <Alert tone="error">This link is invalid or has expired.</Alert>
          <div className="text-center text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-brand hover:text-brand-dark"
            >
              Request a new link
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return <ResetForm token={token} isInvite={valid.type === "INVITE"} />;
}
