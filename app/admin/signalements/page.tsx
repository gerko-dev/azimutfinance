import ReportsList from "@/components/admin/ReportsList";
import { requireAdmin } from "@/lib/admin/auth";
import { listReports } from "@/lib/admin/queries";
import type { ReportStatusFilter } from "@/lib/admin/types";

const VALID_STATUSES: ReportStatusFilter[] = ["open", "actioned", "dismissed", "all"];

export default async function ReportsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { level } = await requireAdmin(2);
  const sp = await searchParams;
  const requested = (sp.status ?? "open") as ReportStatusFilter;
  const status: ReportStatusFilter = VALID_STATUSES.includes(requested)
    ? requested
    : "open";

  const reports = await listReports({ status, limit: 200 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Signalements</h1>
        <p className="text-sm text-slate-500 mt-1">
          Messages signalés par les membres. Tous les niveaux d&apos;admin peuvent
          rejeter ; le niveau 1 et 2 peuvent aussi marquer comme traité après avoir
          appliqué une sanction depuis la modération ou le détail membre.
        </p>
      </div>

      <ReportsList reports={reports} myLevel={level} currentStatus={status} />
    </div>
  );
}
