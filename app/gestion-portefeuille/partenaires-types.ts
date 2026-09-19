// === Partenaires de marché : types ===
//
// Les SGI avec lesquelles la société de gestion traite. Leur taux de courtage
// standard est reporté à la saisie d'une opération : c'est ce qui évite de
// retaper 0,004 à chaque ligne d'un bordereau, et surtout d'en retaper un
// autre par inadvertance.
//
// Les BTCC ne sont PAS ici. Ce sont les banques du fonds, déjà décrites par
// ses comptes de trésorerie au référentiel ; les saisir une seconde fois les
// ferait diverger.

export type NaturePartenaire = "sgi" | "btcc" | "autre";

export const LIBELLES_NATURE: Record<NaturePartenaire, string> = {
  sgi: "SGI — société de gestion et d'intermédiation",
  btcc: "BTCC — banque teneur de compte conservateur",
  autre: "Autre partenaire",
};

/** Un interlocuteur chez le partenaire. Trois au plus. */
export type Referent = {
  nom: string;
  fonction: string;
  email: string;
  telephone: string;
};

export const REFERENTS_MAX = 3;

export const referentVide = (): Referent => ({
  nom: "",
  fonction: "",
  email: "",
  telephone: "",
});

/** Un référent ne compte que s'il porte au moins un nom. */
export const referentRenseigne = (r: Referent): boolean =>
  r.nom.trim().length > 0 ||
  r.fonction.trim().length > 0 ||
  r.email.trim().length > 0 ||
  r.telephone.trim().length > 0;

export type Partenaire = {
  id: string;
  kind: NaturePartenaire;
  nom: string;
  agrement: string;
  pays: string;
  email: string;
  telephone: string;
  adresse: string;
  /** Taux en DÉCIMAL (0,004 = 0,4 %), comme partout dans le module. */
  tauxCourtage: number;
  tauxTps: number;
  /** Commission BRVM / DC-BR. NE SE SAISIT PLUS sur une fiche partenaire :
   *  c'est un tarif de PLACE, identique quelle que soit la SGI, réglé par
   *  instrument à la saisie de l'opération. Le champ survit pour les fiches
   *  déjà enregistrées ; il n'est plus ni affiché ni appliqué. */
  tauxBrvm: number;
  referents: Referent[];
  actif: boolean;
  note: string;
};

export type SaisiePartenaire = Omit<Partenaire, "id">;

export function partenaireVide(): SaisiePartenaire {
  return {
    kind: "sgi",
    nom: "",
    agrement: "",
    pays: "",
    email: "",
    telephone: "",
    adresse: "",
    // Les taux usuels d'une négociation d'actions à la BRVM, qui sont le cas
    // courant. Ils restent modifiables : le courtage se négocie.
    tauxCourtage: 0.004,
    tauxTps: 0.1,
    // Zéro et non 0,003 : la commission de place ne se porte plus ici, et
    // l'enregistrer quand même en ferait une donnée morte que quelqu'un
    // finirait par lire de bonne foi.
    tauxBrvm: 0,
    referents: [referentVide()],
    actif: true,
    note: "",
  };
}

/** Ligne telle que Supabase la renvoie — `numeric` en chaîne. */
export type LignePartenaire = {
  id: string;
  kind: string;
  nom: string;
  agrement: string;
  pays: string;
  email: string;
  telephone: string;
  adresse: string;
  taux_courtage: number | string;
  taux_tps: number | string;
  taux_brvm: number | string;
  referents: unknown;
  actif: boolean;
  note: string;
};

const nb = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const txt = (v: unknown): string => (typeof v === "string" ? v : "");

export function versPartenaire(l: LignePartenaire): Partenaire {
  // `referents` vient d'une colonne jsonb : son contenu n'est garanti par
  // aucun schéma. On le reconstruit champ par champ plutôt que de le caster,
  // pour qu'une donnée abîmée dégrade l'affichage au lieu de le casser.
  const brut = Array.isArray(l.referents) ? l.referents : [];
  const referents = brut.slice(0, REFERENTS_MAX).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      nom: txt(o.nom),
      fonction: txt(o.fonction),
      email: txt(o.email),
      telephone: txt(o.telephone),
    };
  });

  return {
    id: l.id,
    kind: (["sgi", "btcc", "autre"].includes(l.kind) ? l.kind : "autre") as NaturePartenaire,
    nom: l.nom ?? "",
    agrement: l.agrement ?? "",
    pays: l.pays ?? "",
    email: l.email ?? "",
    telephone: l.telephone ?? "",
    adresse: l.adresse ?? "",
    tauxCourtage: nb(l.taux_courtage),
    tauxTps: nb(l.taux_tps),
    tauxBrvm: nb(l.taux_brvm),
    referents: referents.length ? referents : [referentVide()],
    actif: l.actif !== false,
    note: l.note ?? "",
  };
}
