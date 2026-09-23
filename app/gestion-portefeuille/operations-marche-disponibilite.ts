import "server-only";

// === Peut-on céder ces titres ? ===
//
// ON NE VEND PAS CE QU'ON N'A PAS. Le contrôle manquait : jusqu'ici, une vente
// s'enregistrait pour n'importe quelle quantité de n'importe quel titre, et
// rien n'allait la confronter à l'inventaire du fonds.
//
// Quatre choses retranchent de ce qui est cessible, et elles se cumulent :
//
//   les titres PRÊTÉS      — ils sont dehors. Le prêt ne produit aucun flux de
//                            trésorerie et le titre reste à l'inventaire, où il
//                            continue de porter ses courus et ses
//                            amortissements ; mais il ne peut pas être cédé
//                            tant qu'il n'est pas repris. C'est la seule
//                            contrainte que le prêt impose, et elle est ici.
//   les titres PRIS EN      — ils sont à l'inventaire, mais ils DOIVENT
//   RÉMÉRÉ                   RETOURNER à la contrepartie au terme. Les céder,
//                            c'est se retrouver à devoir rendre ce qu'on n'a
//                            plus. Seul l'ACHAT à réméré est concerné : une
//                            vente à réméré a déjà fait sortir les titres, et
//                            le terme les fera revenir.
//   les ventes DÉJÀ PASSÉES — leur part non servie est promise à quelqu'un.
//   les achats et ventes    — l'inventaire date d'un jour donné ; ce qui a été
//   EXÉCUTÉS DEPUIS          acheté ou vendu depuis s'y ajoute ou s'en retire.
//
// Ce dernier point est ce qui évite le faux blocage : sans lui, un titre acheté
// puis revendu avant le prochain import d'inventaire aurait été refusé.

import { cache } from "react";

import { loadFundPortfolios } from "./portfolio-data";
import type { PortfolioSnapshot, SavedPosition } from "./portfolio-types";
import { loadOperationsMarche } from "./operations-marche-data";
import type { OptionTitre } from "./operations-marche-titres";
import {
  quantiteExecutee,
  quantiteRestante,
  partRestantePese,
  sensDe,
  type OperationMarche,
} from "./operations-marche-types";

const cle = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase();

/**
 * Snapshot qui fait foi : celui du slot « fin », et à défaut le plus récent.
 *
 * LE SLOT D'ABORD, la date ensuite. Les slots ne se saisissent pas dans
 * l'ordre chronologique : prendre le plus récemment daté peut désigner
 * l'intermédiaire, et donc un inventaire qui n'est pas celui de référence.
 * C'est la règle déjà retenue par le point de trésorerie.
 */
function snapshotDeReference(snapshots: PortfolioSnapshot[]): PortfolioSnapshot | null {
  return (
    snapshots.find((s) => s.slot === "fin") ??
    [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).pop() ??
    null
  );
}

/** Toutes les façons de désigner une position. On indexe sous chacune, parce
 *  qu'une opération porte un ISIN quand l'inventaire, lui, peut n'avoir qu'un
 *  mnémonique ou qu'un libellé. */
function clesPosition(p: SavedPosition): string[] {
  return [p.matchIsin, p.matchCode, p.rawCode, p.rawLabel, p.matchLabel]
    .map(cle)
    .filter(Boolean);
}

/** Quantités détenues à l'inventaire, indexées par toutes leurs désignations. */
export const quantitesInventaire = cache(
  async (
    fundId: string,
  ): Promise<{ asOfDate: string | null; parCle: Map<string, number> }> => {
    const actuel = snapshotDeReference(await loadFundPortfolios(fundId));
    const parCle = new Map<string, number>();
    if (!actuel) return { asOfDate: null, parCle };

    for (const p of actuel.positions) {
      // Les lignes de trésorerie ne sont pas des titres : elles n'ont rien à
      // faire dans un contrôle de cession.
      if (p.section === "tresorerie") continue;
      const q = p.quantity ?? 0;
      if (q === 0) continue;
      // Une même clef peut porter plusieurs lignes — un titre scindé en deux
      // lots, par exemple. On additionne.
      for (const k of new Set(clesPosition(p))) {
        parCle.set(k, (parCle.get(k) ?? 0) + q);
      }
    }
    return { asOfDate: actuel.asOfDate, parCle };
  },
);

/** Une opération porte-t-elle sur ce titre ? */
function memeTitre(o: OperationMarche, code: string, libelle: string): boolean {
  const c = cle(code);
  const l = cle(libelle);
  return (c !== "" && cle(o.code) === c) || (l !== "" && cle(o.libelle) === l);
}

