// Pure, client-safe helpers for external-user access grants (no server-only imports,
// no Prisma client) so both Server Components and Client Components can share them.
//
// THE RULE: "expired" is DERIVED, never stored. A grant is live only when it is ACTIVE
// *and* `expiresAt` is still in the future. Nothing sweeps lapsed rows, so every read
// path must apply this rule — always via `isGrantLive` / `deriveGrantState` here, never
// by hand-rolling a `status === "ACTIVE"` check.

import {
  DistrictStatus,
  ExternalAccessLevel,
  ExternalAccessStatus,
} from "@/lib/enums";
import type { Prisma } from "@/lib/generated/prisma/client";

/** A district may never grant more than 30 days of access at a time. */
export const MAX_ACCESS_DAYS = 30;

/** Warn the user in-app once their access is this close to lapsing. */
export const EXPIRY_WARNING_DAYS = 7;

/** The stored status plus the one state that is computed rather than persisted. */
export type GrantState = ExternalAccessStatus | "EXPIRED";

export interface GrantLike {
  status: ExternalAccessStatus;
  expiresAt: Date | string | null;
}

function toDate(d: Date | string | null): Date | null {
  if (!d) return null;
  return typeof d === "string" ? new Date(d) : d;
}

/** True only for a grant that actually confers access right now. */
export function isGrantLive(grant: GrantLike, now: Date = new Date()): boolean {
  if (grant.status !== ExternalAccessStatus.ACTIVE) return false;
  const expiresAt = toDate(grant.expiresAt);
  // An ACTIVE grant with no expiry should not exist (approval always sets one). Treat
  // it as not-live rather than as unlimited access — fail closed.
  return expiresAt !== null && expiresAt.getTime() > now.getTime();
}

/**
 * `isGrantLive`, expressed as a Prisma `where` fragment so the SAME rule is enforced in SQL.
 * Kept adjacent to `isGrantLive` on purpose: if one changes, the other is right there.
 *
 * The district-status clause matters — an external user's `User.districtId` is NULL, so the
 * DAL's usual "is your district active?" check does not cover them; it has to live here.
 */
export function liveGrantWhere(
  now: Date = new Date(),
): Prisma.ExternalAccessWhereInput {
  return {
    status: ExternalAccessStatus.ACTIVE,
    expiresAt: { gt: now },
    district: { status: DistrictStatus.ACTIVE },
  };
}

/** The status to show a human: ACTIVE only when still live, else EXPIRED. */
export function deriveGrantState(
  grant: GrantLike,
  now: Date = new Date(),
): GrantState {
  if (grant.status === ExternalAccessStatus.ACTIVE && !isGrantLive(grant, now)) {
    return "EXPIRED";
  }
  return grant.status;
}

export const GRANT_STATE_LABELS: Record<GrantState, string> = {
  PENDING: "Awaiting approval",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  DENIED: "Denied",
  REVOKED: "Revoked",
};

type Tone = "gray" | "green" | "red" | "amber" | "blue" | "indigo";

export const GRANT_STATE_TONES: Record<GrantState, Tone> = {
  PENDING: "amber",
  ACTIVE: "green",
  EXPIRED: "gray",
  DENIED: "red",
  REVOKED: "red",
};

export const ACCESS_LEVEL_LABELS: Record<ExternalAccessLevel, string> = {
  VIEW_ONLY: "View only",
  FULL_ACCESS: "Full access",
};

export const ACCESS_LEVELS = [
  ExternalAccessLevel.VIEW_ONLY,
  ExternalAccessLevel.FULL_ACCESS,
] as const;

// ---------------------------------------------------------------------------
// Expiry dates.
//
// The form field is a native <input type="date">, which yields "YYYY-MM-DD". Parsing that
// with `new Date()` gives UTC midnight, while the input's own min/max were computed in the
// BROWSER's timezone — so a naive `expiresAt <= now + 30d` check disagrees with the picker
// by up to a day in either direction. We sidestep the whole class of bug by treating a
// calendar day as inclusive: an expiry date means "end of that day".
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" for a date input's value/min/max attributes. */
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parses "YYYY-MM-DD" as the END of that calendar day, so today never means "already expired". */
export function parseExpiryDate(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    23,
    59,
    59,
    999,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The earliest expiry a district may pick: today (i.e. access through end of today). */
export function minExpiryDate(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** The latest expiry a district may pick: MAX_ACCESS_DAYS from today, measured in whole days. */
export function maxExpiryDate(now: Date = new Date()): Date {
  const d = minExpiryDate(now);
  d.setDate(d.getDate() + MAX_ACCESS_DAYS);
  return d;
}

/** Whole days from now until the grant lapses (negative once it has). */
export function daysUntil(expiresAt: Date | string, now: Date = new Date()): number {
  const end = toDate(expiresAt)!;
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}
