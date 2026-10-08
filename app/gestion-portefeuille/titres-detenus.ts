import "server-only";

// === Tous les titres obligataires détenus, tous fonds confondus ===========
//
// LA QUESTION QU'ON NE POUVAIT PAS POSER. « Combien d'OAT du Sénégal reste-t-il
// disponible, et dans quels fonds ? » demandait d'ouvrir quinze inventaires,
// d'y retrouver les lignes souveraines, puis de retrancher de tête les titres
// prêtés et ceux pris en réméré. Une demi-journée, et une erreur par
// distraction à chaque fois.
//
// UNE SEULE LISTE, PLATE, QUI SE TRIE. Chaque ligne est un titre dans un
// fonds, avec sa nature, son émetteur, son échéance, et surtout CE QUI EN
// RESTE RÉELLEMENT CESSIBLE.
//
// LA QUANTITÉ QUI COMPTE N'EST PAS CELLE DE L'INVENTAIRE. Quatre choses s'en
// retranchent, et c'est le contrôle de cession qui les tient — le même que
// celui qui refuse une vente : les titres PRÊTÉS sont dehors, ceux PRIS EN
// RÉMÉRÉ doivent retourner à la contrepartie, la part non servie des ventes
// déjà passées est promise, et les mouvements postérieurs à l'arrêté s'y
// ajoutent. En écrire une seconde version ici aurait garanti que les deux
// divergent — et c'est la version de l'écran qui aurait eu tort.
//
// LE MODULE NE FILTRE RIEN, IL DÉCRIT. Les filtres sont à l'écran, parce que
// c'est là qu'on cherche, et qu'une liste rendue déjà réduite ne se recompose
// pas sans un aller-retour au serveur.

import { loadBonds, loadListedBonds } from "@/lib/dataLoader";
import { countryNames, type Bond, type BondCountry } from "@/lib/bondsUEMOA";
import type { ListedBond } from "@/lib/listedBondsTypes";

import { loadMyFunds } from "./data";
import { loadCustomSecurities } from "./portfolio-data";
import {
  disponibiliteCession,
  positionsDeReference,
} from "./operations-marche-disponibilite";
import type { CustomSecurity } from "./portfolio-types";

const num = (v: unknown, d = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : d;
  }
  return d;
};

/**
 * NATURE DU TITRE, et c'est le premier tri qu'on demande à cette liste.
 *
 * Les trois premières viennent du guichet UMOA-Titres et sont celles de son
 * référentiel ; « Cotée » désigne la cote obligataire BRVM ; « Non cotée »,
 * tout ce qui ne se négocie que de gré à gré et n'existe que dans les fiches
 * du gérant.
 */
export type NatureTitre = "OAT" | "BAT" | "OTAR" | "Cotée" | "Non cotée";

export const NATURES: NatureTitre[] = ["OAT", "BAT", "OTAR", "Cotée", "Non cotée"];

/** Un titre obligataire détenu par un fonds, et ce qui en reste cessible. */
export type TitreDetenu = {
  /** Clef de ligne : un même titre peut être détenu par plusieurs fonds. */
  cle: string;
  fondsId: string;
  fondsNom: string;
  isin: string;
  code: string;
  libelle: string;
  nature: NatureTitre;
  /** Émetteur tel que le référentiel le nomme. */
  emetteur: string;
  /** Code pays de l'État émetteur, vide pour un titre non souverain. */
  pays: BondCountry | "";
  /** Le pays en toutes lettres, ou l'émetteur à défaut : c'est la colonne. */
  etat: string;
  facial: number;
  echeance: string;
  /** Durée résiduelle en années, à la date du jour. */
  dureeResiduelle: number;

  // ── Les caractéristiques de l'emprunt ───────────────────────────────────
  //
  // TOUTES PRÉSENTES, TOUTES TRIABLES. On cherche parfois « les emprunts en
  // différé », parfois « les coupures autres que 10 000 », parfois « ce qui
  // paie trimestriellement » — et rien ne permet de deviner d'avance laquelle
  // de ces questions se posera.
  /** Valeur nominale par titre — 10 000 F pour un souverain, tout autre
   *  chose pour un emprunt de gré à gré placé en grosses coupures. */
  nominal: number;
  /** Date d'émission, ISO. */
  emission: string;
  /** Coupons par an : 1, 2 ou 4. Zéro quand le référentiel ne le dit pas. */
  frequence: number;
  /** Profil d'amortissement, en clair. */
  amortissement: string;
  /** Secteur ou nature de l'émetteur, tel que le référentiel le classe. */
  secteur: string;

  // ── Les quantités, et tout ce qui les grève ─────────────────────────────
  quantiteInventaire: number;
  pretee: number;
  remeree: number;
  engagee: number;
  mouvements: number;
  /** CE QUI RESTE RÉELLEMENT CESSIBLE. C'est la colonne qu'on trie. */
  disponible: number;

  valorisation: number;
  /** Valorisation d'inventaire par titre. */
  prixInventaire: number;
  dateInventaire: string | null;
};

