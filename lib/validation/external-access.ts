import * as z from "zod";
import {
  MAX_ACCESS_DAYS,
  maxExpiryDate,
  minExpiryDate,
  parseExpiryDate,
} from "@/lib/external-access";

const firstName = z
  .string()
  .trim()
  .min(1, { error: "First name is required." })
  .max(60);
const lastName = z
  .string()
  .trim()
  .min(1, { error: "Last name is required." })
  .max(60);
const email = z.email({ error: "Enter a valid email address." }).trim();

const level = z.enum(["VIEW_ONLY", "FULL_ACCESS"], {
  error: "Choose a permission level.",
});

/**
 * The expiry field is a native <input type="date"> ("YYYY-MM-DD"). We parse it as the END of
 * that calendar day in server-local time, so "today" means "through the end of today" rather
 * than "already expired", and the browser-legal max can't fail this check by a few hours.
 *
 * The 30-day ceiling is measured from TODAY, which is what makes an extension "up to 30 days
 * from the update" fall out for free — the same schema bounds both approval and extension.
 */
const expiresAt = z
  .string()
  .trim()
  .min(1, { error: "Choose an expiry date." })
  .transform((s, ctx) => {
    const date = parseExpiryDate(s);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return date;
  })
  .refine((d) => d.getTime() >= minExpiryDate().getTime(), {
    error: "The expiry date can't be in the past.",
  })
  .refine((d) => d.getTime() <= parseExpiryDate(dateKey(maxExpiryDate()))!.getTime(), {
    error: `Access can't be granted for more than ${MAX_ACCESS_DAYS} days at a time.`,
  });

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** District approves a pending request: pick the level and how long it lasts. */
export const approveAccessSchema = z.object({ level, expiresAt });

/** District pushes the expiry out (again capped at 30 days from today). */
export const extendAccessSchema = z.object({ expiresAt });

/** District changes an existing grant's permission level. */
export const changeLevelSchema = z.object({ level });

/** District invites an external user directly — pre-approved, so level + expiry up front. */
export const externalInviteSchema = z.object({
  firstName,
  lastName,
  email,
  level,
  expiresAt,
});

/** Platform admin adds an external user and assigns the districts to ask. */
export const platformExternalUserSchema = z.object({
  firstName,
  lastName,
  email,
  districtIds: z
    .array(z.string().min(1))
    .min(1, { error: "Select at least one district." }),
});
