import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { homePathForRole } from "@/lib/auth/routes";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  // Secure (DB-backed) check: only a genuinely valid session bounces to home.
  // A stale cookie (revoked session / disabled account) falls through to the form.
  const user = await getCurrentUser();
  if (user) redirect(homePathForRole(user.role));

  const sp = await searchParams;
  const notice = sp.reset
    ? "Your password has been set. Please sign in."
    : undefined;
  return <LoginForm notice={notice} />;
}
