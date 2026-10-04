import "server-only";

// === Les titres NON COTÉS du référentiel du gérant ========================
//
// UN MARCHÉ DE GRÉ À GRÉ N'A PAS DE CALENDRIER. Le guichet UMOA-Titres publie
// ses OAT et ses BAT, la BRVM publie sa cote ; entre les deux vit tout ce que
// le gérant achète de la main à la main — FCTC, emprunts d'entreprise placés
// en privé, créances titrisées. Ces titres-là ne figurent à aucun référentiel
// public : ils n'existent que dans les fiches du gérant.
//
// ON NE POUVAIT DONC PAS LES NÉGOCIER. La saisie d'un achat ou d'une vente MTP
// commence par choisir un État émetteur, puis l'un de ses titres publics : un
// emprunt SOROUBAT ou une tranche FCTC n'avait aucune case où entrer, alors
// même que l'inventaire les porte et que le module leur déroule un échéancier.
//
// LE REFERENTIEL DU GERANT DEVIENT UN EMETTEUR COMME UN AUTRE, sous le nom
// « Autres instruments non cotés ». Il prend sa place à côté des huit États
// dans la même liste, et la suite de la saisie ne change pas.
//
// CE QU'ON Y MET, ET CE QU'ON EN ÉCARTE. Toute fiche d'obligation qui n'est ni
// à la cote ni au guichet souverain. Une fiche LIÉE au site — « source »
// listed-bond ou sovereign — est déjà proposée par son propre gisement, et
// l'offrir deux fois ferait deux titres là où il n'y en a qu'un.

import { loadCustomSecurities } from "./portfolio-data";
import { ficheEnObligation } from "./esv-data";
import type { CustomSecurity } from "./portfolio-types";
import type { CaracteristiquesTitre, OptionTitre } from "./operations-marche-titres";
import type { Instrument } from "./operations-marche-types";

// Le code d'émetteur vit dans un module SANS « server-only » : l'écran de
// saisie en a besoin, et il est client.
export {
  EMETTEUR_NON_COTES,
  LIBELLE_NON_COTES,
} from "./operations-marche-non-cotes-cles";


/** La fiche décrit-elle un titre de gré à gré, hors cote et hors guichet ? */
function estNonCote(c: CustomSecurity): boolean {
  if (c.kind !== "obligation") return false;
  const a = c.attributes ?? {};
  // Une fiche LIÉE au site est déjà au gisement coté ou souverain.
  const source = (a.source ?? "").trim();
  if (source === "listed-bond" || source === "sovereign") return false;
  if ((a.cote ?? "").trim() === "cote") return false;
  return true;
}

/** Ce que la fiche dit de son échéance, pour trier et décrire. */
function echeanceDe(c: CustomSecurity): string {
  return (c.attributes?.maturityDate ?? "").trim();
}

/**
 * Les titres non cotés du gérant, par échéance croissante.
 *
 * PAR ÉCHÉANCE, comme les titres publics : le gérant cherche une maturité, pas
 * un matricule, et deux emprunts du même émetteur se distinguent d'abord par
 * leur date de remboursement.
 */
export async function titresNonCotes(): Promise<OptionTitre[]> {
  const fiches = await loadCustomSecurities();
  return fiches
    .filter(estNonCote)
    .sort(
      (a, b) =>
        echeanceDe(a).localeCompare(echeanceDe(b)) || a.name.localeCompare(b.name, "fr"),
    )
    .map((c) => {
      const a = c.attributes ?? {};
      const taux = Number(String(a.couponRate ?? "").replace(",", "."));
      const echeance = echeanceDe(c);
      const detail = [
        (a.issuer ?? "").trim() || "émetteur non renseigné",
        Number.isFinite(taux) && taux > 0 ? `${taux} %` : null,
        echeance ? `éch. ${echeance}` : "sans échéance au référentiel",
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        // LA CLEF EST LE CODE DE LA FICHE, comme l'ISIN l'est pour un titre
        // public : c'est lui que l'opération enregistrera, et c'est sous lui
        // que l'inventaire porte la ligne. Prendre l'identifiant de fiche
        // aurait produit une opération qu'aucun contrôle de cession n'aurait
        // su rapprocher de ce que le fonds détient.
        cle: c.code || c.id,
        symbole: c.code ?? "",
        libelle: c.name,
        isin: c.isin ?? "",
        instrument: "mtp" as Instrument,
        detail,
      };
    });
}

/**
 * Les caractéristiques d'un titre non coté, tirées de sa fiche.
 *
 * ON NE RÉÉCRIT PAS L'ÉCHÉANCIER. `ficheEnObligation` sait déjà construire une
 * obligation du site à partir d'une fiche — nominal, taux, profil, différé — et
 * c'est elle que le calendrier ESV et l'export des soldes emploient. En écrire
 * une seconde version ici aurait garanti que les trois divergent.
 */