export type InventaireTitres = {
  titres: TitreDetenu[];
  fonds: { id: string; nom: string; dateInventaire: string | null }[];
  avertissements: string[];
};

const normId = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase();

/**
 * Tous les titres obligataires détenus, fonds par fonds.
 *
 * CALCUL À LA DEMANDE, jamais au rendu de la page : il lit l'inventaire ET le
 * carnet d'ordres de TOUS les fonds. Le faire à chaque affichage du module
 * d'importation le ferait payer à qui vient simplement charger un fichier.
 */
export async function construireTitresDetenus(): Promise<InventaireTitres> {
  const fonds = await loadMyFunds();
  const avertissements: string[] = [];

  const customs = await loadCustomSecurities();
  const customParId = new Map(customs.map((c) => [c.id, c]));

  const souverainParIsin = new Map<string, Bond>();
  for (const b of loadBonds()) {
    if (b.isin) souverainParIsin.set(normId(b.isin), b);
  }
  const coteParCle = new Map<string, ListedBond>();
  for (const b of loadListedBonds()) {
    if (b.isin) coteParCle.set(normId(b.isin), b);
    if (b.code) coteParCle.set(normId(b.code), b);
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const titres: TitreDetenu[] = [];
  const resume: InventaireTitres["fonds"] = [];

  // Fonds par fonds, et non tout de front : chaque fonds enchaîne autant de
  // calculs de disponibilité qu'il a de lignes, et les lancer tous ensemble
  // ouvrirait quinze fois le carnet en parallèle sans rien gagner — les
  // lectures sont déjà mémoïsées par fonds.
  for (const f of fonds) {
    const snapshot = await positionsDeReference(f.id);
    resume.push({ id: f.id, nom: f.nom, dateInventaire: snapshot?.asOfDate ?? null });
    if (!snapshot) continue;

    for (const p of snapshot.positions) {
      if (p.section !== "obligation") continue;
      const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
      const cle = normId(custom?.isin || custom?.code || p.matchId || p.rawCode || "");
      if (!cle) continue;

      const souverain = souverainParIsin.get(cle);
      const cote = coteParCle.get(cle);
      const nature = natureDe(souverain, cote, custom);

      const libelle =
        souverain?.nameShort || cote?.name || custom?.name || p.rawLabel || cle;
      const isin = souverain?.isin || cote?.isin || custom?.isin || cle;
      const code = cote?.code || custom?.code || p.rawCode || "";
      const facial = souverain?.couponRate ?? cote?.couponRate ?? tauxDeLaFiche(custom);
      const echeance =
        souverain?.maturityDate || cote?.maturityDate || echeanceDeLaFiche(custom) || "";

      const dispo = await disponibiliteCession(f.id, isin || cle, libelle);
      const quantiteInventaire = num(p.quantity);
      const valorisation = num(p.valuation);

      titres.push({
        cle: `${f.id}|${cle}`,
        fondsId: f.id,
        fondsNom: f.nom,
        isin,
        code,
        libelle,
        nature,
        emetteur: souverain?.issuer || cote?.issuer || emetteurDeLaFiche(custom) || "—",
        pays: (souverain?.country ?? "") as BondCountry | "",
        etat: souverain
          ? (countryNames[souverain.country] ?? souverain.country)
          : cote?.country || emetteurDeLaFiche(custom) || "—",
        facial,
        echeance,
        dureeResiduelle: anneesJusqua(aujourdhui, echeance),
        nominal:
          num(souverain?.nominalValue) ||
          num(cote?.nominalOrigine) ||
          num(cote?.nominalValue) ||
          num(custom?.attributes?.nominalValue) ||
          0,
        emission: souverain?.issueDate || cote?.issueDate || "",
        frequence: souverain?.frequency ?? cote?.couponFrequency ?? 0,
        amortissement: profilAmortissement(souverain, cote, custom),
        secteur: cote?.sector || cote?.issuerType || (souverain ? "Souverain" : "—"),
        quantiteInventaire,
        pretee: dispo.pretee,
        remeree: dispo.remeree,
        engagee: dispo.engagee,
        mouvements: dispo.mouvements,
        disponible: Math.max(0, dispo.disponible),
        valorisation,
        prixInventaire: quantiteInventaire > 0 ? valorisation / quantiteInventaire : 0,
        dateInventaire: snapshot.asOfDate,
      });
    }
  }

  const sansInventaire = resume.filter((r) => r.dateInventaire === null);
  if (sansInventaire.length > 0) {
    avertissements.push(
      `${sansInventaire.length} fonds sans inventaire importé : ${sansInventaire
        .map((r) => r.nom)
        .join(", ")}.`,
    );
  }
  const dates = new Set(resume.map((r) => r.dateInventaire).filter(Boolean));
  if (dates.size > 1) {
    const triees = [...dates].sort();
    avertissements.push(
      `Les inventaires ne sont pas tous arrêtés à la même date (du ${triees[0]} au ${
        triees[triees.length - 1]
      }) : les quantités ne se totalisent qu'avec cette réserve.`,
    );
  }

  // Les plus grosses lignes d'abord, par défaut : c'est ce qu'on cherche quand
  // on ouvre la liste sans savoir encore ce qu'on y cherche.
  titres.sort((a, b) => b.valorisation - a.valorisation);

  return { titres, fonds: resume, avertissements };
}

/**
 * LA NATURE SE LIT AU RÉFÉRENTIEL, pas à la forme de l'ISIN. Un code pays
 * suivi de chiffres désigne aussi bien une OAT qu'un BAT qu'un emprunt coté :
 * deviner d'après la chaîne aurait mélangé les trois.
 */
function natureDe(
  souverain: Bond | undefined,
  cote: ListedBond | undefined,
  custom: CustomSecurity | undefined,
): NatureTitre {
  if (souverain) {
    if (souverain.type === "OAT" || souverain.type === "BAT" || souverain.type === "OTAR")
      return souverain.type;
    return "Non cotée";
  }
  if (cote) return "Cotée";
  // Une fiche du gérant qui se dit cotée l'est : elle porte alors l'attribut,
  // même si la cote ne la connaît pas encore sous ce code.
  const source = (custom?.attributes?.source ?? "").trim();
  if (source === "listed-bond") return "Cotée";
  if (source === "sovereign") return "OAT";
  return "Non cotée";
}

/**
 * LE PROFIL D'AMORTISSEMENT, en clair.
 *
 * Le gisement souverain modélise ses OAT IN FINE — coupons sur nominal
 * constant, capital au dernier flux —, et c'est ce que déroule l'échéancier du
 * site. La cote, elle, porte son profil et son MODE : « sur nominal » fait
 * baisser la valeur du titre, « sur titre » en fait disparaître des unités, et
 * les deux ne se lisent pas au même endroit du portefeuille.
 */
function profilAmortissement(
  souverain: Bond | undefined,
  cote: ListedBond | undefined,
  custom: CustomSecurity | undefined,
): string {
  if (cote) {
    const type = (cote.amortizationType || "IF").toUpperCase();
    if (type === "IF") return "In fine";
    const mode = cote.amortizationMode === "T" ? "sur titre" : "sur nominal";
    return `${type === "AC" ? "Constant" : type === "ACD" ? "Constant différé" : type} — ${mode}`;
  }
  if (souverain) return "In fine";
  const profil = (custom?.attributes?.amortizationProfile ?? "").trim();
  return profil || "—";
}

function tauxDeLaFiche(c: CustomSecurity | undefined): number {
  const t = num(c?.attributes?.couponRate);
  // Le référentiel du gérant saisit le taux en POUR CENT ; le gisement du site
  // le porte en décimal. On ramène à la convention du site.
  return t > 1 ? t / 100 : t;
}

function echeanceDeLaFiche(c: CustomSecurity | undefined): string {
  return (c?.attributes?.maturityDate ?? "").trim();
}

function emetteurDeLaFiche(c: CustomSecurity | undefined): string {
  return (c?.attributes?.issuer ?? "").trim();
}

/** Années entre deux dates, zéro si l'échéance est passée ou inconnue. */
function anneesJusqua(debut: string, echeance: string): number {
  if (!echeance) return 0;
  const ms =
    new Date(`${echeance}T00:00:00Z`).getTime() - new Date(`${debut}T00:00:00Z`).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms / (365.25 * 86_400_000)) : 0;
}
