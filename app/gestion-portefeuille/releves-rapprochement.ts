// === Rattacher un relevé à une cellule de la grille des soldes ===
//
// Un relevé lu donne trois choses : le dossier où il était rangé, le titulaire
// du compte, et un solde. La grille attend une colonne — l'établissement — et
// une ligne — le fonds. Tout ce module sert à passer des unes aux autres.
//
// DEUX PROBLEMES, DEUX REGLES, et les confondre a fait passer le solde du
// Sécurité pour celui du Sécurité II :
//
//   L'ETABLISSEMENT est NOMME EN RACCOURCI. Le dossier dit « CORISBANK
//   SENEGAL », le référentiel « Coris Bank International - Sénégal
//   (CBI-Sénégal) ». On cherche donc une INCLUSION : tous les mots du dossier
//   doivent se retrouver dans la fiche, qui peut en porter d'autres.
//
//   LE FONDS est NOMME EN ENTIER. Le relevé dit « FCP AURORE SECURITE », et la
//   maison gère un « FCP AURORE SECURITE II ». Par inclusion, le premier
//   désignerait le second : il faut donc une EQUIVALENCE, mot pour mot. Un
//   « II » de trop n'est pas un détail, c'est un autre portefeuille.
//
// RIEN N'EST RATTACHE AU JUGE. Sans correspondance, ou avec deux candidats qui
// se valent, le relevé ressort NON RATTACHE avec la raison écrite. Un solde à
// huit chiffres posé dans la mauvaise colonne ne se voit pas : il se découvre
// au rapprochement du mois suivant, quand plus personne ne sait d'où il vient.
//
// MODULE NEUTRE : ni système de fichiers ni base. Il se vérifie sur des chaînes.

