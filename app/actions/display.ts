"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { isLabelMode, LABEL_MODES } from "@/lib/text";
import { LABEL_MODE_COOKIE, LABEL_MODE_MAX_AGE } from "@/lib/dashboard/label-mode";
import type { FormState } from "@/lib/forms";

/**
 * The reader's own display preference: Codes Only, Names Only, or Codes + Names.
 *
 * NOT AUDITED, unlike every other write in app/actions. The audit log records what a person
 * did to the district's data or to someone's access; this changes how many characters they
 * see in their own browser, affects nobody else, and logging it would only make the log
 * harder to read. Same reasoning as the note in app/actions/saved-views.ts about what a
 * preference is — except this one really is per-user, so it never leaves the cookie.
 *
 * `requireAuth` is still here. The cookie is harmless, but an action that writes a response
 * header on an unauthenticated request is a thing to have on purpose rather than by
 * omission.
 */
export async function setLabelMode(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();

  const mode = formData.get("mode");
  if (!isLabelMode(mode)) return { error: "That is not one of the display options." };

  const store = await cookies();
  store.set(LABEL_MODE_COOKIE, mode, {
    // Read only by the server (lib/dashboard/label-mode.ts), so the browser has no reason
    // to hand it to script.
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: LABEL_MODE_MAX_AGE,
    path: "/",
  });

  // Every dashboard, table and chart is server-rendered, so the whole tree has to re-render
  // for the change to be visible — not just the page holding the control.
  revalidatePath("/", "layout");

  const chosen = LABEL_MODES.find((m) => m.value === mode)!;
  return { success: `Dimension fields now show ${chosen.label}.` };
}
