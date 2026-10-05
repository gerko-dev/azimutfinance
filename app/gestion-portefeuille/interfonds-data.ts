import "server-only";

// === Opérations ENTRE FONDS — moteur d'appariement ===
//
// Ce fichier ne fait que lire et proposer. Rien n'est exécuté, rien n'est
// enregistré : le gérant arbitre, le comité valide, et l'ordre se saisit
// ensuite dans le carnet — des DEUX côtés, parce qu'un transfert interne reste
// une vente pour l'un et un achat pour l'autre.
//
// L'IDÉE TIENT EN UNE PHRASE : si un fonds doit alléger un poste pendant qu'un
// autre doit le renforcer, la contrepartie est dans la maison. Le marché ne
// sert alors qu'à payer deux courtages et une fourchette.
//
// CE QU'ON N'APPARIE PAS, ET POURQUOI :
//
//   LES CLASSES, LES SECTEURS, LES MATURITÉS. Un poste qui ne nomme aucun
//   titre ne se cède pas. « Actions +2 % » n'est pas un ordre.
//
//   LES FONDS SANS CIBLE. Sans allocation validée sur le poste, il n'y a ni
//   excédent ni besoin — seulement une détention. Proposer de la déplacer
//   serait inventer une décision que le comité n'a pas prise.
//
//   CE QUE LE VENDEUR NE DÉTIENT PAS. L'écart d'allocation peut appeler une
//   cession plus grosse que la ligne ; on borne au détenu, sinon la
//   proposition est une vente à découvert.

import { loadMyFunds } from "./data";
import { construireTableauAllocation } from "./allocation-data";
import { indexerCoursSite } from "./cours-data";
import { coursDe } from "./cours-types";
import type { LigneAllocation, TableauAllocation } from "./allocation-types";
import {
  MONTANT_MINIMUM_INTERFONDS,
  type AppariementInterfonds,
  type AxeInterfonds,
  type PartieInterfonds,
  type PlanInterfonds,
} from "./interfonds-types";

const AXES: AxeInterfonds[] = ["action_titre", "obligation_emetteur"];

/** Un côté du marché interne, avant appariement. */
type Cote = {
  fondsId: string;
  fondsNom: string;
  ligne: LigneAllocation;
  /** Ce qu'il reste à céder ou à acquérir, décroissant au fil des appariements. */
  reste: number;
};

/** Le fonds, ses trois tableaux, et ce qu'il a en caisse. */
type Lecture = {
  id: string;
  nom: string;
  dateInventaire: string | null;
  tableaux: Partial<Record<AxeInterfonds, TableauAllocation>>;
  /** Solde réel de trésorerie, tel que l'axe des classes le retient. */
  liquidite: number | null;
};

const fmtFr = (v: number) => Math.round(v).toLocaleString("fr-FR");

/**
 * Les cessions de gré à gré possibles entre les fonds gérés.
 *
 * CALCUL À LA DEMANDE, jamais au rendu de la page : il lit l'inventaire de
 * TOUS les portefeuilles, et le faire à chaque affichage de l'onglet
 * ferait payer quinze chargements d'inventaire à qui ne regarde qu'un fonds.
 */
