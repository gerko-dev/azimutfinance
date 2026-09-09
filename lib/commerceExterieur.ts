// === COMMERCE EXTERIEUR DE L'UMOA ===
//
// SERVER-ONLY : lit data/macro.csv via macroLoader.
//
// Source : feuille « BP VI » de la base BCEAO, c'est-a-dire la balance des
// paiements au format BPM6. Elle couvre 1974 a 2025 pour les huit pays et
// l'ensemble UMOA, en MILLIARDS DE FCFA.
//
// Pourquoi la BP VI et pas les statistiques douanieres : le bulletin mensuel
// BCEAO qui alimente le reste de cette page ne porte aucune donnee de commerce
// exterieur. La balance des paiements est la seule source homogene entre les
// huit pays, au prix d'une frequence ANNUELLE et d'un decalage de publication
// que la fiche annonce.

import { getMultiCountrySeries } from "./macroLoader";
import { MACRO_COUNTRIES, type MacroCountryCode } from "./macroTypes";

const FEUILLE = "BP VI";

/** Libelles exacts de la feuille BP VI. Le deux-points d'« Exportations de
 *  biens FOB : » est dans la source ; le retirer ferait manquer la serie. */
const POSTES = {
  exports: "Exportations de biens FOB :",
  imports: "Importations de biens FOB",
  balanceBiens: "Balance des biens",
  balanceServices: "Balances des services",
  courant: "Compte des transactions courantes (1+2+3)",
} as const;

export type PosteCommerce = keyof typeof POSTES;

export type PointCommerce = { annee: string; valeur: number };

export type SerieCommerce = {
  poste: PosteCommerce;
  label: string;
  points: PointCommerce[];
};

export type LigneCommercePays = {
  code: MacroCountryCode;
  nom: string;
  exports: number | null;
  imports: number | null;
  balance: number | null;
  /** Exportations rapportees aux importations. Au-dessus de 1, le pays finance
   *  ses achats par ses ventes ; en dessous, il comble par autre chose. */
  couverture: number | null;
  /** Part du pays dans les exportations de l'Union. */
  partExports: number | null;
};

export type CommerceExterieur = {
  /** Series annuelles de l'ensemble UMOA, tronquees aux `annees` dernieres. */
  umoa: SerieCommerce[];
  /** Derniere annee commune a l'ensemble des postes. */
  derniereAnnee: string;
  /** Repartition par pays sur cette derniere annee. */
  pays: LigneCommercePays[];
  /** Vrai si la derniere annee disponible n'est pas l'annee civile en cours :
   *  la balance des paiements se publie avec un an de retard, et l'utilisateur
   *  doit le savoir avant de conclure. */
  totalExports: number | null;
  totalImports: number | null;
  totalBalance: number | null;
  /** Somme des exportations des huit pays, intra-union comprise. Superieure a
   *  `totalExports`, qui la consolide — l'ecart est le commerce interne. */
  sommePaysExports: number | null;
};

const LABELS: Record<PosteCommerce, string> = {
  exports: "Exportations de biens (FOB)",
  imports: "Importations de biens (FOB)",
  balanceBiens: "Balance des biens",
  balanceServices: "Balance des services",
  courant: "Compte des transactions courantes",
};

/** Dernier point d'une serie a une annee donnee. */
function valeurA(points: PointCommerce[], annee: string): number | null {
  const p = points.find((x) => x.annee === annee);
  return p ? p.valeur : null;
}

export function loadCommerceExterieur(annees = 25): CommerceExterieur {
  const parPoste = {} as Record<PosteCommerce, Map<MacroCountryCode, PointCommerce[]>>;
  for (const [poste, indicateur] of Object.entries(POSTES) as Array<
    [PosteCommerce, string]
  >) {
    const brut = getMultiCountrySeries(FEUILLE, indicateur);
    const m = new Map<MacroCountryCode, PointCommerce[]>();
    for (const [pays, rows] of brut) {
      m.set(
        pays,
        rows
          .filter((r) => Number.isFinite(r.value))
          .map((r) => ({ annee: r.iso, valeur: r.value }))
          .sort((a, b) => a.annee.localeCompare(b.annee)),
      );
    }
    parPoste[poste] = m;
  }

  const umoaBrut = (Object.keys(POSTES) as PosteCommerce[]).map((poste) => ({
    poste,
    label: LABELS[poste],
    points: parPoste[poste].get("UMOA") ?? [],
  }));

  // Derniere annee ou les deux postes du commerce de biens sont renseignes.
  // On ne prend pas le maximum global : un poste publie en avance donnerait une
  // colonne « importations » vide en face d'exportations chiffrees.
  const anneesExports = new Set((parPoste.exports.get("UMOA") ?? []).map((p) => p.annee));
  const communes = (parPoste.imports.get("UMOA") ?? [])
    .map((p) => p.annee)
    .filter((a) => anneesExports.has(a))
    .sort();
  const derniereAnnee = communes.length > 0 ? communes[communes.length - 1] : "";

  const seuil =
    derniereAnnee !== "" ? String(Number(derniereAnnee) - annees + 1) : "0000";
  const umoa = umoaBrut.map((s) => ({
    ...s,
    points: s.points.filter((p) => p.annee >= seuil),
  }));

  const totalExports = valeurA(parPoste.exports.get("UMOA") ?? [], derniereAnnee);

  const brutPays = MACRO_COUNTRIES.filter((c) => c.code !== "UMOA").map((c) => {
    const ex = valeurA(parPoste.exports.get(c.code) ?? [], derniereAnnee);
    const im = valeurA(parPoste.imports.get(c.code) ?? [], derniereAnnee);
    return { code: c.code, nom: c.shortName, exports: ex, imports: im };
  });

  // La part d'un pays se calcule sur la SOMME DES HUIT, pas sur l'agregat UMOA.
  // Les deux different : l'agregat consolide, c'est-a-dire qu'il retranche le
  // commerce intra-union — ce qu'un pays vend a son voisin n'est pas une
  // exportation de l'Union. En 2025, 33 178 Mds pour l'Union contre 37 738 en
  // sommant les pays, soit 12 % d'echanges internes. Rapporter chaque pays a
  // l'agregat ferait des parts dont le total depasse 100 %.
  const sommePays = brutPays.reduce((t, p) => t + (p.exports ?? 0), 0);

  const pays: LigneCommercePays[] = brutPays
    .map((p) => ({
      ...p,
      balance: p.exports !== null && p.imports !== null ? p.exports - p.imports : null,
      couverture:
        p.exports !== null && p.imports !== null && p.imports > 0
          ? p.exports / p.imports
          : null,
      partExports: p.exports !== null && sommePays > 0 ? p.exports / sommePays : null,
    }))
    .sort((a, b) => (b.exports ?? -1) - (a.exports ?? -1));

  const totalImports = valeurA(parPoste.imports.get("UMOA") ?? [], derniereAnnee);
  return {
    umoa,
    derniereAnnee,
    pays,
    totalExports,
    totalImports,
    totalBalance:
      totalExports !== null && totalImports !== null ? totalExports - totalImports : null,
    sommePaysExports: sommePays > 0 ? sommePays : null,
  };
}
