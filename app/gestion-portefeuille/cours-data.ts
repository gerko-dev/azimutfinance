import "server-only";

// === Dernier cours d'un titre, lu au site ===
//
// UN COURS NE SE STOCKE PAS AU RÉFÉRENTIEL. La synchronisation y recopie ce
// qui ne bouge pas — ISIN, taux facial, échéance, émetteur — et c'est bien :
// ce sont des caractéristiques. Un cours change à chaque séance ; l'écrire
// dans `custom_securities.attributes` aurait figé la valeur du jour de
// l'import, et le module aurait affiché avec assurance un prix vieux de six
// mois.
//
// On le lit donc AU RENDU, depuis les fichiers du site, et on dit sa DATE.
// Un cours sans date ne se distingue pas d'un cours périmé.
//
// Trois gisements, selon la nature du titre :
//
//   actions           historique Sika, dernière clôture
//   obligations cotées cote BRVM, dernier prix connu
//   titres publics    aucune cotation : ils ne s'échangent pas au fixing
//
// Le prix de l'INVENTAIRE n'est pas remplacé pour autant : il vaut à la date
// d'arrêté et sert à recouper avec le dépositaire. Les deux se lisent côte à
// côte — c'est leur écart qui renseigne.

import { getBrvmSnapshot } from "@/lib/brvm/liveQuotes";
import {
  getLatestSikaQuote,
  loadAllActionsEnriched,
  loadListedBondPrices,
  loadListedBonds,
} from "@/lib/dataLoader";
// Le TYPE et la clef vivent dans `cours-types.ts` : ce fichier-ci ouvre des
// fichiers avec le `fs` de Node, et un composant client qui affiche un cours
// ne doit pas l'embarquer — sans quoi `dataLoader` entre dans le bundle
// navigateur et la construction echoue sur « module not found: fs ».
import { cleCours as cle, type CoursSite } from "./cours-types";

export type { CoursSite };

/**
 * Index des derniers cours, bâti UNE FOIS par rendu.
 *
 * Construire la table complète coûte une lecture des fichiers de cotation ;
 * la refaire par position coûtait autant de lectures qu'il y a de lignes à
 * l'inventaire. On l'indexe sous toutes les désignations connues — mnémonique
 * et ISIN — parce qu'une ligne d'inventaire porte tantôt l'un, tantôt l'autre.
 */
export async function indexerCoursSite(): Promise<Map<string, CoursSite>> {
  const index = new Map<string, CoursSite>();

  const poser = (designations: (string | null | undefined)[], c: CoursSite) => {
    for (const d of designations) {
      const k = cle(d);
      if (k && !index.has(k)) index.set(k, c);
    }
  };

  // ── Actions : LA MÊME SOURCE QUE LE SITE ────────────────────────────────
  //
  // `loadAllActionsEnriched` est la fonction qu'emploient /marches/actions et
  // la fiche de chaque titre : cours live BRVM quand la séance en donne un,
  // dernière clôture Sika sinon. Le module affiche donc exactement ce que le
  // site affiche — c'était tout l'objet de la demande.
  //
  // La tentation était de lire `titres.csv` directement, puisqu'il porte une
  // colonne `price`. Elle est périmée : ce fichier date du 26 août quand la
  // cote court au 18 septembre, et SONATEL y vaut 28 500 contre 42 190
  // réellement — trente-trois pour cent plus bas. Le site ne la lit jamais
  // seule, et nous non plus.
  const actions = await loadAllActionsEnriched();
  const snapshot = await getBrvmSnapshot();
  const liveDate = snapshot.fetchedAt ? snapshot.fetchedAt.slice(0, 10) : "";

  for (const a of actions) {
    if (!(a.price > 0)) continue;
    // La DATE du cours : celle de la séance live quand elle existe, celle de
    // la dernière clôture Sika sinon. Un cours sans date se croit du jour.
    const enLive = snapshot.quotes.some((q) => q.code === a.code);
    const date = enLive ? liveDate : (getLatestSikaQuote(a.code)?.date ?? "");
    poser([a.code, a.isin], {
      prix: a.price,
      date,
      source: "BRVM — actions",
    });
  }
  // ── Obligations cotées ──────────────────────────────────────────────────
  //
  // Une obligation se cote irrégulièrement : le dernier prix connu peut dater
  // de plusieurs semaines. On retient le plus récent, et sa date dit le reste.
  const dernier = new Map<string, { prix: number; date: string }>();
  for (const p of loadListedBondPrices()) {
    const k = cle(p.isin);
    // LE PRIX PIED DE COUPON, comme le classeur et comme la cote : le prix
    // plein inclut le couru, que l'inventaire porte déjà dans sa propre
    // colonne. Les additionner reviendrait à compter le couru deux fois.
    const prix = Number(p.cleanPrice);
    if (!k || !Number.isFinite(prix) || prix <= 0) continue;
    const deja = dernier.get(k);
    if (!deja || p.date > deja.date) dernier.set(k, { prix, date: p.date });
  }
  const parIsin = new Map(loadListedBonds().map((b) => [cle(b.isin), b]));
  for (const [k, v] of dernier) {
    const b = parIsin.get(k);
    poser([k, b?.code], { ...v, source: "BRVM — obligations" });
  }

  return index;
}
