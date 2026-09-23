"use client";

// === Suivi des clients sensibles ===
//
// UNE PROMESSE, ET CE QU'ELLE EST DEVENUE. Chaque souscription d'un client
// sensible porte une performance cible, convenue à l'entrée. Cet onglet met en
// regard ce qui avait été promis et ce que le fonds a réellement fait depuis,
// client par client.
//
// L'ÉCART EST LA COLONNE QUI COMPTE. Un client sous sa cible est un client qui
// partira, et le trésorier le saura trop tard : c'est ici qu'on le voit venir.
//
// Les colonnes suivent l'ordre du récit — qui est le client, ce qu'il a mis,
// comment cela se comporte, où cela en est — plutôt que l'ordre dans lequel
// les champs ont été saisis.

import {
  fraisPart,
  partsDuFlux,
  type FluxPartAvecFonds,
} from "@/app/gestion-portefeuille/parts-types";
import { LIBELLES_BUREAU } from "@/app/gestion-portefeuille/parts-types";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmt4 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const montantFr = (v: number) => fmt0.format(Math.round(v));
const dateFr = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR") : "—";
const pct = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

/** VL la plus récente connue d'un fonds. */
export type VlCourante = { date: string; vl: number };

const JOUR = 86_400_000;
const joursEntre = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / JOUR,
  );

/**
 * DURÉE MINIMALE AVANT D'ANNUALISER.
 *
 * Annualiser un mouvement de cinq jours donne des nombres à trois chiffres qui
 * ne veulent rien dire : une VL qui bouge de 0,3 % en une semaine ressort à
 * +17 % l'an. Sous un mois, on préfère ne rien afficher plutôt qu'afficher un
 * chiffre que personne ne peut lire.
 */
const JOURS_MIN = 30;

/**
 * Performance annualisée entre deux VL, en décimal.
 *
 * Capitalisation géométrique — (VLfin / VLdébut) ^ (365 / jours) − 1 — et non
 * une règle de trois : c'est la seule qui se compare à une cible annuelle, qui
 * est elle aussi un taux composé.
 */
/**
 * Performance BRUTE entre deux VL : ce que le client a réellement gagné sur la
 * période, sans annualisation.
 *
 * Elle n'a pas de durée minimale — un gain de 0,3 % en une semaine est un gain
 * de 0,3 %, lisible et vrai. C'est le chiffre qu'un client reconnaît sur son
 * relevé, là où l'annualisé sert à comparer entre positions de durées
 * différentes.
 */
function perfBrute(vlEntree: number, vlSortie: number): number | null {
  if (vlEntree <= 0 || vlSortie <= 0) return null;
  return vlSortie / vlEntree - 1;
}

/**
 * Cible RAMENÉE À LA PÉRIODE, pour être comparable à une performance brute.
 *
 * (1 + cible)^(jours/365) − 1, et non une règle de trois : la cible est un taux
 * composé, et la proratiser linéairement l'aurait surestimée sur les périodes
 * longues. Comparer une performance de trois mois à une cible annuelle entière
 * aurait condamné toutes les positions récentes.
 */
function ciblePeriode(cible: number, jours: number): number | null {
  if (jours <= 0) return null;
  return Math.pow(1 + cible, jours / 365) - 1;
}

/**
 * VALEUR CIBLE DE LA PART À L'ÉCHÉANCE.
 *
 * La promesse porte sur toute la durée convenue : 8 % l'an sur dix-huit mois,
 * c'est une part multipliée par 1,08^(18/12) au terme, pas par 1,08.
 */
function vlCibleFinale(vlEntree: number, cible: number, joursTotal: number): number {
  return vlEntree * Math.pow(1 + cible, joursTotal / 365);
}

function perfAnnualisee(
  vlEntree: number,
  vlSortie: number,
  jours: number,
): number | null {
  if (vlEntree <= 0 || vlSortie <= 0 || jours < JOURS_MIN) return null;
  return Math.pow(vlSortie / vlEntree, 365 / jours) - 1;
}

