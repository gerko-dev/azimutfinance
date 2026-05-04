import AuthorsManager from "@/components/admin/AuthorsManager";
import { listAuthors } from "@/lib/magazine/queries";
import { listMembers } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AuthorsAdminPage() {
  const [authors, members] = await Promise.all([
    listAuthors(),
    listMembers({ limit: 200 }),
  ]);
  // On ne propose que les administrateurs comme candidats à la liaison
  const admins = members.filter((m) =>
    ["adminlevel1", "adminlevel2", "adminlevel3"].includes(m.role),
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Les auteurs signent les articles. Vous pouvez créer des auteurs autonomes
        (rédaction, contributeurs externes) ou lier un auteur à un compte administrateur
        pour qu&apos;il signe ses propres articles.
      </p>
      <AuthorsManager authors={authors} admins={admins} />
    </div>
  );
}
