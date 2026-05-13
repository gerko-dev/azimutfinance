import Link from "next/link";

type BreadcrumbStep = { label: string; href?: string };

type Props = {
  breadcrumb: BreadcrumbStep[];
  title: string;
  description: string;
  features: string[];
  /** Si false, l'utilisateur n'est pas connecté → CTA inscription/connexion. */
  isMember: boolean;
  /** Lien retour (label + href). */
  back: { label: string; href: string };
};

export default function PremiumPaywall({
  breadcrumb,
  title,
  description,
  features,
  isMember,
  back,
}: Props) {
  return (
    <>
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            {breadcrumb.map((step, i) => (
              <span key={i}>
                {step.href ? (
                  <Link href={step.href} className="hover:text-white transition">
                    {step.label}
                  </Link>
                ) : (
                  <span className="text-slate-200">{step.label}</span>
                )}
                {i < breadcrumb.length - 1 && <span className="mx-2 text-slate-500">›</span>}
              </span>
            ))}
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-white">{title}</h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            {description}
          </p>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-6 md:p-10 text-center">
          <div className="text-5xl md:text-6xl mb-4">🔒</div>
          <div className="inline-block text-[11px] uppercase tracking-wider font-semibold bg-amber-100 text-amber-800 px-3 py-1 rounded-full mb-4">
            Réservé Premium
          </div>
          <h2 className="text-xl md:text-2xl font-semibold text-slate-900 mb-3">
            {title}
          </h2>
          <p className="text-sm md:text-base text-slate-600 max-w-xl mx-auto mb-6">
            {description}
          </p>

          <ul className="text-left max-w-md mx-auto space-y-2 mb-8">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-emerald-600 shrink-0">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {isMember ? (
              <Link
                href="/premium"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-amber-500 text-white font-medium hover:bg-amber-600 transition"
              >
                ⭐ Passer à Premium
              </Link>
            ) : (
              <>
                <Link
                  href="/inscription"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
                >
                  Créer un compte
                </Link>
                <Link
                  href="/connexion"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-slate-300 text-slate-700 font-medium hover:border-slate-400 transition"
                >
                  Se connecter
                </Link>
              </>
            )}
            <Link
              href={back.href}
              className="text-sm text-slate-500 hover:text-slate-900 transition"
            >
              ← {back.label}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