type Ligne = {
  id: string;
  client: string;
  bureau: string;
  fonds: string;
  dateEntree: string;
  dateFin: string | null;
  vlEntree: number | null;
  parts: number | null;
  investissement: number;
  /** VL qui sert de point d'arrivée au calcul, et sa date. Affichées pour que
   *  la performance soit VÉRIFIABLE : une perf qu'on ne peut pas recouper avec
   *  les deux VL qui la produisent ne vaut pas mieux qu'une estimation. */
  dateVlActuelle: string | null;
  vlActuelle: number | null;
  /** Jours écoulés depuis l'entrée, et jours restants avant l'échéance. Les
   *  deux dénominateurs du tableau : le premier sert au gap brut — le rythme
   *  tenu —, le second au gap sur la cible finale. Affichés pour qu'on n'ait
   *  pas à deviner sur quelle fenêtre chaque écart se calcule. */
  joursEcoules: number;
  joursRestants: number | null;
  /** Sur la période, telle quelle. Lisible dès le premier jour. */
  perfBrute: number | null;
  /** La cible ramenée à cette même période — sans quoi l'écart brut
   *  comparerait trois mois de gains à une année entière de promesse. */
  cibleBrute: number | null;
  ecartBrut: number | null;
  perfActuelle: number | null;
  perfCible: number | null;
  ecart: number | null;
  /** Performance annualisée qu'il RESTE à produire, d'ici l'échéance, pour
   *  tenir la promesse. Null sans échéance, ou une fois le terme atteint. */
  requisAnn: number | null;
  /**
   * OÙ EN EST LA PART par rapport à sa valeur promise AU TERME.
   *
   * Un ÉCART COMPOSÉ — VL actuelle / VL cible finale − 1 — et non la
   * différence de deux taux annualisés sur des horizons différents, qui
   * donnait des nombres à trois chiffres que personne ne pouvait calibrer. On
   * ne soustrait pas deux rendements, on divise deux capitaux.
   */
  gapFin: number | null;
  sorti: boolean;
  /** Une échéance est convenue, mais elle n'est pas encore arrivée. */
  finPrevue: boolean;
};

