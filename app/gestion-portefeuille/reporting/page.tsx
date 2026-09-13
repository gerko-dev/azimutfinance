import { requireAdmin } from "@/lib/admin/auth";

import PeriodeForm from "./PeriodeForm";

export const dynamic = "force-dynamic";

/** Bornes proposées par défaut : un semestre arrêté à hier, avec le point de
 *  passage au milieu. Hors composant, pour ne pas tomber sous la règle
 *  react-hooks/purity (même convention que daysUntil dans lib/auth/premium.ts).
 */
function bornesParDefaut(): { debut: string; intermediaire: string; fin: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const fin = new Date();
  fin.setUTCDate(fin.getUTCDate() - 1);
  const debut = new Date(fin);
  debut.setUTCMonth(debut.getUTCMonth() - 6);
  const intermediaire = new Date((debut.getTime() + fin.getTime()) / 2);
  return { debut: iso(debut), intermediaire: iso(intermediaire), fin: iso(fin) };
}

/** Sections du rapport, dans l'ordre du PDF. `slide` renvoie au template
 *  PowerPoint du comité — le repère que les membres connaissent. */
const SECTIONS: { titre: string; slide: string; detail: string; statut: "ok" | "nouveau" }[] = [
  {
    titre: "Indices principaux",
    slide: "43",
    detail: "Composite, BRVM 30, prestige et principal : niveaux aux trois bornes, variation période et YTD, moteurs de la hausse.",
    statut: "ok",
  },
  {
    titre: "Indices sectoriels",
    slide: "42",
    detail: "Les dix indices sectoriels BRVM, avec le nombre de sociétés composant chacun.",
    statut: "ok",
  },
  {
    titre: "Performances individuelles — Top 10",
    slide: "44",
    detail: "Dix plus fortes hausses sur la période, cours de début et de fin, variation YTD.",
    statut: "ok",
  },
  {
    titre: "Performances individuelles — Flop 10",
    slide: "45",
    detail: "Dix plus forts reculs, du pire au moins pire.",
    statut: "ok",
  },
  {
    titre: "Publications officielles sur la période",
    slide: "23-40",
    detail: "États financiers annuels et semestriels, indicateurs T1 et T3, mises en paiement de dividende tombés dans la période.",
    statut: "ok",
  },
  {
    titre: "Récapitulatif des obligations cotées",
    slide: "—",
    detail: "Encours, coupon et maturité moyens pondérés, plus les deux classements nouveaux : top 10 évolution de période et top 10 depuis le 1er janvier.",
    statut: "nouveau",
  },
  {
    titre: "Marché des titres publics",
    slide: "49-52",
    detail: "Montants retenus par pays et par maturité, taux moyens pondérés, taux d'absorption, prix marginal moyen.",
    statut: "ok",
  },
  {
    titre: "Bons du Trésor (BAT)",
    slide: "53-54",
    detail: "Suivis à part : zéro-coupon, taux lus dans le taux moyen pondéré et non dans le rendement des OAT.",
    statut: "ok",
  },
  {
    titre: "Performances du marché des OPCVM",
    slide: "56-58",
    detail: "Par catégorie : effectif, niveau de risque publié, performance moyenne et top 3.",
    statut: "ok",
  },
  {
    titre: "Anticipation des cours et du marché des actions",
    slide: "nouveau",
    detail: "Score à trois signaux : PER contre la médiane du secteur, rendement du dividende contre le marché, cours contre sa moyenne mobile 50 séances. La méthode est imprimée dans le rapport.",
    statut: "nouveau",
  },
  {
    titre: "Anticipation des rendements obligataires",
    slide: "nouveau",
    detail: "Régression du taux servi sur le temps, bande de maturité par bande, sur douze mois d'adjudications UMOA-Titres. Projection à trois mois publiée seulement si le R² atteint 0,30.",
    statut: "nouveau",
  },
];

export default async function ReportingPage() {
  await requireAdmin(1, "/gestion-portefeuille/reporting");
  const defauts = bornesParDefaut();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">
          Reporting du marché — comité d&apos;investissement
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
          Produit le rapport d&apos;analyse de marché au format PDF, à
          l&apos;en-tête de NSIA Asset Management. La structure suit le template
          PowerPoint du comité : chaque page du PDF porte le numéro de slide
          correspondant.
        </p>
      </div>

      <section className="bg-slate-800/60 border border-slate-700 rounded-lg p-5">
        <h2 className="text-base font-semibold text-white mb-1">
          Période du rapport
        </h2>
        <p className="text-xs text-slate-400 mb-5 max-w-3xl">
          Les trois bornes commandent tout le rapport : variations de cours,
          encours obligataires, adjudications retenues, VL des OPCVM. Aucune
          section ne prend la date du jour comme référence implicite, de sorte
          qu&apos;un rapport reste reproductible à l&apos;identique plus tard.
        </p>
        <PeriodeForm defauts={defauts} />
      </section>

      <section className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <h2 className="text-base font-semibold text-white">
            Contenu du rapport
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {SECTIONS.length} sections. Une section dont les données manquent
            sur la période demandée n&apos;est pas masquée : elle est signalée
            en annexe du PDF.
          </p>
        </div>
        <ul className="divide-y divide-slate-700/70">
          {SECTIONS.map((s) => (
            <li key={s.titre} className="px-5 py-3 flex gap-4">
              <span className="shrink-0 w-20 text-[11px] font-mono text-slate-500 pt-0.5">
                {s.slide}
              </span>
              <div className="min-w-0">
                <div className="text-sm text-slate-100 font-medium">
                  {s.titre}
                  {s.statut === "nouveau" && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
                      nouveau
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{s.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 text-xs text-slate-400 space-y-2">
        <p>
          <span className="font-medium text-slate-300">
            Les deux méthodes d&apos;anticipation sont imprimées dans le PDF,
          </span>{" "}
          avec leurs limites. Un comité doit pouvoir contester une projection :
          il lui faut la méthode sous les yeux, pas seulement le chiffre.
        </p>
        <p>
          <span className="font-medium text-slate-300">
            Ce que le rapport ne fait pas encore :
          </span>{" "}
          les projections de résultats partiels ne sont pas intégrées à
          l&apos;anticipation actions — le portail n&apos;a pas de source
          structurée d&apos;estimations. L&apos;analyse technique se limite à la
          moyenne mobile 50 séances.
        </p>
      </div>
    </div>
  );
}
