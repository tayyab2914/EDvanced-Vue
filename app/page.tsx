import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { homePathForRole } from "@/lib/auth/routes";

// Root dispatcher: send authenticated users to their role home (proxy sends
// unauthenticated users to /login before this runs).
export default async function Home() {
  const user = await requireAuth();
  redirect(homePathForRole(user.role));
}
