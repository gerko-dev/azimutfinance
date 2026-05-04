import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import AccountForm from "@/components/academie/compte-titre/AccountForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyAccount, listTpsRates } from "@/lib/comptetitre/queries";

export const dynamic = "force-dynamic";

export default async function ParametresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?redirect=/academie/compte-titre/${id}/parametres`);

  const [account, tpsRates] = await Promise.all([
    getMyAccount(id),
    listTpsRates(),
  ]);
  if (!account) notFound();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-6 space-y-4">
        <div className="text-xs text-slate-500">
          <Link href="/academie/compte-titre" className="hover:text-slate-700">
            Suivi de compte titre
          </Link>{" "}
          &rsaquo;{" "}
          <Link
            href={`/academie/compte-titre/${id}`}
            className="hover:text-slate-700"
          >
            {account.name}
          </Link>{" "}
          &rsaquo; Paramètres
        </div>
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">
            Paramètres du compte
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Modifiez les paramètres ou supprimez le compte.
          </p>
        </header>
        <AccountForm mode="edit" initial={account} tpsRates={tpsRates} />
      </main>
    </div>
  );
}
