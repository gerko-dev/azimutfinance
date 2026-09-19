import "server-only";

// === Opérations de marché : choix du titre et intérêts courus ===
//
// Le gérant ne doit pas retaper un ISIN ni un taux facial : le site les
// connaît. Deux gisements, selon le marché :
//
//  - MFR — le référentiel BRVM : actions et obligations COTÉES.
//  - MTP — les titres publics UMOA, choisis par État puis par ISIN.
//
// Les intérêts courus se calculent d'après les caractéristiques du titre. Les
// ressaisir à la main était la porte ouverte à un zéro oublié sur un montant à
// neuf chiffres.

import { loadListedBonds, loadStocks, loadUmoaEmissions } from "@/lib/dataLoader";
import { calculateAccruedInterest } from "@/lib/bondMath";
import type { Bond, BondCountry } from "@/lib/bondsUEMOA";
import { computeCurrentNominalPerTitre } from "@/lib/listedBondsTypes";

import type { Instrument } from "./operations-marche-types";

/** Un titre proposé au choix dans le formulaire. */
export type OptionTitre = {
  /** Clef de sélection : le mnémonique pour une action, l'ISIN sinon. */
  cle: string;
  libelle: string;
  isin: string;
  instrument: Instrument;
  /** Ce qui permet de reconnaître le titre dans une liste longue. */
  detail: string;
};

/** Caractéristiques servant à pré-remplir la saisie. */
export type CaracteristiquesTitre = {
  isin: string;
  libelle: string;
  instrument: Instrument;
  /** Valeur nominale par titre, à la date demandée. */
  nominal: number;
  /** Taux facial annuel, en décimal. 0 pour une action. */
  tauxCoupon: number;
  echeance: string;
  /** Intérêts courus PAR TITRE à la date d'opération. Le formulaire les
   *  multiplie par la quantité. */
  couruParTitre: number;
  /** Ce que le gérant doit savoir sur ce chiffre — approximation d'un
   *  amortissement, titre sans coupon, date hors de la vie du titre. */
  avertissement: string | null;
};

const iso = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "");

/** Actions et obligations cotées : le référentiel du marché financier régional. */
export function titresMfr(): OptionTitre[] {
  const actions: OptionTitre[] = loadStocks().map((s) => ({
    cle: s.code,
    libelle: s.name,
    isin: s.isin ?? "",
    instrument: "actions",
    detail: `Action · ${s.country || "—"}`,
  }));

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const obligations: OptionTitre[] = loadListedBonds()
    // Un titre échu ne se négocie plus : le proposer n'aurait aucun sens et
    // ferait de la place à une erreur de sélection.
    .filter((b) => !b.maturityDate || b.maturityDate >= aujourdhui)
    .map((b) => ({
      cle: b.isin || b.code,
      libelle: b.name,
      isin: b.isin ?? "",
      instrument: "obligations",
      detail: `Obligation cotée · ${(b.couponRate * 100).toFixed(2)} % · éch. ${
        b.maturityDate || "—"
      }`,
    }));

  return [...actions, ...obligations].sort((a, b) =>
    a.libelle.localeCompare(b.libelle, "fr"),
  );
}

/**
 * Titres publics UMOA vivants, dedupliques par ISIN.
 *
 * LA SOURCE EST `loadUmoaEmissions`, PAS `loadBonds`. Ce dernier ne garde que
 * les OAT — il ecarte explicitement tout ce qui n'en est pas — alors que le
 * gerant traite aussi des BAT. S'appuyer dessus aurait produit un menu ou les
 * bons du Tresor n'apparaissent jamais, sans que rien ne le signale.
 *
 * Un meme ISIN revient a chaque reabondement : on garde le round le PLUS
 * ANCIEN, qui porte le coupon nominal d'origine — c'est la convention que
 * `loadBonds` applique deja, et en changer ferait diverger les deux.
 */
type TitrePublic = {
  isin: string;
  pays: string;
  paysNom: string;
  type: "OAT" | "BAT";
  couponRate: number;
  dateEmission: string;
  echeance: string;
};

function titresPublics(): TitrePublic[] {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const parIsin = new Map<string, TitrePublic>();
  for (const e of loadUmoaEmissions()) {
    if (!e.isin || e.isin === "--") continue;
    if (!e.maturityDate || e.maturityDate < aujourdhui) continue;
    const existant = parIsin.get(e.isin);
    if (existant && existant.dateEmission <= e.date) continue;
    parIsin.set(e.isin, {
      isin: e.isin,
      pays: e.country,
      paysNom: e.countryName || e.country,
      type: e.type,
      // Un BAT est escompte : pas de coupon, donc pas de courus.
      couponRate: e.type === "BAT" ? 0 : (e.couponRate ?? 0),
      dateEmission: e.date,
      echeance: e.maturityDate,
    });
  }
  return [...parIsin.values()];
}