export default function RecapClientsSensibles({
  flux,
  vlCourantes,
  vlSorties,
}: {
  flux: FluxPartAvecFonds[];
  /** VL la plus récente de chaque fonds, par identifiant. */
  vlCourantes: Record<string, VlCourante>;
  /** VL à la date de sortie, pour les positions DÉJÀ closes, par flux. */
  vlSorties: Record<string, VlCourante>;
}) {
  // LES RACHATS FERMENT LES POSITIONS. On indexe ceux de chaque client par
  // fonds : le plus récent donne la date de fin. Une sortie partielle n'est pas
  // distinguée ici — c'est un suivi de relation commerciale, pas une
  // comptabilité de parts.
  const sorties = new Map<string, string>();
  for (const f of flux) {
    if (f.sens !== "rachat" || f.typeClient !== "sensible") continue;
    const k = `${f.fondsId}|${f.investisseur}`;
    const dejaLa = sorties.get(k);
    if (!dejaLa || f.dateOperation > dejaLa) sorties.set(k, f.dateOperation);
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);

  const lignes: Ligne[] = flux
    .filter((f) => f.sens === "souscription" && f.typeClient === "sensible")
    .map((f) => {
      // LA DATE CONVENUE FAIT FOI, le rachat déduit ne sert qu'à défaut : ce
      // qui a été convenu avec le client prime sur ce qu'un appariement par
      // nom et par fonds a cru reconnaître.
      const dateFin = f.dateFin ?? sorties.get(`${f.fondsId}|${f.investisseur}`) ?? null;
      // UNE ÉCHÉANCE FUTURE N'EST PAS UNE SORTIE. Convenir aujourd'hui d'un
      // rachat dans six mois ne ferme pas la position : le client est toujours
      // investi, sa performance court toujours, et l'afficher « Sorti » le
      // retirait du suivi précisément pendant les mois où il compte.
      const sorti = dateFin !== null && dateFin <= aujourdhui;

      // La VL d'arrivée est celle de la sortie quand elle a eu lieu, sinon la
      // dernière publiée. Mesurer une position close contre la VL du jour lui
      // prêterait une performance qu'elle n'a pas vécue.
      const arrivee = (sorti ? vlSorties[f.id] : undefined) ?? vlCourantes[f.fondsId];
      const vlArrivee = arrivee?.vl ?? null;
      const fin = arrivee?.date ?? aujourdhui;
      // La durée court depuis la DATE DE VL retenue, pas depuis celle de
      // l'ordre : c'est à cette VL que le client est entré.
      const debut = f.dateVl ?? f.dateOperation;

      const jours = joursEntre(debut, fin);
      const perfActuelle =
        f.vl != null && vlArrivee != null
          ? perfAnnualisee(f.vl, vlArrivee, jours)
          : null;
      const brute = f.vl != null && vlArrivee != null ? perfBrute(f.vl, vlArrivee) : null;

      // ── LA PROMESSE AU TERME ────────────────────────────────────────────
      //
      // Comparer la performance à la cible annuelle dit si le rythme est bon.
      // Cela ne dit pas si la PROMESSE SERA TENUE : une position en retard de
      // deux points avec deux ans devant elle se rattrape ; la même à trois
      // mois du terme est perdue. D'où ce second écart, qui mesure le rythme
      // tenu contre celui qu'il reste à tenir.
      let requisAnn: number | null = null;
      let gapFin: number | null = null;
      let joursRestants: number | null = null;
      if (f.dateFin && f.vl != null && vlArrivee != null && f.performanceCible != null) {
        const joursTotal = joursEntre(debut, f.dateFin);
        if (joursTotal > 0) {
          const cibleFinale = vlCibleFinale(f.vl, f.performanceCible, joursTotal);
          gapFin = vlArrivee / cibleFinale - 1;
          joursRestants = joursEntre(fin, f.dateFin);
          // Sous un mois, annualiser le RYTHME RESTANT donne des nombres à
          // trois chiffres. L'écart au terme, lui, reste lisible — et c'est
          // justement là qu'on le regarde.
          if (joursRestants >= JOURS_MIN) {
            requisAnn = Math.pow(cibleFinale / vlArrivee, 365 / joursRestants) - 1;
          }
        }
      }
      const cibleBrute =
        f.performanceCible != null ? ciblePeriode(f.performanceCible, jours) : null;

      return {
        id: f.id,
        client: f.investisseur || "—",
        bureau: f.bureau ? LIBELLES_BUREAU[f.bureau] : "—",
        fonds: f.fondsNom,
        dateEntree: f.dateOperation,
        dateFin,
        vlEntree: f.vl,
        parts: partsDuFlux(f),
        // Ce qui a RÉELLEMENT été investi : le versement moins le droit
        // d'entrée. C'est ce montant qui a acheté des parts.
        investissement: f.montant - fraisPart(f),
        dateVlActuelle: arrivee?.date ?? null,
        vlActuelle: vlArrivee,
        perfBrute: brute,
        cibleBrute,
        ecartBrut: brute != null && cibleBrute != null ? brute - cibleBrute : null,
        perfActuelle,
        perfCible: f.performanceCible,
        joursEcoules: jours,
        joursRestants,
        requisAnn,
        gapFin,
        ecart:
          perfActuelle != null && f.performanceCible != null
            ? perfActuelle - f.performanceCible
            : null,
        sorti,
        finPrevue: dateFin !== null && !sorti,
      };
    })
    .sort((a, b) => b.dateEntree.localeCompare(a.dateEntree));

  const th = "text-left px-3 py-2 font-medium whitespace-nowrap";
  const thNum = "text-right px-3 py-2 font-medium whitespace-nowrap";
  const td = "px-3 py-1.5";
  const tdNum = "px-3 py-1.5 text-right tabular-nums";

  const statut = (l: Ligne) => {
    if (l.sorti) return { libelle: "Sorti", ton: "bg-slate-100 text-slate-500" };
    // L'ÉCART BRUT PREND LE RELAIS sous trente jours : l'annualisé se tait,
    // mais la position a bien gagné ou perdu quelque chose, et le dire vaut
    // mieux que « Trop récent » pendant tout un mois.
    const ecart = l.ecart ?? l.ecartBrut;
    if (ecart == null)
      return { libelle: "Trop récent", ton: "bg-slate-100 text-slate-500" };
    return ecart >= 0
      ? { libelle: "Cible tenue", ton: "bg-emerald-100 text-emerald-800" }
      : { libelle: "Sous la cible", ton: "bg-rose-100 text-rose-800" };
  };

  const sousCible = lignes.filter((l) => {
    const e = l.ecart ?? l.ecartBrut;
    return !l.sorti && e != null && e < 0;
  }).length;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Ce qui avait été promis, et ce que le fonds a fait depuis. La performance{" "}
        <strong>brute</strong> est celle de la période, comparée à la cible ramenée à
        cette même période&nbsp;; l&apos;<strong>annualisée</strong> sert à comparer des
        positions de durées différentes, et ne se calcule qu&apos;au-delà de {JOURS_MIN}{" "}
        jours — annualiser un mouvement de quelques jours donne des chiffres que
        personne ne peut lire. Le <strong>gap / cible finale</strong> répond à une autre
        question&nbsp;: non pas «&nbsp;le rythme est-il bon&nbsp;» mais «&nbsp;où en est
        la part par rapport à sa valeur promise au terme&nbsp;». Les deux écarts ont
        donc des dénominateurs différents — la période écoulée pour l&apos;un, la durée
        totale convenue pour l&apos;autre —, et chacun l&apos;annonce sous son
        chiffre.
        {sousCible > 0 && (
          <>
            {" "}
            <strong className="text-rose-700">
              {sousCible} position{sousCible > 1 ? "s" : ""} sous la cible.
            </strong>
          </>
        )}
      </p>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                {/* Qui */}
                <th className={th}>Client</th>
                <th className={th}>Bureau</th>
                <th className={th}>Fonds</th>
                {/* Ce qu'il a mis */}
                <th className={th}>Date d&apos;entrée</th>
                <th className={thNum}>VL d&apos;entrée</th>
                <th className={thNum}>Nombre de parts</th>
                <th className={thNum}>Investissement</th>
                {/* Comment cela se comporte — les deux VL d'abord, la
                    performance qu'elles produisent ensuite. */}
                <th className={th}>Date VL actuelle</th>
                <th className={thNum}>VL actuelle</th>
                {/* SUR LA PÉRIODE d'abord — le chiffre que le client
                    reconnaît sur son relevé —, puis ANNUALISÉ, qui sert à
                    comparer des positions de durées différentes. */}
                <th className={thNum}>Perf. brute</th>
                <th className={thNum}>Gap brut</th>
                <th className={thNum}>Perf. actuelle ann.</th>
                <th className={thNum}>Perf. cible ann.</th>
                <th className={thNum}>Gap ann.</th>
                {/* CELUI-CI NE DIT PAS SI LE RYTHME EST BON, mais si la
                    promesse sera tenue au terme. Vide sans échéance. */}
                <th className={thNum}>Gap / cible finale</th>
                {/* Où cela en est */}
                <th className={th}>Statut</th>
                <th className={th}>Date de fin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-3 py-6 text-center text-slate-400">
                    Aucune souscription de client sensible. Choisis «&nbsp;Client
                    sensible&nbsp;» dans l&apos;onglet «&nbsp;Saisir un flux&nbsp;».
                  </td>
                </tr>
              ) : (
                lignes.map((l) => {
                  const s = statut(l);
                  return (
                    <tr
                      key={l.id}
                      className={`hover:bg-slate-50 ${l.sorti ? "text-slate-400" : ""}`}
                    >
                      <td className={`${td} font-medium text-slate-800`}>{l.client}</td>
                      <td className={td}>{l.bureau}</td>
                      <td className={td}>{l.fonds}</td>
                      <td className={td}>{dateFr(l.dateEntree)}</td>
                      <td className={tdNum}>
                        {l.vlEntree != null ? fmt2.format(l.vlEntree) : "—"}
                      </td>
                      <td className={tdNum}>
                        {l.parts != null ? fmt4.format(l.parts) : "—"}
                      </td>
                      <td className={`${tdNum} font-medium`}>
                        {montantFr(l.investissement)}
                      </td>
                      <td className={td}>{dateFr(l.dateVlActuelle)}</td>
                      <td className={tdNum}>
                        {l.vlActuelle != null ? fmt2.format(l.vlActuelle) : "—"}
                      </td>
                      <td className={tdNum}>{pct(l.perfBrute)}</td>
                      <td
                        className={`${tdNum} font-medium ${
                          l.ecartBrut == null
                            ? ""
                            : l.ecartBrut >= 0
                              ? "text-emerald-700"
                              : "text-rose-700"
                        }`}
                      >
                        {l.ecartBrut == null
                          ? "—"
                          : `${l.ecartBrut >= 0 ? "+" : ""}${pct(l.ecartBrut)}`}
                        {/* La cible ramenée à la période : sans elle, l'écart
                            brut ne se recoupe avec rien. */}
                        {l.cibleBrute != null && (
                          <div className="text-[10px] font-normal text-slate-400">
                            cible {pct(l.cibleBrute)} · sur {l.joursEcoules} j
                          </div>
                        )}
                      </td>
                      <td className={tdNum}>{pct(l.perfActuelle)}</td>
                      <td className={tdNum}>{pct(l.perfCible)}</td>
                      {/* LA COLONNE QUI COMPTE. Un écart négatif annonce un
                          départ ; le lire d'un coup d'œil est tout l'objet de
                          cet onglet. */}
                      <td
                        className={`${tdNum} font-semibold ${
                          l.ecart == null
                            ? ""
                            : l.ecart >= 0
                              ? "text-emerald-700"
                              : "text-rose-700"
                        }`}
                      >
                        {l.ecart == null
                          ? "—"
                          : `${l.ecart >= 0 ? "+" : ""}${pct(l.ecart)}`}
                      </td>
                      <td
                        className={`${tdNum} font-semibold ${
                          l.gapFin == null
                            ? ""
                            : l.gapFin >= 0
                              ? "text-emerald-700"
                              : "text-rose-700"
                        }`}
                      >
                        {l.gapFin == null
                          ? "—"
                          : `${l.gapFin >= 0 ? "+" : ""}${pct(l.gapFin)}`}
                        {/* De quoi recouper : le rythme annualisé qu'il reste
                            à tenir. Trop près du terme pour l'annualiser, on
                            annonce plutôt ce qui reste à courir. */}
                        <div className="text-[10px] font-normal text-slate-400">
                          {l.requisAnn != null
                            ? `requis ${pct(l.requisAnn)}`
                            : l.joursRestants != null
                              ? `${l.joursRestants} j avant le terme`
                              : "sans échéance"}
                        </div>
                      </td>
                      <td className={td}>
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${s.ton}`}
                        >
                          {s.libelle}
                        </span>
                      </td>
                      <td className={td}>
                        {dateFr(l.dateFin)}
                        {l.finPrevue && (
                          <div className="text-[10px] text-slate-400">prévue</div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