export type Disponibilite = {
  /** Quantité à l'inventaire de référence. */
  detenue: number;
  /** Achats moins ventes EXÉCUTÉS depuis la date de cet inventaire. */
  mouvements: number;
  /** Titres prêtés et pas encore repris. Dehors : incessibles. */
  pretee: number;
  /** Titres PRIS en réméré et pas encore rendus. Ils doivent retourner. */
  remeree: number;
  /** Part non servie des autres ordres de vente en cours. Déjà promise. */
  engagee: number;
  disponible: number;
  asOfDate: string | null;
  /** Le titre figure-t-il à l'inventaire ? Faux ne veut pas dire zéro : il
   *  peut avoir été acheté après. */
  connue: boolean;
};

/**
 * Tout ce qu'il faut pour juger d'une cession : l'inventaire de reference et
 * les operations du fonds.
 *
 * IL SE LIT UNE FOIS, POUR TOUS LES TITRES. C'etait la cause des vingt
 * secondes du menu deroulant de vente : `titresCessibles` appelait
 * `disponibiliteCession` par titre, et chacune redemandait l'inventaire et les
 * operations. Trente-cinq titres faisaient donc trente-cinq fois huit
 * aller-retours. La memoisation de requete etait censee les ramener a huit ;
 * s'appuyer dessus pour la tenue d'une boucle etait une fragilite, pas une
 * optimisation.
 */
type ContexteCession = {
  asOfDate: string | null;
  parCle: Map<string, number>;
  operations: OperationMarche[];
};

async function contexteCession(fundId: string): Promise<ContexteCession> {
  const [{ asOfDate, parCle }, operations] = await Promise.all([
    quantitesInventaire(fundId),
    loadOperationsMarche(fundId),
  ]);
  return { asOfDate, parCle, operations };
}

/**
 * Le CALCUL, sans aucune lecture : c'est lui qui porte la regle, et il est le
 * meme qu'on juge un titre ou trente-cinq.
 */
function disponibiliteDans(
  { asOfDate, parCle, operations }: ContexteCession,
  code: string,
  libelle: string,
  exclureOperationId: string | null,
): Disponibilite {
  const c = cle(code);
  const l = cle(libelle);
  const detenue = (c && parCle.get(c)) || (l && parCle.get(l)) || 0;
  const connue = (c !== "" && parCle.has(c)) || (l !== "" && parCle.has(l));

  let mouvements = 0;
  let pretee = 0;
  let remeree = 0;
  let engagee = 0;

  for (const o of operations) {
    if (!memeTitre(o, code, libelle)) continue;

    // Un prêt EXÉCUTÉ et non repris sort les titres du gisement cessible.
    // Non exécuté, il n'a rien sorti du tout.
    if (o.pret && !o.pret.dateReprise && quantiteExecutee(o) > 0) {
      pretee += quantiteExecutee(o);
    }

    // PRIS EN RÉMÉRÉ, et pas encore rendu. Le fonds les détient, mais il les
    // doit : un achat à réméré est une détention temporaire, et les céder le
    // mettrait dans l'incapacité de tenir le dénouement.
    //
    // La VENTE à réméré ne se retranche pas : ces titres-là sont déjà partis,
    // et le terme les fera revenir. Les compter deux fois les aurait retirés
    // d'un gisement qu'ils avaient déjà quitté.
    if (
      o.remere &&
      o.remere.statut !== "denoue" &&
      sensDe(o.description) === "achat" &&
      quantiteExecutee(o) > 0
    ) {
      remeree += quantiteExecutee(o);
    }

    // Mouvements postérieurs à l'inventaire : ce que l'import ne connaît pas
    // encore. Sans arrêté, l'inventaire est muet et tout mouvement compte.
    //
    // UN PRÊT N'EST PAS UN MOUVEMENT. Il se saisit sur une vente MTP, mais le
    // titre RESTE à l'inventaire : il y porte toujours ses courus et le fonds
    // reste destinataire de ses amortissements. Le retrancher ici l'aurait
    // compté deux fois — une fois comme vente, une fois comme prêté — et le
    // gisement cessible serait tombé du double de la quantité prêtée.
    if (!o.pret) {
      for (const e of o.executions) {
        if (asOfDate && e.dateExecution <= asOfDate) continue;
        mouvements += sensDe(o.description) === "achat" ? e.quantite : -e.quantite;
      }
    }

    // Part non servie des AUTRES ordres de vente encore au carnet.
    //
    // Un prêt en attente d'exécution n'engage rien : les titres n'ont pas
    // bougé, et ils ne bougeront pas — ils sortent du gisement cessible à
    // l'exécution, par `pretee`.
    if (o.id === exclureOperationId) continue;
    if (o.pret) continue;
    if (sensDe(o.description) !== "vente") continue;
    if (quantiteRestante(o) <= 0) continue;
    if (!partRestantePese(o, null)) continue;
    engagee += quantiteRestante(o);
  }

  return {
    detenue,
    mouvements,
    pretee,
    remeree,
    engagee,
    disponible: detenue + mouvements - pretee - remeree - engagee,
    asOfDate,
    connue,
  };
}

