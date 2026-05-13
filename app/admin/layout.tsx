import Header from "@/components/Header";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getOpenReportsCount,
  getOpenForumReportsCount,
} from "@/lib/admin/queries";
import { ROLE_LABEL } from "@/lib/admin/types";

export const metadata = {
  title: "Administration — AzimutFinance",
  description: "Console d'administration AzimutFinance.",
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Niveau minimum pour entrer dans /admin : level 3 (modérateur).
  // Les pages individuelles peuvent re-checker un niveau plus restrictif.
  const { level } = await requireAdmin(3);
  const [openReportsCount, openForumReportsCount] = await Promise.all([
    getOpenReportsCount(),
    getOpenForumReportsCount(),
  ]);

  const roleKey = `adminlevel${level}` as keyof typeof ROLE_LABEL;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* Bandeau admin */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-wide uppercase text-slate-400">
              Admin
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-white">{ROLE_LABEL[roleKey]}</span>
          </div>
          <div className="text-slate-400">
            Toutes les actions sont consignées dans le journal d&apos;audit.
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          <aside>
            <AdminSidebar
              level={level}
              openReportsCount={openReportsCount}
              openForumReportsCount={openForumReportsCount}
            />
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
