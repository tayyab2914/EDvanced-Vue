import type { TenantDb } from "@/lib/tenant-db";
import type { DatasetKind, ImportAction } from "@/lib/enums";

/**
 * "This reporting period already has data uploaded."
 *
 * Step 5 of the lifecycle (Spec §7). Asked AFTER validation, not before: there is no
 * point making a district choose how to handle a re-upload of a file that turns out to
 * be unreadable.
 */

export interface ExistingVersion {
  id: string;
  version: number;
  rowCount: number;
  fileName: string;
  committedAt: Date;
  committedByUserId: string;
}

export interface DuplicateCheck {
  /** True when this district+dataset+year+period already has a current version. */
  exists: boolean;
  existing?: ExistingVersion;
  /** What this upload would become. 1 when nothing is there yet. */
  nextVersion: number;
  /** The only actions the user may pick from here. */
  choices: ImportAction[];
}

/**
 * The client's own words, from Spec §5.8. Not paraphrased — they wrote this sentence,
 * and it is the one place the product speaks in their voice rather than ours.
 */
export const DUPLICATE_PROMPT =
  "This reporting period already has data uploaded. Do you want to replace the existing data, cancel the upload, or keep it as a new version?";

export async function checkDuplicate(
  db: TenantDb,
  args: {
    dataset: DatasetKind;
    fiscalYear: string;
    period: number | null;
  },
): Promise<DuplicateCheck> {
  const versions = await db.datasetVersion.findMany({
    where: { dataset: args.dataset, fiscalYear: args.fiscalYear, period: args.period },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      isCurrent: true,
      rowCount: true,
      fileName: true,
      committedAt: true,
      committedByUserId: true,
    },
  });

  // Highest version number, not the current one: after a restore the current version can
  // be an OLDER number, and handing v2's number to a new upload would collide with the
  // one that already exists.
  const nextVersion = versions.length > 0 ? versions[0].version + 1 : 1;
  const current = versions.find((v) => v.isCurrent);

  if (!current) {
    return { exists: false, nextVersion, choices: ["INITIAL"] };
  }

  return {
    exists: true,
    nextVersion,
    existing: {
      id: current.id,
      version: current.version,
      rowCount: current.rowCount,
      fileName: current.fileName,
      committedAt: current.committedAt,
      committedByUserId: current.committedByUserId,
    },
    // CANCELLED is not here: cancelling is not a way of committing, it discards the
    // batch. The UI offers all three; only these two reach the commit path.
    choices: ["REPLACED", "NEW_VERSION"],
  };
}

/**
 * Guards the action a request asked for against what is actually on offer.
 *
 * Worth doing even though the UI only shows the valid buttons: the action is a form
 * field, and "the form only sends good values" is not a security model. Committing
 * INITIAL over an existing period would silently leave two current versions — which the
 * partial unique index would refuse anyway, but with a database error rather than a
 * sentence.
 */
export function isChoiceAllowed(check: DuplicateCheck, action: ImportAction): boolean {
  return check.choices.includes(action);
}
