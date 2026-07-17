"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { Role, ActivityClass } from "@/lib/enums";
import type { FormState } from "@/lib/forms";

/**
 * Which object codes mean "transfer".
 *
 * Platform-managed, like every other global lookup — the Red Book is the standardised
 * core, so "9700 is a transfer out" is a fact about the chart of accounts rather than a
 * district's opinion. Every district shares this list.
 */

const schema = z
  .object({
    activityClass: z.enum(
      [
        ActivityClass.TRANSFERS_IN,
        ActivityClass.TRANSFERS_OUT,
        ActivityClass.OTHER_FINANCING_SOURCES,
      ],
      { error: "Choose which kind of activity these codes are." },
    ),
    codeFrom: z.string().trim().min(1, { error: "Enter a code." }).max(40),
    codeTo: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v ? v : undefined)),
    note: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine(
    (v) => {
      if (!v.codeTo) return true;
      // A range is only meaningful between numbers — the matcher compares them
      // numerically, precisely so that "97000" doesn't fall inside "9700".."9799".
      return /^\d+$/.test(v.codeFrom) && /^\d+$/.test(v.codeTo);
    },
    { error: "A range needs numeric codes at both ends.", path: ["codeTo"] },
  );

export async function addActivityCode(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole(Role.PLATFORM_ADMIN);

  const parsed = schema.safeParse({
    activityClass: formData.get("activityClass"),
    codeFrom: formData.get("codeFrom"),
    codeTo: formData.get("codeTo"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await prisma.financialActivityCode.create({
      data: {
        activityClass: parsed.data.activityClass,
        codeFrom: parsed.data.codeFrom,
        codeTo: parsed.data.codeTo ?? null,
        note: parsed.data.note ?? null,
      },
    });
  } catch {
    return { error: "That code or range is already classified." };
  }

  await writeAudit({
    action: "ACTIVITY_CODE_CREATED",
    actorUserId: user.id,
    entityType: "Financial activity code",
    metadata: { ...parsed.data },
  });

  revalidatePath("/platform/activity-codes");
  return {
    success: parsed.data.codeTo
      ? `Codes ${parsed.data.codeFrom}–${parsed.data.codeTo} classified.`
      : `Code ${parsed.data.codeFrom} classified.`,
  };
}

export async function deleteActivityCode(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole(Role.PLATFORM_ADMIN);
  const id = String(formData.get("id") ?? "");

  const row = await prisma.financialActivityCode.findUnique({ where: { id } });
  if (!row) return { error: "That classification no longer exists." };

  await prisma.financialActivityCode.deleteMany({ where: { id } });

  await writeAudit({
    action: "ACTIVITY_CODE_DELETED",
    actorUserId: user.id,
    entityType: "Financial activity code",
    entityId: id,
    metadata: { activityClass: row.activityClass, codeFrom: row.codeFrom, codeTo: row.codeTo },
  });

  revalidatePath("/platform/activity-codes");
  return { success: "Classification removed." };
}
