import Link from "next/link";
import MagazineSubNav from "@/components/admin/MagazineSubNav";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function MagazineAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(3);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/admin" className="hover:text-slate-700">Admin</Link>{" "}
          &rsaquo; <span className="text-slate-700">Magazine</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Azimut Magazine</h1>
        <p className="text-sm text-slate-500 mt-1">
          Numéros, articles, auteurs et abonnés newsletter.
        </p>
      </div>
      <MagazineSubNav />
      <div>{children}</div>
    </div>
  );
}