/** États émetteurs de titres publics, dans l'ordre alphabétique. */
export function etatsMtp(): { code: string; nom: string }[] {
  const vus = new Map<string, string>();
  for (const t of titresPublics()) if (!vus.has(t.pays)) vus.set(t.pays, t.paysNom);
  return [...vus.entries()]
    .map(([code, nom]) => ({ code, nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Titres publics d'un État — OAT et BAT —, par échéance croissante.
 *
 *  Par ÉCHÉANCE et non par ISIN : le gérant cherche une maturité, pas un
 *  matricule. Deux titres du même État se distinguent d'abord par leur date de
 *  remboursement. */
export function titresMtp(pays: string): OptionTitre[] {
  return titresPublics()
    .filter((t) => t.pays === pays)
    .sort((a, b) => a.echeance.localeCompare(b.echeance) || a.isin.localeCompare(b.isin))
    .map((t) => ({
      cle: t.isin,
      libelle: t.isin,
      isin: t.isin,
      instrument: "mtp" as Instrument,
      detail:
        t.type === "BAT"
          ? `BAT · escompté · éch. ${t.echeance}`
          : `OAT · ${(t.couponRate * 100).toFixed(2)} % · éch. ${t.echeance}`,
    }));
}

/**
 * Intérêts courus par titre, à une date donnée.
 *
 * Act/365, coupon annualisé proratisé en jours depuis le dernier détachement,
 * plafonné à un coupon de période — c'est `calculateAccruedInterest`, la
 * fonction que le reste du site emploie déjà. Un calcul maison ici aurait fini
 * par diverger du simulateur YTM et des fiches obligataires.
 */
function couru(bond: Bond, dateOperation: string): number {
  const d = new Date(`${iso(dateOperation) || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 0;
  if (bond.couponRate <= 0) return 0;
  return calculateAccruedInterest(bond, d).accruedInterest;
}

export function caracteristiques(
  marche: "mfr" | "mtp",
  cle: string,
  pays: string,
  dateOperation: string,
): CaracteristiquesTitre | null {
  if (marche === "mtp") {
    const tous = titresPublics();
    const t = tous.find((x) => x.isin === cle && x.pays === pays) ?? tous.find((x) => x.isin === cle);
    if (!t) return null;
    // Nominal de 10 000 F : la convention UMOA-Titres, celle que `loadBonds`
    // emploie aussi.
    const equivalent: Bond = {
      isin: t.isin,
      nameShort: `${t.type} ${t.pays}`,
      issuer: `État ${t.paysNom}`,
      country: t.pays as BondCountry,
      type: t.type,
      nominalValue: 10_000,
      couponRate: t.couponRate,
      issueDate: t.dateEmission,
      maturityDate: t.echeance,
      frequency: 1,
      isin_registered: true,
    };
    return {
      isin: t.isin,
      libelle: `${t.type} ${t.paysNom} ${t.isin}`,
      instrument: "mtp",
      nominal: 10_000,
      tauxCoupon: t.couponRate,
      echeance: t.echeance,
      couruParTitre: couru(equivalent, dateOperation),
      avertissement:
        t.type === "BAT"
          ? "Bon assimilable du Trésor : escompté, sans coupon — les courus sont donc nuls."
          : null,
    };
  }

  // ── MFR : action ou obligation cotée ───────────────────────────────────
  const action = loadStocks().find((s) => s.code === cle);
  if (action) {
    return {
      isin: action.isin ?? "",
      libelle: action.name,
      instrument: "actions",
      nominal: 0,
      tauxCoupon: 0,
      echeance: "",
      couruParTitre: 0,
      avertissement: null,
    };
  }

  const ob = loadListedBonds().find((b) => b.isin === cle || b.code === cle);
  if (!ob) return null;

  // Le nominal d'une obligation amortissable DÉCROÎT : les courus se calculent
  // sur le capital encore dû, pas sur les 10 000 F d'origine. La convention
  // BRVM et le mode d'amortissement du titre donnent ce nominal courant.
  const nominal = computeCurrentNominalPerTitre({
    amortizationType: ob.amortizationType,
    amortizationMode: ob.amortizationMode,
    issueDate: ob.issueDate,
    maturityDate: ob.maturityDate,
    firstAmortizationDate: ob.firstAmortizationDate,
    couponFrequency: ob.couponFrequency,
    today: iso(dateOperation) ? new Date(`${dateOperation}T00:00:00Z`) : undefined,
  });

  const equivalent: Bond = {
    isin: ob.isin,
    nameShort: ob.name,
    issuer: ob.issuer,
    country: (ob.country as BondCountry) ?? "CI",
    type: "Corporate",
    nominalValue: nominal,
    couponRate: ob.couponRate,
    issueDate: ob.issueDate,
    maturityDate: ob.maturityDate,
    frequency: ob.couponFrequency,
    isin_registered: true,
  };

  return {
    isin: ob.isin ?? "",
    libelle: ob.name,
    instrument: "obligations",
    nominal,
    tauxCoupon: ob.couponRate,
    echeance: ob.maturityDate,
    couruParTitre: couru(equivalent, dateOperation),
    avertissement:
      ob.amortizationType !== "IF" && ob.amortizationMode === "N"
        ? "Titre amortissable : les courus sont calculés sur le nominal restant dû, " +
          "déduit des dates d'amortissement. Vérifie-les contre l'avis d'opéré."
        : null,
  };
}
