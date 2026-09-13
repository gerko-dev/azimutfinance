import Link from "next/link";

/**
 * Mur Premium du Studio d'analyse.
 *
 * Volontairement pose sur ce seul onglet, et non sur la page : les sept autres
 * onglets sont de la donnee de synthese, publique et indexable. Ce qui se paie
 * ici, c'est l'OUTIL — l'acces au catalogue complet des seize feuilles BCEAO,
 * la construction de series libres et la comparaison entre pays.
 *
 * Le bandeau annonce ce qu'il y a derriere plutot que de se contenter d'un
 * refus : un visiteur doit pouvoir juger si l'abonnement vaut le coup.
 */
export default function MacroStudioGate({ isMember }: { isMember: boolean }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-5 py-6 md:px-7 md:py-8 text-white">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold bg-amber-400/15 text-amber-200 border border-amber-400/30 px-2 py-0.5 rounded">
            Premium
          </span>
          <span className="text-xs text-slate-400">Studio d&apos;analyse</span>
        </div>
        <h2 className="text-xl md:text-2xl font-semibold leading-tight">
          Construisez vos propres séries macroéconomiques
        </h2>
        <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
          Les sept autres onglets donnent la lecture de synthèse. Le Studio ouvre
          la base brute de la BCEAO : seize feuilles, des milliers
          d&apos;indicateurs, croisés entre les huit États de l&apos;Union sur
          toute la profondeur disponible.
        </p>
      </div>

      <div className="px-5 py-5 md:px-7 md:py-6">
        <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-slate-700">
          {[
            "Catalogue complet : TOFE, balance des paiements, crédit sectoriel, situation monétaire",
            "Comparaison de n'importe quel indicateur entre les 8 pays",
            "Séries dérivées : ratios, glissements annuels, rebasages",
            "Profondeur d'historique intégrale, jusqu'à la dernière publication",
          ].map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden className="text-emerald-600 shrink-0">
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-3 mt-5">
          <Link
            href="/premium"
            className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm transition"
          >
            Découvrir Premium
          </Link>
          {!isMember && (
            <Link
              href="/connexion?redirect=/macro/pays"
              className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium border border-slate-300 hover:bg-slate-50 transition"
            >
              J&apos;ai déjà un compte
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
