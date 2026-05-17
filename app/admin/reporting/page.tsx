import { requireAdmin } from "@/lib/admin/auth";
import ReportingClient from "./ReportingClient";

export const dynamic = "force-dynamic";

export default async function AdminReportingPage() {
  // Reserve aux super-admins (N1).
  await requireAdmin(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Reporting réseaux sociaux
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Génère des PDF prêts à publier sur LinkedIn, X, Facebook ou
          Instagram. Format A4 portrait, charte AzimutFinance, données live.
        </p>
      </div>

      <ReportingClient />
    </div>
  );
}