/**
 * Ce qu'il reste de cessible sur un titre, pour un fonds.
 *
 * Pour UN titre. Quand il s'agit d'en juger plusieurs — le menu déroulant
 * d'une vente —, c'est `titresCessibles` qu'il faut : elle ne lit qu'une fois.
 *
 * `exclureOperationId` sert à la MODIFICATION : un ordre de vente qu'on
 * corrige ne doit pas se compter lui-même parmi les quantités déjà engagées,
 * sinon relire sa propre quantité la refuserait.
 */
export async function disponibiliteCession(
  fundId: string,
  code: string,
  libelle: string,
  exclureOperationId: string | null = null,
): Promise<Disponibilite> {
  return disponibiliteDans(
    await contexteCession(fundId),
    code,
    libelle,
    exclureOperationId,
  );
}

/** Message de refus, ou null si la cession passe. Dit les quatre termes du
 *  calcul : un refus qu'on ne peut pas vérifier soi-même est un refus qu'on
 *  soupçonne d'être faux. */
export function refusCession(d: Disponibilite, quantite: number): string | null {
  if (quantite <= d.disponible) return null;

  const morceaux = [`${d.detenue} à l'inventaire${d.asOfDate ? ` du ${d.asOfDate}` : ""}`];
  if (d.mouvements !== 0) {
    morceaux.push(`${d.mouvements > 0 ? "+" : ""}${d.mouvements} exécutés depuis`);
  }
  if (d.pretee > 0) morceaux.push(`${d.pretee} prêtés`);
  if (d.remeree > 0) morceaux.push(`${d.remeree} pris en réméré`);
  if (d.engagee > 0) morceaux.push(`${d.engagee} déjà en vente`);

  const detail = morceaux.join(", ");
  const fin =
    !d.connue && d.detenue === 0
      ? " Ce titre ne figure pas à l'inventaire de référence : importe-le, ou saisis d'abord l'achat et son exécution."
      : d.remeree > 0
        ? " Un titre pris en réméré doit retourner à la contrepartie : il n'est cessible qu'une fois le réméré dénoué."
        : d.pretee > 0
          ? " Un titre prêté ne peut pas être cédé tant qu'il n'est pas repris."
          : "";

  return `Quantité supérieure au cessible : ${d.disponible} disponible (${detail}). ${fin}`.trim();
}

/**
 * Titres CESSIBLES du fonds, parmi une liste d'options du référentiel.
 *
 * ON NE PROPOSE PAS À LA VENTE CE QU'ON NE PEUT PAS VENDRE. Jusqu'ici le
 * formulaire offrait tout le référentiel BRVM ou tous les titres publics d'un
 * État, et le refus n'arrivait qu'à l'enregistrement — après avoir saisi la
 * quantité, le prix et le compte. Mieux vaut ne montrer que ce qui passe.
 *
 * La quantité disponible entre dans le `detail` de chaque option : c'est
 * l'information qu'on cherche au moment de choisir, et elle évite un
 * aller-retour pour savoir combien on peut sortir.
 */
export async function titresCessibles(
  fundId: string,
  options: OptionTitre[],
  exclureOperationId: string | null = null,
): Promise<OptionTitre[]> {
  // UNE SEULE LECTURE pour toute la liste. Ce qui suit est du calcul pur.
  const debut = performance.now();
  const ctx = await contexteCession(fundId);
  const lecture = performance.now() - debut;
  const { parCle } = ctx;
  if (parCle.size === 0) return [];

  // On ne calcule la disponibilité que des titres que le fonds touche de près
  // ou de loin : le référentiel BRVM en compte des centaines, l'inventaire
  // quelques dizaines.
  const candidats = options.filter(
    (t) =>
      parCle.has(cle(t.cle)) ||
      parCle.has(cle(t.isin)) ||
      parCle.has(cle(t.symbole)) ||
      parCle.has(cle(t.libelle)),
  );

  const resultats = candidats.map((t) => ({
    t,
    d: disponibiliteDans(ctx, t.isin || t.cle, t.libelle, exclureOperationId),
  }));

  // Le menu déroulant de vente a mis jusqu'à cinquante-sept secondes à
  // s'ouvrir. La trace sépare ce qui se lit de ce qui se calcule : sans elle,
  // le journal ne disait que « application-code », qui ne désigne rien.
  console.info(
    `[cessions] ${fundId} : lecture ${Math.round(lecture)} ms, ` +
      `${candidats.length} titres jugés en ${Math.round(performance.now() - debut - lecture)} ms ` +
      `sur ${ctx.operations.length} opérations`,
  );

  return resultats
    .filter(({ d }) => d.disponible > 0)
    .map(({ t, d }) => ({
      ...t,
      detail: `${t.detail} · ${fmtQuantite.format(d.disponible)} cessibles`,
    }));
}

const fmtQuantite = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
