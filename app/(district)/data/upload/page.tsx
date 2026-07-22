import { redirect } from "next/navigation";
import { getTenantDb, userCan } from "@/lib/auth/dal";
import { datasetsByRhythm, type DatasetMeta } from "@/lib/datasets/kinds";
import { datasetDef, templateHeaders } from "@/lib/datasets/registry";
import { fiscalYearFor, parseFiscalYear, formatFiscalYear } from "@/lib/periods/fiscal";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { UploadForm } from "@/components/import/upload-form";
import {
  ImportTemplates,
  type TemplateItem,
} from "@/components/import/import-templates";

export default async function UploadPage() {
  const { db, user, districtId } = await getTenantDb();

  // Reading the data is a view permission; uploading is not. A Viewer reaching this URL
  // directly goes to the history, which is what they actually have access to.
  if (!userCan(user, "upload_data")) redirect("/data/versions");

  const district = await db.district.findFirst({
    where: { id: districtId },
    select: { fiscalYearStartMonth: true },
  });
  const startMonth = district?.fiscalYearStartMonth ?? 7;

  // The current fiscal year, plus one back and one forward: a district closing out last
  // year and one already budgeting for next are both normal in July.
  const current = parseFiscalYear(fiscalYearFor(new Date(), startMonth))!;
  const fiscalYears = [
    formatFiscalYear(current.startYear + 1),
    formatFiscalYear(current.startYear),
    formatFiscalYear(current.startYear - 1),
  ];

  const datasets = datasetsByRhythm();
  const toTemplates = (metas: DatasetMeta[]): TemplateItem[] =>
    metas.map((m) => ({
      slug: m.slug,
      label: m.label,
      description: m.description,
      headers: templateHeaders(datasetDef(m.slug)),
    }));

  return (
    <div className="animate-fade-up space-y-[18px]">
      <PageHeader
        title="Upload data"
        description="One dataset per file. We'll validate it against your master data before anything is imported."
      />
      <Card>
        <UploadForm
          datasets={datasets}
          fiscalYears={fiscalYears}
          startMonth={startMonth}
          districtId={districtId}
        />
      </Card>
      <Card>
        <ImportTemplates
          annual={toTemplates(datasets.annual)}
          monthly={toTemplates(datasets.monthly)}
        />
      </Card>
    </div>
  );
}
