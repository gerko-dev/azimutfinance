import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/actions";

export const metadata = {
  title: "Compte suspendu — AzimutFinance",
};

export const dynamic = "force-dynamic";

function fmtDateLong(iso: string | null): string {
  if (!iso) return "—";
  if (iso === "infinity" || new Date(iso).getFullYear() > 3000) return "permanent";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} à ${hh}h${mm}`;
}

export default async function SuspenduPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data } = await supabase.rpc("my_suspension_status");
  const status = Array.isArray(data) ? data[0] : data;
  if (!status?.is_suspended) {
    // Sanction levee : retour au dashboard
    redirect("/");
  }

  const isBan =
    status.suspended_until === "infinity" ||
    (status.suspended_until && new Date(status.suspended_until).getFullYear() > 3000);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 md:px-6 py-12 md:py-20">
        <div className="bg-white rounded-lg border-2 border-rose-200 p-6 md:p-10 text-center">
          <div className="text-6xl mb-3">{isBan ? "🚫" : "⏸️"}</div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            {isBan ? "Votre compte a été banni" : "Votre compte est suspendu"}
          </h1>

          {!isBan && status.suspended_until && (
            <p className="text-base text-slate-700 mt-4">
              La suspension prendra fin le{" "}
              <strong>{fmtDateLong(status.suspended_until)}</strong>.
            </p>
          )}

          {status.suspension_reason && (
            <div className="mt-6 bg-slate-50 border border-slate-200 rounded p-4 text-left">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
                Raison
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">
                {status.suspension_reason}
              </p>
            </div>
          )}

          <div className="mt-6 text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
            {isBan ? (
              <>
                Pour toute contestation, contacte le support à{" "}
                <a
                  href="mailto:contact@azimutfinance.com"
                  className="text-blue-700 hover:underline"
                >
                  contact@azimutfinance.com
                </a>
                .
              </>
            ) : (
              <>
                Pendant la suspension, tu n&apos;as accès qu&apos;à cette page. Pour
                toute question, contacte{" "}
                <a
                  href="mailto:contact@azimutfinance.com"
                  className="text-blue-700 hover:underline"
                >
                  contact@azimutfinance.com
                </a>
                .
              </>
            )}
          </div>

          <form action={signOutAction} className="mt-8">
            <button
              type="submit"
              className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-5 py-2.5 rounded transition"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