export async function construireOperationsInterfonds(): Promise<PlanInterfonds> {
  const fonds = await loadMyFunds();
  const avertissements: string[] = [];

  if (fonds.length < 2) {
    return {
      appariements: [],
      fonds: fonds.map((f) => ({ id: f.id, nom: f.nom, dateInventaire: null })),
      montantTotal: 0,
      avertissements: [
        "Il faut au moins deux fonds gérés pour qu'une contrepartie interne existe.",
      ],
    };
  }

  // Tout de front : les fonds ne dépendent pas les uns des autres, et les
  // enchaîner ferait payer quinze latences bout à bout.
  const lectures: Lecture[] = await Promise.all(
    fonds.map(async (f): Promise<Lecture> => {
      const [actions, obligations, classes] = await Promise.all([
        construireTableauAllocation(f.id, "action_titre").catch(() => null),
        construireTableauAllocation(f.id, "obligation_emetteur").catch(() => null),
        construireTableauAllocation(f.id, "classe").catch(() => null),
      ]);
      const liquidite =
        classes?.lignes.find((l) => l.bucket === "tresorerie")?.valeurActuelle ?? null;
      return {
        id: f.id,
        nom: f.nom,
        dateInventaire:
          actions?.dateActuelle ?? obligations?.dateActuelle ?? classes?.dateActuelle ?? null,
        tableaux: {
          ...(actions ? { action_titre: actions } : {}),
          ...(obligations ? { obligation_emetteur: obligations } : {}),
        },
        liquidite,
      };
    }),
  );

  const sansInventaire = lectures.filter((l) => l.dateInventaire === null);
  if (sansInventaire.length > 0) {
    avertissements.push(
      `${sansInventaire.length} fonds sans inventaire importé : ${sansInventaire
        .map((l) => l.nom)
        .join(", ")}. Ils ne peuvent ni céder ni recevoir.`,
    );
  }

  // LES INVENTAIRES NE SONT PAS TOUS DU MÊME JOUR, et c'est une réserve sur
  // tout l'écran : apparier un portefeuille arrêté hier avec un autre arrêté
  // le mois dernier compare deux états qui n'ont pas coexisté.
  const dates = new Set(lectures.map((l) => l.dateInventaire).filter(Boolean));
  if (dates.size > 1) {
    const triees = [...dates].sort();
    avertissements.push(
      `Les inventaires ne sont pas tous arrêtés à la même date (du ${triees[0]} au ${
        triees[triees.length - 1]
      }) : les montants appariés sont indicatifs.`,
    );
  }

  const coursSite = await indexerCoursSite();
  const appariements: AppariementInterfonds[] = [];

  for (const axe of AXES) {
    // Par poste : un vendeur et un acheteur ne se rencontrent que sur le même
    // titre, ou la même signature.
    const vendeurs = new Map<string, Cote[]>();
    const acheteurs = new Map<string, Cote[]>();

    for (const lec of lectures) {
      const tableau = lec.tableaux[axe];
      if (!tableau) continue;
      for (const ligne of tableau.lignes) {
        // SANS CIBLE, PAS D'ÉCART : `montantARealiser` est nul quand le comité
        // n'a rien arrêté sur ce poste, et une détention n'est pas un excédent.
        if (ligne.montantARealiser === null) continue;
        const montant = ligne.montantARealiser;
        if (Math.abs(montant) < MONTANT_MINIMUM_INTERFONDS) continue;

        if (montant < 0) {
          // ON NE CÈDE QUE CE QU'ON DÉTIENT. L'écart peut appeler plus que la
          // ligne ne pèse — l'assiette a bougé, la cible est ancienne — et
          // proposer la différence reviendrait à vendre à découvert.
          const cessible = Math.min(-montant, ligne.valeurActuelle);
          if (cessible < MONTANT_MINIMUM_INTERFONDS) continue;
          const l = vendeurs.get(ligne.bucket) ?? [];
          l.push({ fondsId: lec.id, fondsNom: lec.nom, ligne, reste: cessible });
          vendeurs.set(ligne.bucket, l);
        } else {
          const l = acheteurs.get(ligne.bucket) ?? [];
          l.push({ fondsId: lec.id, fondsNom: lec.nom, ligne, reste: montant });
          acheteurs.set(ligne.bucket, l);
        }
      }
    }

    for (const [bucket, offre] of vendeurs) {
      const demande = acheteurs.get(bucket);
      if (!demande || demande.length === 0) continue;

      // LE PLUS GROS BESOIN D'ABORD, des deux côtés : on veut peu d'ordres
      // épais plutôt que beaucoup de miettes. Un appariement coûte deux
      // saisies et un accord de contrepartie, quel que soit son montant.
      const offres = [...offre].sort((a, b) => b.reste - a.reste);
      const demandes = [...demande].sort((a, b) => b.reste - a.reste);

      for (const v of offres) {
        for (const a of demandes) {
          if (v.reste < MONTANT_MINIMUM_INTERFONDS) break;
          if (a.reste < MONTANT_MINIMUM_INTERFONDS) continue;
          if (v.fondsId === a.fondsId) continue;

          const montant = Math.min(v.reste, a.reste);
          const acheteurLec = lectures.find((l) => l.id === a.fondsId);
          appariements.push(
            batir(axe, bucket, v, a, montant, coursSite, acheteurLec?.liquidite ?? null),
          );
          v.reste -= montant;
          a.reste -= montant;
        }
      }
    }
  }

  // Les plus gros montants d'abord : c'est l'ordre dans lequel le comité les
  // tranche, et celui où un arbitrage vaut la peine d'être discuté.
  appariements.sort((x, y) => y.montant - x.montant);

  return {
    appariements,
    fonds: lectures.map((l) => ({
      id: l.id,
      nom: l.nom,
      dateInventaire: l.dateInventaire,
    })),
    montantTotal: appariements.reduce((s, x) => s + x.montant, 0),
    avertissements,
  };
}

