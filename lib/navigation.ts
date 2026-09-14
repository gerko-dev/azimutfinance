// === Arborescence de navigation, partagee par l'en-tete et le pied de page ===
//
// SOURCE UNIQUE. Le pied de page reprenait autrefois les memes liens, ranges
// autrement et maintenus a la main : il avait fini par classer les matieres
// premieres dans « Macro », le magazine dans « Academie » et « Mon
// portefeuille » a cote du glossaire, alors que le menu disait tout autre
// chose. Deux listes qu'on met a jour separement divergent toujours ; il n'y en
// a donc plus qu'une.
//
// Le fichier ne contient que des donnees et des fonctions pures : il
// s'importe aussi bien d'un composant serveur que client.

export type MenuItem = {
  label: string;
  href: string;
  badge?: "Premium" | "Pro" | "Bientôt";
  children?: MenuItem[];
  /** Item masqué tant que l'utilisateur n'est pas connecté (membre+). */
  requiresAuth?: boolean;
};

export type MenuSection = {
  label: string;
  items: MenuItem[];
  /** Section encore en chantier : visible en `npm run dev`, jamais en ligne. */
  devOnly?: boolean;
};

// `process.env.NODE_ENV` est remplace a la compilation par Next : la section
// marquee devOnly n'est donc pas seulement masquee, elle est absente du bundle
// de production. Les previews Vercel comptent comme de la production — elles
// ne la montreront pas non plus.
export const IS_DEV = process.env.NODE_ENV !== "production";

export const menuSections: MenuSection[] = [
  {
    label: "Marchés",
    items: [
      { label: "Indices", href: "/marches/indices" },
      {
        label: "Actions",
        href: "/marches/actions",
        children: [
          { label: "Actions cotées", href: "/marches/actions" },
          { label: "Private equity", href: "/marches/private-equity", badge: "Premium" },
        ],
      },
      {
        label: "Obligations",
        href: "/marches/obligations",
        children: [
          { label: "Obligations cotées", href: "/marches/obligations" },
          { label: "OAT/BAT", href: "/marches/souverains-non-cotes" },
        ],
      },
      // Lien simple : la page OPC mene deja aux categories et aux societes de
      // gestion, un flyout n'aurait fait que dupliquer ses propres liens.
      { label: "OPC", href: "/marches/fcp" },
      { label: "Matières premières", href: "/marches/matieres-premieres" },
      { label: "FX", href: "/marches/devises" },
    ],
  },
  {
    label: "Macroéconomie",
    items: [
      { label: "Indicateurs", href: "/macro/pays" },
      // Le marche monetaire n'est plus une section de premier niveau : ses deux
      // pages sont de la macro, et la barre en comptait trop.
      { label: "Taux UEMOA", href: "/marche-monetaire" },
      { label: "Récapitulatif MTP", href: "/marche-monetaire/mtp" },
    ],
  },
  {
    // Porte d'entree unique vers les outils, Pro compris : un visiteur ne
    // devinait pas que le screener vivait derriere le bouton « Espace Pro ».
    // Le badge dit le niveau d'acces, il ne cache pas l'existence de l'outil —
    // un visiteur doit voir ce qu'il rate avant de pouvoir le vouloir.
    label: "Outils",
    items: [
      { label: "Comparateur de titres", href: "/outils/comparateur", badge: "Premium" },
      { label: "Mon portefeuille", href: "/outils/portefeuille", requiresAuth: true },
      { label: "Ma watchlist", href: "/outils/watchlist", requiresAuth: true },
      { label: "Mes alertes", href: "/outils/alertes", requiresAuth: true },
      {
        label: "Simulateur d'adjudication",
        href: "/outils/simulateur-adjudication",
        badge: "Premium",
      },
      { label: "Screener actions", href: "/outils/screener-actions", badge: "Premium" },
      { label: "Screener obligations", href: "/outils/screener-obligations", badge: "Premium" },
      { label: "Screener FCP", href: "/outils/screener-fcp", badge: "Premium" },
      { label: "Simulateur YTM", href: "/outils/simulateur-ytm", badge: "Premium" },
    ],
  },
  {
    label: "Académie",
    items: [
      { label: "Catalogue formations", href: "/academie/formations" },
      { label: "Glossaire financier", href: "/academie/glossaire" },
      { label: "Ligue Azimut", href: "/academie/simulateur" },
    ],
  },
  {
    label: "Communauté",
    items: [
      { label: "Forum investisseurs", href: "/communaute/forum" },
      { label: "Magazine digital", href: "/academie/magazine", requiresAuth: true },
      { label: "Newsletter", href: "/communaute/newsletter" },
    ],
  },
];

/**
 * Sections affichables : les chantiers tombent hors du mode dev, et les liens
 * reserves aux membres disparaissent pour un visiteur.
 *
 * Une section videe de tous ses items disparait avec eux : un titre de colonne
 * sans lien en dessous n'est pas une rubrique, c'est un trou.
 */
export function sectionsVisibles(estConnecte: boolean): MenuSection[] {
  const sections = menuSections.filter((s) => IS_DEV || !s.devOnly);
  if (estConnecte) return sections;
  return sections
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.requiresAuth) }))
    .filter((s) => s.items.length > 0);
}

/**
 * Aplatit une section pour une liste sans niveaux, comme une colonne de pied de
 * page.
 *
 * Un item a enfants est REMPLACE par ses enfants, jamais double : le premier
 * enfant reprend toujours l'adresse du parent (« Actions » -> « Actions
 * cotées » pointe sur /marches/actions), si bien que garder le parent
 * produirait deux liens vers la meme page dans la meme colonne.
 */
export function liensAplatis(section: MenuSection): MenuItem[] {
  return section.items.flatMap((item) =>
    item.children && item.children.length > 0 ? item.children : [item],
  );
}