export async function caracteristiquesNonCote(
  cleFiche: string,
  dateOperation: string,
): Promise<CaracteristiquesTitre | null> {
  const fiches = await loadCustomSecurities();
  // Par code, par identifiant ou par ISIN : la clef vient de l'écran, et elle
  // a pu être posée sous l'une ou l'autre forme selon l'âge de la fiche.
  const k = cleFiche.trim().toUpperCase();
  const egal = (v: string | null | undefined) => (v ?? "").trim().toUpperCase() === k;
  const c = fiches.find((x) => egal(x.code) || egal(x.id) || (x.isin && egal(x.isin)));
  if (!c) return null;

  const bond = ficheEnObligation(c);
  const a = c.attributes ?? {};
  const nominal = Number(String(a.nominalValue ?? "").replace(/\s/g, "").replace(",", "."));
  const taux = Number(String(a.couponRate ?? "").replace(",", ".")) / 100;

  // LE COURU SE CALCULE SUR LA VALEUR NOMINALE DE LA FICHE, jamais sur une
  // coupure de 10 000 F : un emprunt privé se place en grosses coupures —
  // SOROUBAT à 5 000 000, APRIL OIL à 50 000 000 — et la convention de la cote
  // y rendrait des courus mille fois trop petits.
  const echeance = (a.maturityDate ?? "").trim();
  // UN TITRE ECHU NE COURT PLUS. Sans ce garde-fou, une fiche restée au
  // référentiel après son remboursement — SOROUBAT, échue en février —
  // continuait d'accumuler : deux cent quarante-deux jours de courus sur un
  // titre qui n'existe plus.
  const echu = !!echeance && echeance < dateOperation;

  const couruParTitre = (() => {
    if (echu) return 0;
    if (!bond || !(nominal > 0) || !(taux > 0)) return 0;
    const dernier = dernierDetachement(bond.issueDate, a.maturityDate ?? "", dateOperation);
    if (!dernier) return 0;
    const jours =
      (new Date(`${dateOperation}T00:00:00Z`).getTime() -
        new Date(`${dernier}T00:00:00Z`).getTime()) /
      86_400_000;
    if (!(jours >= 0)) return 0;
    return (nominal * taux * Math.min(jours, 365)) / 365;
  })();

  const dernier =
    bond && !echu ? dernierDetachement(bond.issueDate, echeance, dateOperation) : "";
  const jours = dernier
    ? Math.max(
        0,
        Math.round(
          (new Date(`${dateOperation}T00:00:00Z`).getTime() -
            new Date(`${dernier}T00:00:00Z`).getTime()) /
            86_400_000,
        ),
      )
    : 0;

  return {
    isin: c.isin || c.code || c.id,
    libelle: c.name,
    instrument: "mtp",
    nominal: nominal > 0 ? nominal : 0,
    tauxCoupon: Number.isFinite(taux) ? taux : 0,
    echeance,
    couruParTitre,
    dernierDetachement: dernier,
    joursCourus: jours,
    avertissement: echu
      ? `Ce titre est échu depuis le ${echeance} : aucun intérêt ne court plus. ` +
        "Vérifie l'échéance au référentiel si tu le négocies encore."
      : !bond
        ? "La fiche de ce titre n'a ni échéance ni valeur nominale : aucun couru ne peut être " +
          "calculé. Complète-la au référentiel, ou saisis les courus d'après l'avis d'opéré."
        : !(nominal > 0)
          ? "Aucune valeur nominale au référentiel : les courus ne peuvent pas être calculés."
          : !(taux > 0)
            ? "Aucun taux d'intérêt au référentiel : les courus ne peuvent pas être calculés."
            : "Titre de gré à gré : les caractéristiques viennent de TA fiche, et non d'un " +
              "référentiel public. Vérifie-les contre l'avis d'opéré.",
  };
}

/**
 * Le dernier détachement avant une date, par anniversaires de l'échéance.
 *
 * On remonte depuis l'échéance, année par année : c'est ainsi que le générateur
 * du site construit les dates de coupon, et deux façons de les poser auraient
 * fini par donner deux courus.
 */
function dernierDetachement(emission: string, echeance: string, aLaDate: string): string {
  if (!echeance || !aLaDate) return "";
  const [ae, me, de] = echeance.split("-").map(Number);
  if (!ae || !me || !de) return "";
  let retenu = "";
  for (let an = ae; an >= ae - 60; an--) {
    const d = `${String(an).padStart(4, "0")}-${String(me).padStart(2, "0")}-${String(de).padStart(2, "0")}`;
    if (d <= aLaDate && (!emission || d >= emission)) {
      retenu = d;
      break;
    }
  }
  return retenu || emission;
}