/** Normalisation commune : sans accents, sans ponctuation, en minuscules. */
export function normaliser(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const mots = (s: string): string[] => normaliser(s).split(" ").filter(Boolean);

/**
 * Mots qui ne distinguent rien et qui feraient coïncider n'importe quoi.
 *
 * « BANQUE », « BANK », « FCP », « SA » se retrouvent dans la moitié des noms :
 * les garder faisait correspondre « NSIA BANQUE TOGO » à « Coris Bank
 * International » par le seul mot « bank ».
 *
 * « II » N'EN FAIT PAS PARTIE, et c'est tout l'objet de cette liste : il ne
 * décore pas un nom, il désigne un fonds différent.
 */
const VIDES = new Set([
  "banque", "bank", "banco", "fcp", "sa", "sarl", "ste", "societe", "succ",
  "de", "du", "des", "la", "le", "les", "et", "international", "compte", "cpte",
]);

/** Les pays, tels qu'un dossier les abrège et tels que le référentiel les écrit. */
const PAYS: Record<string, string> = {
  ci: "cote ivoire",
  civ: "cote ivoire",
  rci: "cote ivoire",
  sn: "senegal",
  bj: "benin",
  bn: "benin",
  tg: "togo",
  ml: "mali",
  bf: "burkina faso",
  ne: "niger",
  gw: "guinee bissau",
};

/**
 * Noms de banque que l'usage écrit tantôt soudés, tantôt séparés.
 *
 * ILS DOIVENT L'ETRE DES DEUX COTES. « BANK » est un mot vide — il reviendrait
 * sinon dans la moitié des fiches — mais « ORA BANK » sans lui ne laisse que
 * « ORA », trois lettres qu'on retrouve dans « ORANGE MONEY » : le dossier
 * « ORA BANK CI » se rattachait au compte Orange Money de Côte d'Ivoire. On
 * soude donc avant de retirer les mots vides, et des deux côtés, pour que le
 * dossier et la fiche parlent de la même chose.
 */
const SOUDURES: [RegExp, string][] = [
  [/\bora ?bank\b/g, "orabank"],
  [/\bcoris ?ban(?:k|que)\b/g, "corisbank"],
  [/\bafg ?bank\b/g, "afgbank"],
  [/\beco ?bank\b/g, "ecobank"],
  [/\bbank of africa\b/g, "boa"],
];

/** Un libellé réduit à ses mots distinctifs, pays développés. */
function signature(s: string): string[] {
  const out: string[] = [];
  let brut = normaliser(s);
  for (const [motif, soude] of SOUDURES) brut = brut.replace(motif, soude);
  for (const m of brut.split(" ").filter(Boolean)) {
    const pays = PAYS[m];
    if (pays) {
      for (const p of pays.split(" ")) if (!out.includes(p)) out.push(p);
      continue;
    }
    if (VIDES.has(m) || m.length < 2) continue;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

/** Le pluriel ne distingue pas : « DIVERSIFIES » et « DIVERSIFIE » sont un seul mot. */
const singulier = (m: string) => (m.length > 4 && m.endsWith("s") ? m.slice(0, -1) : m);

/** Distance d'édition, bornée : au-delà de 1, on ne cherche pas plus loin. */
function proche(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let ecarts = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++ecarts > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return ecarts + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Deux mots désignent-ils la même chose ?
 *
 * TROIS TOLERANCES, ET PAS UNE DE PLUS : le pluriel (« DIVERSIFIES »), la
 * troncature de la banque (« SOUV » pour « SOUVERAINES »), et la faute de
 * frappe d'un caractère (« OPPORTUINITES »). Au-delà, deux mots différents
 * sont deux mots différents — c'est ce qui empêche « SECURITE » de passer pour
 * « SECURITE II ».
 */
function memeMot(a: string, b: string): boolean {
  const x = singulier(a);
  const y = singulier(b);
  if (x === y) return true;
  const court = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  if (court.length >= 4 && long.startsWith(court)) return true;
  return court.length >= 6 && proche(x, y);
}

export type Candidat = { cle: string; libelle: string };

export type Resultat =
  | { trouve: true; cle: string }
  | { trouve: false; raison: string };

function tranche(
  libelle: string,
  gagnants: Candidat[],
  aucun: string,
): Resultat {
  if (gagnants.length === 0) return { trouve: false, raison: aucun };
  if (gagnants.length > 1) {
    return {
      trouve: false,
      raison: `« ${libelle} » désigne aussi bien ${gagnants
        .slice(0, 3)
        .map((g) => `« ${g.libelle} »`)
        .join(" que ")}.`,
    };
  }
  return { trouve: true, cle: gagnants[0].cle };
}

/**
 * L'établissement que désigne un nom de dossier — par INCLUSION.
 *
 * Un mot du dossier est retrouvé s'il figure dans la fiche, mot pour mot ou
 * dans sa forme COLLEE : « CORISBANK » n'est pas un mot de « Coris Bank
 * International », mais il en est la concaténation, et c'est bien la même
 * banque. Sans cela, six dossiers sur douze restaient orphelins.
 */
export function rattacherEtablissement(
  dossier: string,
  candidats: Candidat[],
): Resultat {
  const signatures = candidats.map((c) => signature(c.libelle));
  // UN SIGLE DE DEUX LETTRES QUE PERSONNE NE PORTE NE DECIDE DE RIEN.
  //
  // Le gérant ajoute parfois au dossier une mention qui lui parle à lui :
  // « NSIA BANQUE CI OP », « UBA AO ». Exiger de retrouver « OP » dans la
  // fiche laissait le dossier orphelin pour deux lettres. Les codes pays, eux,
  // sont déjà développés par `signature` — « CI » y est devenu « cote ivoire »
  // et reste donc décisif.
  const cherche = signature(dossier).filter(
    (m) => m.length > 2 || signatures.some((s) => s.includes(m)),
  );
  if (cherche.length === 0) {
    return { trouve: false, raison: `« ${dossier} » ne porte aucun mot distinctif.` };
  }

  const gagnants = candidats.filter((c) => {
    const sienne = signature(c.libelle);
    const colle = sienne.join("");
    // TROIS FACONS DE RETROUVER UN MOT, et il a fallu les trois pour couvrir
    // les quinze orthographes de Coris Bank rencontrées en deux ans :
    //   — le mot lui-même, aux tolérances de `memeMot` ;
    //   — le mot COLLE dans la fiche : « CORISBANK » pour « Coris Bank » ;
    //   — deux mots consécutifs de la fiche recollés, ce qui rattrape la
    //     faute de frappe sur la soudure : « CORSBANK », « CORIBANK ».
    const recolle = sienne.map((s, i) => s + (sienne[i + 1] ?? ""));
    return cherche.every(
      (m) =>
        sienne.some((s) => memeMot(m, s)) ||
        // LA FORME COLLEE N'EST ADMISE QU'AU-DELA DE SIX LETTRES : « ORA »
        // se retrouve dans « ORANGE MONEY », et trois lettres ne nomment
        // pas une banque.
        (m.length >= 6 && colle.includes(m)) ||
        recolle.some((s) => memeMot(m, s)),
    );
  });

  return tranche(
    dossier,
    gagnants,
    `« ${dossier} » ne correspond à aucun compte du référentiel. Ajoute la fiche de cette banque, ou renomme le dossier comme elle.`,
  );
}

/**
 * Le fonds que désigne un titulaire de compte — par EQUIVALENCE.
 *
 * Les deux noms doivent porter les mêmes mots distinctifs, aux tolérances de
 * `memeMot` près. C'est strict, et c'est voulu : par inclusion, « FCP AURORE
 * SECURITE » aurait désigné « FCP AURORE SECURITE II », et le solde d'un
 * portefeuille serait entré dans la ligne d'un autre.
 */
export function rattacherFonds(titulaire: string, candidats: Candidat[]): Resultat {
  const cherche = signature(titulaire);
  if (cherche.length === 0) {
    return { trouve: false, raison: `« ${titulaire} » ne porte aucun mot distinctif.` };
  }

  const gagnants = candidats.filter((c) => {
    const sienne = signature(c.libelle);
    if (sienne.length !== cherche.length) return false;
    return cherche.every((m) => sienne.some((s) => memeMot(m, s)));
  });

  return tranche(
    titulaire,
    gagnants,
    `« ${titulaire} » ne correspond à aucun fonds géré.`,
  );
}

/**
 * Les abréviations que le gérant met dans les noms de fichier.
 *
 * ELLES SONT UN RECOURS, PAS UNE REGLE. Six banques nomment le compte par son
 * fonds ; les autres nomment la société de gestion — chez la BOA, les huit
 * relevés portent tous « NSIA ASSET MANAGEMENT SA », et seul le nom du fichier
 * distingue les portefeuilles. On ne s'en sert donc que lorsque le titulaire
 * n'a désigné aucun fonds.
 */
export const ABREVIATIONS: Record<string, string> = {
  am: "AURORE MONETARIS",
  ao: "AURORE OPPORTUNITES",
  aos: "AURORE OBLIGATIONS SOUVERAINES",
  aosii: "AURORE OBLIGATIONS SOUVERAINES II",
  as: "AURORE SECURITE",
  asii: "AURORE SECURITE II",
  nfd: "NSIA FONDS DIVERSIFIE",
  th: "TAWFIR HALAL",
};

/**
 * Mots du nom de la SOCIETE DE GESTION, et d'elle seule.
 *
 * Ils servent à reconnaître un titulaire GENERIQUE — celui qui ne nomme aucun
 * portefeuille parce que la banque a mis la maison à la place.
 */
const SOCIETE = new Set(["nsia", "asset", "management"]);

/**
 * Le titulaire ne nomme-t-il QUE la société de gestion ?
 *
 * C'EST LA CONDITION DU RECOURS AU NOM DE FICHIER, et elle a été ajoutée après
 * coup : « NSIA ASSET MANAGEMENT CASH », chez Ecobank, est un vrai compte de
 * la maison, pas un fonds. Le fichier s'appelant « ECO NSIA AM », le recours
 * y lisait « AM » et posait le solde du compte maison dans la ligne d'Aurore
 * Monétaris. Un mot de trop dans le titulaire — « CASH », « DEPENSES » — et le
 * compte désigne autre chose : on ne devine plus rien.
 */
export function titulaireGenerique(intitule: string): boolean {
  const s = signature(intitule);
  return s.length > 0 && s.every((m) => SOCIETE.has(m));
}

/**
 * Le fonds que suggère un nom de fichier, ou "" s'il n'en suggère aucun.
 *
 * « NSIA AM » N'EST PAS « AM », ET C'EST TOUT L'ENJEU. « AM » désigne Aurore
 * Monétaris ; « NSIA AM » désigne la société de gestion, NSIA Asset
 * Management, dont le compte n'appartient à aucun fonds. Les deux se croisent
 * dans la même banque, parfois dans le même dossier — « BOA AM » et
 * « BOA NSIA AM » —, et lire l'abréviation sans regarder ce qui la précède
 * versait la trésorerie de la maison dans la ligne d'un portefeuille.
 *
 * La règle est donc : une abréviation PRECEDEE du nom de la société ne
 * désigne plus un fonds. On ne rend rien, et le relevé ressort non rattaché —
 * ce qu'il est.
 */
export function fondsDuNomDeFichier(nom: string): string {
  const bouts = mots(nom.replace(/\.[a-z0-9]+$/i, ""));
  for (let i = 0; i < bouts.length; i++) {
    const f = ABREVIATIONS[bouts[i]];
    if (!f) continue;
    if (i > 0 && SOCIETE.has(bouts[i - 1])) return "";
    return f;
  }
  return "";
}
