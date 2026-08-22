// Types partagés entre la server action, la page serveur et le formulaire
// client du module Fund management. Fichier sans "use server" pour pouvoir
// exporter des types (un module "use server" ne peut exporter que des actions).

// Une composante de benchmark composite : un poids (%) + une référence.
export type BenchmarkComponent = { weight: string; ref: string };

// Un ratio (réglementaire ou contractuel) rattaché à un fonds. Les seuils sont
// des chaînes côté formulaire (champs de saisie) ; ils sont convertis en nombre
// lors de la persistance. Reprend le modèle Aurore (Instruction 66).
export type RatioCategorie = "REGLEMENTAIRE" | "CONTRACTUEL";

export type RatioLimite = {
  categorie: RatioCategorie;
  groupe: string;
  libelle: string;
  metrique: string;
  base: string;
  seuilMin: string; // "" si non renseigné
  seuilMax: string;
  unite: string; // "%" ou "ans"
  article: string;
};

// Données saisies dans le formulaire de création (avant persistance).
export type FundInput = {
  nom: string;
  abreviation: string;
  categorie: string;
  type: string;
  vlInitiale: string;
  devise: string;
  objectifPerf: string;
  benchmark: BenchmarkComponent[];
  ratios: RatioLimite[];
};

// Fonds persisté (ligne managed_funds renvoyée par la base).
export type FundRecord = FundInput & { id: string };

// Ratio tel que stocké en base (JSONB, seuils numériques).
export type RatioRow = {
  categorie: RatioCategorie;
  groupe?: string | null;
  libelle: string;
  metrique?: string | null;
  base?: string | null;
  seuil_min?: number | string | null;
  seuil_max?: number | string | null;
  unite?: string | null;
  article?: string | null;
};

// Ligne brute telle que renvoyée par Supabase (snake_case).
export type ManagedFundRow = {
  id: string;
  nom: string;
  abreviation: string;
  categorie: string;
  type: string;
  vl_initiale: number | null;
  devise: string;
  objectif_perf: string;
  benchmark: Array<{ weight: number | string; ref: string }> | null;
  ratios: RatioRow[] | null;
};

// "35% BRVMC · 65% Rendement souverain UMOA-Titres" — partagé entre les vues.
export function formatBenchmark(components: BenchmarkComponent[]): string {
  const filled = (components ?? []).filter((c) => (c.ref ?? "").trim() !== "");
  if (filled.length === 0) return "—";
  return filled
    .map((c) => {
      const w = (c.weight ?? "").toString().trim();
      return w ? `${w}% ${c.ref.trim()}` : c.ref.trim();
    })
    .join(" · ");
}

// Identité de la société de gestion (1 profil par utilisateur).
export type SgoProfile = {
  name: string;
  agrement: string;
  contactEmail: string;
  baseCurrency: string;
};

export type SgoProfileRow = {
  name: string;
  agrement: string;
  contact_email: string;
  base_currency: string;
};

export function rowToSgoProfile(row: SgoProfileRow): SgoProfile {
  return {
    name: row.name ?? "",
    agrement: row.agrement ?? "",
    contactEmail: row.contact_email ?? "",
    baseCurrency: row.base_currency ?? "XOF",
  };
}

// Convertit un ratio DB (seuils numériques) en RatioLimite (seuils texte).
export function rowToRatio(r: RatioRow): RatioLimite {
  return {
    categorie: r.categorie,
    groupe: r.groupe ?? "",
    libelle: r.libelle,
    metrique: r.metrique ?? "",
    base: r.base ?? "",
    seuilMin: r.seuil_min != null ? String(r.seuil_min) : "",
    seuilMax: r.seuil_max != null ? String(r.seuil_max) : "",
    unite: r.unite ?? "%",
    article: r.article ?? "",
  };
}

// Convertit une ligne DB en FundRecord exploitable côté UI.
export function rowToFundRecord(row: ManagedFundRow): FundRecord {
  return {
    id: row.id,
    nom: row.nom,
    abreviation: row.abreviation ?? "",
    categorie: row.categorie,
    type: row.type,
    vlInitiale: row.vl_initiale != null ? String(row.vl_initiale) : "",
    devise: row.devise,
    objectifPerf: row.objectif_perf ?? "",
    benchmark: (row.benchmark ?? []).map((c) => ({
      weight: c.weight != null ? String(c.weight) : "",
      ref: c.ref,
    })),
    ratios: (row.ratios ?? []).map(rowToRatio),
  };
}
