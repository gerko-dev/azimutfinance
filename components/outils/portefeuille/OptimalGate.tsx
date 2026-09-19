import Lien from "@/components/NavigationProgress";

/**
 * Mur Premium du portefeuille optimal.
 *
 * Pose sur ce seul onglet : le suivi et l'analyse decrivent ce que le membre
 * possede deja, et il n'y a aucune raison de lui faire payer la lecture de ses
 * propres positions. Ce qui se paie ici, c'est l'OUTIL — l'optimisation
 * moyenne-variance sur toute la cote, contrainte par la liquidite reelle, et la
 * liste d'ordres chiffree qui va avec.
 *
 * Le bandeau annonce ce qu'il y a derriere plutot que de se contenter d'un
 * refus : un membre doit pouvoir juger si l'abonnement vaut le coup.
 */
export default function OptimalGate({
  isMember,
  retour,
}: {
  isMember: boolean;
  retour: string;
}) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-5 py-6 md:px-7 md:py-8 text-white">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold bg-amber-400/15 text-amber-200 border border-amber-400/30 px-2 py-0.5 rounded">
            Premium
          </span>
          <span className="text-xs text-slate-400">Portefeuille optimal</span>
        </div>
        <h2 className="text-xl md:text-2xl font-semibold leading-tight">
          Le portefeuille qui maximise votre rendement par unité de risque
        </h2>
        <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
          L&apos;onglet Analyse mesure le portefeuille que vous détenez. Celui-ci
          calcule celui que vous devriez détenir — allocation optimale sur toute
          la cote BRVM, trésorerie comprise, puis la liste exacte des ordres pour
          y arriver, frais et liquidité du marché compris.
        </p>
      </div>

      <div className="px-5 py-5 md:px-7 md:py-6">
        <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-slate-700">
          {[
            "Allocation de Sharpe maximal sur l'ensemble des valeurs cotées",
            "Toute la trésorerie investie, au cours du moment",
            "Contrainte de liquidité : aucun ordre que le marché n'absorbe",
            "Ordres chiffrés à votre grille de frais, avec délai d'exécution",
            "Volatilité, VaR et bêta avant et après arbitrage",
            "Covariance rétrécie : pas d'optimisation sur le bruit",
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
          <Lien
            href="/premium"
            className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm transition"
          >
            Découvrir Premium
          </Lien>
          {!isMember && (
            <Lien
              href={`/connexion?redirect=${encodeURIComponent(retour)}`}
              className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium border border-slate-300 hover:bg-slate-50 transition"
            >
              J&apos;ai déjà un compte
            </Lien>
          )}
        </div>
      </div>
    </section>
  );
}
