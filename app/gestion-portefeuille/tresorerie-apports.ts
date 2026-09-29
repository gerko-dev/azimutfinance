// === Ce qui compose un montant du point de trésorerie ===
//
// Le tableau du point est un tableau de SOMMES : deux milliards en « achats
// MTP valides » ne disent ni quel titre, ni quand, ni combien de fois. Le
// gérant devait ouvrir l'écran des opérations et refaire l'addition à la main
// pour savoir de quoi son chiffre était fait.
//
// Chaque apport porte donc, à côté de son montant, la LISTE DE CE QUI L'A
// PRODUIT. Elle est construite là où le montant l'est — dans le même `if`, au
// même endroit de la même boucle — et jamais reconstituée après coup : une
// seconde lecture des mêmes données aurait eu ses propres règles de date et de
// lettrage, et aurait fini par expliquer un montant par des opérations qui
// n'en font pas partie.
//
// CE MODULE NE DÉPEND DE RIEN. Il est importé par les cinq agrégateurs
// (opérations de marché, parts, flux saisis, nivellements, ESV) et par le
// point lui-même ; toute dépendance y créerait un cycle.

// Les nombres des lignes de détail sont formatés À LA SOURCE.
//
// Ils partent en texte, pas en nombre : une quantité, un prix et un taux ne se
// présentent pas de la même façon, et le composant qui les affiche n'a aucun
// moyen de savoir lequel il tient. Le formatage vit donc là où le sens est
// connu.
const FMT_ENTIER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const FMT_PRIX = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** Une quantité de titres. */
export const fmtQte = (n: number): string => FMT_ENTIER.format(n);

/** Un prix unitaire, en francs. */
export const fmtPrix = (n: number): string => `${FMT_PRIX.format(n)} F`;

/** Une pièce du montant d'une cellule : une opération, un flux, une tombée. */
export type DetailMontant = {
  /** Date qui fait entrer le montant dans le point : dénouement, ordre,
   *  échéance selon le cas. C'est celle que le poste retient, pas celle de la
   *  saisie — sinon la liste n'expliquerait pas pourquoi la cellule bouge. */
  date: string;
  /** Ce qui est en cause : le titre, le porteur, la contrepartie. */
  libelle: string;
  montant: number;
  /** Précision courte : quantité × prix, part non servie, nature du flux.
   *  Vide quand il n'y a rien à préciser. */
  info: string;
};

/** Ce qu'un poste doit à un compte : le montant, et ce qui le compose. */
export type ApportCompte = { montant: number; details: DetailMontant[] };

/** Poste → compte de règlement → apport. La forme que tous les agrégateurs
 *  rendent, et que le point verse dans son tableau sans distinguer d'où elle
 *  vient. */
export type ApportsParPoste = Map<string, Map<string, ApportCompte>>;

/**
 * Ajoute un montant et la ligne de détail qui l'explique.
 *
 * UN COMPTE VIDE N'EST PAS ÉCARTÉ ICI. Une opération dont le compte de
 * règlement ne figure pas dans l'inventaire doit ressortir dans le bandeau
 * « montants sans colonne » du point ; la filtrer à la source la ferait
 * disparaître en silence, ce qui est exactement ce que ce bandeau existe pour
 * empêcher. Les agrégateurs qui veulent l'écarter le font chez eux.
 */
export function ajouterApport(
  cible: ApportsParPoste,
  poste: string | null,
  compte: string,
  montant: number,
  detail: Omit<DetailMontant, "montant">,
): void {
  if (!poste || montant === 0) return;
  let parCompte = cible.get(poste);
  if (!parCompte) {
    parCompte = new Map<string, ApportCompte>();
    cible.set(poste, parCompte);
  }
  const apport = parCompte.get(compte) ?? { montant: 0, details: [] };
  apport.montant += montant;
  apport.details.push({ ...detail, montant });
  parCompte.set(compte, apport);
}

/**
 * Combien de lignes de détail voyagent jusqu'au navigateur, par cellule.
 *
 * Une infobulle de quatre-vingts lignes ne se lit pas, et un fonds qui porte
 * six cents tombées de coupons alourdirait la page de tout ce qu'elle ne
 * montrera jamais. Au-delà, le reste est REGROUPÉ, pas jeté : la somme des
 * lignes affichées reste égale au montant de la cellule.
 */
export const MAX_DETAILS = 25;

/** Les plus gros d'abord, le menu fretin regroupé en une ligne. */
export function resumerDetails(details: DetailMontant[]): DetailMontant[] {
  const tries = [...details].sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant));
  if (tries.length <= MAX_DETAILS) return tries;
  const gardes = tries.slice(0, MAX_DETAILS - 1);
  const reste = tries.slice(MAX_DETAILS - 1);
  return [
    ...gardes,
    {
      date: "",
      libelle: `et ${reste.length} autre(s)`,
      montant: reste.reduce((s, d) => s + d.montant, 0),
      info: "",
    },
  ];
}