/** Une rencontre, chiffrée et assortie de ses réserves. */
function batir(
  axe: AxeInterfonds,
  bucket: string,
  v: Cote,
  a: Cote,
  montant: number,
  coursSite: Awaited<ReturnType<typeof indexerCoursSite>>,
  liquiditeAcheteur: number | null,
): AppariementInterfonds {
  const reserves: string[] = [];

  // LE COURS DU SITE, celui qu'affichent /marches/actions et la fiche du
  // titre. Un transfert interne se fait au prix du marché — c'est la seule
  // façon qu'aucun des deux porteurs ne soit lésé, et la première chose que
  // le dépositaire et le commissaire aux comptes vérifieront.
  const cours =
    axe === "action_titre" ? (coursDe(coursSite, bucket)?.prix ?? null) : null;
  const quantite = cours && cours > 0 ? Math.floor(montant / cours) : null;
  if (axe === "action_titre" && !(cours && cours > 0)) {
    reserves.push("Cours indisponible : la quantité se fixe à la saisie de l'ordre.");
  }

  // Les lignes du vendeur, la plus grosse d'abord : c'est par là qu'on sort.
  const lignes = [...v.ligne.positions].sort((x, y) => y.valorisation - x.valorisation);
  if (axe === "obligation_emetteur") {
    reserves.push(
      "L'axe par émetteur ne contraint pas la maturité : vérifie que la ligne cédée " +
        "sert aussi la tranche visée par l'acheteur.",
    );
    if (lignes.length > 1 && lignes[0].valorisation < montant) {
      reserves.push(
        `Aucune ligne ne couvre seule ${fmtFr(montant)} F : il en faudra plusieurs.`,
      );
    }
  }

  // LA CONTREPARTIE DOIT POUVOIR PAYER. Un appariement que l'acheteur ne peut
  // pas régler n'est pas une proposition, c'est un vœu — et il se découvre au
  // dénouement, quand le dépositaire refuse.
  if (liquiditeAcheteur !== null && liquiditeAcheteur < montant) {
    reserves.push(
      `Trésorerie de l'acheteur : ${fmtFr(liquiditeAcheteur)} F pour ${fmtFr(
        montant,
      )} F à régler. Il faudra céder en face, ou échelonner.`,
    );
  }

  const partie = (c: Cote, vise: number): PartieInterfonds => ({
    fondsId: c.fondsId,
    fondsNom: c.fondsNom,
    montantVise: vise,
    valeurActuelle: c.ligne.valeurActuelle,
    allocationActuelle: c.ligne.allocationActuelle,
    allocationValidee: c.ligne.allocationValidee,
  });

  return {
    axe,
    poste: bucket,
    libelle: v.ligne.libelle || a.ligne.libelle || bucket,
    vendeur: partie(v, Math.abs(v.ligne.montantARealiser ?? 0)),
    acheteur: partie(a, Math.abs(a.ligne.montantARealiser ?? 0)),
    montant,
    cours,
    quantite,
    lignes: lignes.slice(0, 3),
    reserves,
  };
}
