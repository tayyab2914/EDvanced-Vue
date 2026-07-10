import { NextRequest, NextResponse } from "next/server";
import { decryptSession } from "@/lib/auth/jwt";

// Next.js 16: request interception lives in `proxy.ts` (was middleware.ts), runs on
// the Node.js runtime. This does OPTIMISTIC checks only (cookie signature/expiry) —
// no DB. The authoritative checks live in the DAL and every Server Action.

const PUBLIC_ROUTES = ["/login", "/forgot-password", "/reset-password"];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some(
    (r) => path === r || path.startsWith(`${r}/`),
  );

  const session = await decryptSession(req.cookies.get("session")?.value);
  const isAuthed = !!session?.userId;

  // Unauthenticated user hitting a protected route → login.
  // NOTE: this is an optimistic (cookie-only) check. We intentionally do NOT
  // redirect authenticated users away from public routes here — the cookie's JWT
  // can be valid while the DB session is revoked or the account is disabled, and
  // bouncing /login → / would loop against the secure check in the DAL. The
  // "already signed in → go home" redirect lives in the login page instead,
  // where it can verify the session against the database.
  if (!isPublic && !isAuthed) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
