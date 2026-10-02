// === Lecture des relevés bancaires : sept formats, une seule sortie ===
//
// Treize banques, huit mises en page. Aucune norme ne les régit : chacune pose
// le numéro de compte, le titulaire et le solde où son logiciel l'a décidé, et
// trois d'entre elles ne donnent même pas de solde de clôture — il faut le
// prendre sur la dernière ligne de mouvement.
//
// CE MODULE NE LIT PAS DE PDF, il lit des LIGNES. L'extraction du texte vit
// ailleurs (`lib/releves/pdfLignes.ts`) ; ici, tout est pur, et donc vérifiable
// sur un jeu de relevés sans ouvrir un seul fichier.
//
// RIEN N'EST DEVINE. Un relevé dont le format n'est pas reconnu, dont le solde
// est introuvable ou dont le titulaire ne se rattache à aucun fonds ressort
// avec son problème écrit en clair. Le gérant le voit et tranche : un solde
// faux posé en silence dans une colonne de trésorerie vaut bien pire qu'un
// relevé signalé illisible.

/** Ce qu'on tire d'un relevé, quelle que soit la banque. */
export type ReleveLu = {
  /** Famille de mise en page reconnue, ou "" si aucune. */
  format: string;
  /** Numéro de compte tel que la banque l'écrit. */
  numeroCompte: string;
  /** Titulaire ou libellé du compte : c'est lui qui nomme le fonds. */
  intitule: string;
  /** Solde de clôture, en francs. Null si introuvable. */
  solde: number | null;
  /**
   * Solde DISPONIBLE, quand la banque le distingue du solde comptable.
   *
   * Les deux diffèrent d'un chèque en cours d'encaissement ou d'une opération
   * du jour non comptabilisée. Le point de trésorerie retient le COMPTABLE —
   * c'est lui que l'inventaire du dépositaire porte — mais l'écart se montre :
   * il explique à lui seul la moitié des rapprochements qui coincent.
   */
  soldeDisponible: number | null;
  /** Date de la situation, en ISO, quand le relevé la donne. */
  dateSolde: string | null;
  /** Ce qui empêche de retenir ce relevé, ou null. */
  probleme: string | null;
};

const VIDE: ReleveLu = {
  format: "",
  numeroCompte: "",
  intitule: "",
  solde: null,
  soldeDisponible: null,
  dateSolde: null,
  probleme: null,
};

// ── Nombres ─────────────────────────────────────────────────────────────────

/**
 * Un montant, quelle que soit la convention de la banque.
 *
 * QUATRE CONVENTIONS COEXISTENT dans le même dossier : « 4 912 118 » (espaces),
 * « 46,216,550.00 » (anglo-saxonne), « 10 857 802,00 » (française) et
 * « 6.656.153 » (points en séparateur de milliers, chez NSIA). Les traiter à
 * l'aveugle transformait six millions six cent mille francs en six francs.
 *
 * LA REGLE : le dernier séparateur suivi d'exactement deux chiffres en fin de
 * chaîne est un séparateur DECIMAL ; tous les autres marquent les milliers. Un
 * groupe de trois chiffres ne peut pas être une décimale — aucune banque de la
 * zone ne tient de millièmes de franc.
 */
export function montantDuReleve(brut: string): number | null {
  const t = brut.replace(/ /g, " ").trim();
  if (!t) return null;
  const negatif = /^-/.test(t) || /\)$/.test(t);
  const chiffres = t.replace(/[^\d.,]/g, "");
  if (!/\d/.test(chiffres)) return null;

  let entier = chiffres;
  let decimales = "";
  const m = chiffres.match(/[.,](\d{1,2})$/);
  if (m) {
    entier = chiffres.slice(0, chiffres.length - m[0].length);
    decimales = m[1];
  }
  entier = entier.replace(/[.,]/g, "");
  if (!entier) return null;
  const n = Number(`${entier}.${decimales || "0"}`);
  if (!Number.isFinite(n)) return null;
  return negatif ? -n : n;
}

/**
 * Tous les montants d'une ligne, dans l'ordre, UNE COLONNE A LA FOIS.
 *
 * LA LIGNE SE DECOUPE D'ABORD SUR LES BLANCS LARGES. Les colonnes d'un relevé
 * sont séparées par plusieurs espaces, les milliers d'un montant français par
 * un seul : lire la ligne d'un trait collait « 261 700 » et « 216 845 » en un
 * « 261 700 216 845 » de deux cent soixante et un milliards. Le débit du jour
 * devenait le solde du compte.
 */
function montantsDe(ligne: string): number[] {
  const out: number[] = [];
  for (const brut of ligne.split(/\s{2,}|	/)) {
    // LA DEVISE ET LES DATES SORTENT D'ABORD. « 39 140 411,00 XOF » se lisait
    // comme un texte faute de finir par un chiffre, et « AU 30/09/26 1 700 »
    // rendait 2 617 000 : la fin de la date se collait au montant.
    const bout = brut
      .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
      .replace(/\b(XOF|FCFA|F\s?CFA|EUR|USD)\b/gi, " ")
      // NSIA encadre chaque case de « ! » : « 5.912.499! » ne finissait pas
      // par un chiffre, et le solde du compte passait pour du texte.
      .replace(/[!|]/g, " ")
      .trim();
    if (!bout || !/\d/.test(bout)) continue;
    // Une colonne peut encore porter un libellé suivi de son montant :
    // « TAXE FRAIS FIXE AU 30/09/26 1 700 ». On ne retient que ce qui est
    // fait de chiffres et de séparateurs, en fin de bout.
    const m = bout.match(/-?\(?\d[\d ., ]*\d\)?$|^-?\d+$/);
    if (!m) continue;
    const v = montantDuReleve(m[0]);
    if (v !== null) out.push(v);
  }
  return out;
}

// ── Dates ───────────────────────────────────────────────────────────────────

const MOIS: Record<string, string> = {
  jan: "01", feb: "02", fev: "02", mar: "03", apr: "04", avr: "04",
  may: "05", mai: "05", jun: "06", juin: "06", jul: "07", juil: "07",
  aug: "08", aou: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Une date de relevé, en ISO. Reconnaît 30/09/2026, 30-09-26 et 30-SEP-2026. */
export function dateDuReleve(
  brut: string,
  ordre: "jma" | "mja" = "jma",
): string | null {
  const t = brut.trim();

  const slash = t.match(/\b(\d{2})[/-](\d{2})[/-](\d{2,4})\b/);
  if (slash) {
    // ECOBANK ECRIT A L'AMERICAINE : « BETWEEN 08/01/2026 to 10/01/2026 » va du
    // 1er août au 1er octobre, pas du 8 janvier au 10 janvier. Lue à la
    // française, la date d'arrêté reculait de huit mois.
    const [, a1, a2, a] = slash;
    const j = ordre === "mja" ? a2 : a1;
    const m = ordre === "mja" ? a1 : a2;
    const annee = a.length === 2 ? `20${a}` : a;
    if (+m >= 1 && +m <= 12 && +j >= 1 && +j <= 31) return `${annee}-${m}-${j}`;
  }

  const texte = t.match(/\b(\d{1,2})[-\s]([A-Za-zéû]{3,4})[-\s](\d{2,4})\b/);
  if (texte) {
    const [, j, mois, a] = texte;
    const cle = mois
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .slice(0, 3);
    const m = MOIS[cle];
    if (m) {
      const annee = a.length === 2 ? `20${a}` : a;
      return `${annee}-${m}-${j.padStart(2, "0")}`;
    }
  }
  return null;
}

// ── Outils communs ──────────────────────────────────────────────────────────

const sansAccent = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La valeur qui suit une étiquette, sur la ligne qui la porte. */
function apresEtiquette(lignes: string[], etiquette: RegExp): string {
  for (const l of lignes) {
    const m = l.match(etiquette);
    if (m) {
      const reste = l.slice(m.index! + m[0].length);
      return reste.replace(/^[\s:.·]+/, "").trim();
    }
  }
  return "";
}

/** Le premier montant qui suit une étiquette. */
function montantApres(lignes: string[], etiquette: RegExp): number | null {
  for (const l of lignes) {
    const m = l.match(etiquette);
    if (!m) continue;
    const v = montantsDe(l.slice(m.index! + m[0].length));
    if (v.length > 0) return v[0];
  }
  return null;
}

/**
 * La valeur qui PRECEDE une étiquette — sur sa ligne, ou sur celle d'avant.
 *
 * LE LOGICIEL D'AFG POSE LA VALEUR AVANT SON LIBELLE. Le flux de texte du PDF
 * donne « : 4 912 118 XOF » puis, à la ligne, « Solde de Clôture » ; et sur une
 * même ligne, « : 003801265021002XOF » puis « Numéro de Compte », sans le
 * moindre séparateur. Lu dans l'autre sens, ce relevé ne rendait rien du tout.
 */
function avantEtiquette(lignes: string[], etiquette: RegExp): string {
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(etiquette);
    if (!m) continue;
    const surLaLigne = lignes[i].slice(0, m.index!).replace(/^[\s:.·]+/, "").trim();
    if (surLaLigne) return surLaLigne;
    if (i > 0) return lignes[i - 1].replace(/^[\s:.·]+/, "").trim();
  }
  return "";
}

/** Le premier mot qui ressemble à un numéro de compte dans un texte. */
function numeroDe(brut: string): string {
  const m = brut.match(/[\dA-Z][\dA-Z-]{5,}/i);
  return m ? m[0].trim() : brut.split(/\s{2,}/)[0].trim();
}

// ── Les sept lecteurs ───────────────────────────────────────────────────────

/**
 * « EXTRAIT DE COMPTE » — BNDE, Coris Bank (Bénin et Sénégal), MAC African,
 * Orabank (Côte d'Ivoire et Sénégal). Six banques, un même logiciel.
 *
 * AUCUN SOLDE DE CLOTURE N'Y FIGURE. Le solde se prend sur la PREMIERE ligne
 * de mouvement, parce que le tableau est trié du plus récent au plus ancien :
 * c'est le solde APRES la dernière opération, donc le solde du jour. Prendre
 * la dernière ligne aurait rendu le solde du début de période.
 */
function lireExtrait(lignes: string[]): ReleveLu {
  const numero = numeroDe(apresEtiquette(lignes, /Num[ée]ro de compte\s*:/i));
  const intitule = apresEtiquette(lignes, /Libell[ée] du compte\s*:/i);
  const client = apresEtiquette(lignes, /Nom du client\s*:/i);

  // La colonne « Solde » est la dernière du tableau. On cherche la première
  // ligne qui commence par une date et qui porte au moins deux montants :
  // le mouvement et le solde qui en résulte.
  let solde: number | null = null;
  let date: string | null = null;
  let dansTableau = false;
  for (const l of lignes) {
    if (/Solde\s*\(XOF\)/i.test(l)) {
      dansTableau = true;
      continue;
    }
    if (!dansTableau) continue;
    if (/^\s*Total\b/i.test(l)) break;
    const d = l.match(/^\s*(\d{2}\/\d{2}\/\d{4})/);
    if (!d) continue;
    const m = montantsDe(l.replace(/^\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}/, ""));
    if (m.length === 0) continue;
    solde = m[m.length - 1];
    date = dateDuReleve(d[1]);
    break;
  }

  return {
    ...VIDE,
    format: "extrait",
    numeroCompte: numero,
    intitule: intitule || client,
    solde,
    dateSolde: date ?? dateDuReleve(apresEtiquette(lignes, /^\s*Date\s*:/im)),
    probleme:
      solde === null
        ? "Aucune ligne de mouvement : le solde ne peut pas être déduit."
        : null,
  };
}

/** AFG Bank Mali — solde de clôture explicite. */
function lireAfg(lignes: string[]): ReleveLu {
  const solde = montantDuReleve(avantEtiquette(lignes, /Solde de Cl[oô]ture/i));
  return {
    ...VIDE,
    format: "afg",
    numeroCompte: numeroDe(avantEtiquette(lignes, /Num[ée]ro de Compte/i)),
    intitule: avantEtiquette(lignes, /Titulaire du Compte/i),
    solde,
    // « Total Crédits ... 30-SEP-2026 » puis « Au » : la date d'arrêté suit la
    // même règle que les montants, elle précède son étiquette.
    dateSolde: dateDuReleve(avantEtiquette(lignes, /^\s*Total Cr[ée]dits\s+Au\s*$/im)),
    probleme: solde === null ? "Solde de clôture introuvable." : null,
  };
}

/** Banque Islamique du Sénégal — « Solde Disponible » en bas de tableau. */
function lireBis(lignes: string[]): ReleveLu {
  const solde = montantApres(lignes, /Solde Disponible/i);
  return {
    ...VIDE,
    format: "bis",
    numeroCompte: numeroDe(apresEtiquette(lignes, /N°\s*Compte\s*:/i)),
    intitule: apresEtiquette(lignes, /Intitul[ée] du Compte\s*:/i),
    solde,
    soldeDisponible: solde,
    dateSolde: dateDuReleve(apresEtiquette(lignes, /P[ée]riode du\s*:/i).split(/\s{2,}/)[1] ?? ""),
  };
}

/** Bank of Africa — solde comptable et solde disponible côte à côte. */
function lireBoa(lignes: string[]): ReleveLu {
  return {
    ...VIDE,
    format: "boa",
    numeroCompte: numeroDe(apresEtiquette(lignes, /^\s*Compte\s{2,}/im)),
    // LE TITULAIRE EST LA SOCIETE DE GESTION, jamais le fonds : les huit
    // relevés de la BOA portent tous « NSIA ASSET MANAGEMENT SA ». C'est le
    // NUMERO de compte, et lui seul, qui distingue les portefeuilles.
    intitule: apresEtiquette(lignes, /Nom du titulaire/i).split(/\s{2,}/)[0].trim(),
    solde: montantApres(lignes, /Solde de cl[oô]ture/i),
    soldeDisponible: montantApres(lignes, /Solde disponible/i),
    dateSolde: dateDuReleve(apresEtiquette(lignes, /Date du solde/i)),
  };
}

/** Ecobank — deux colonnes d'étiquettes, solde comptable de clôture. */
function lireEcobank(lignes: string[]): ReleveLu {
  // Le relevé d'Ecobank entrelace deux colonnes d'étiquettes : le nom du
  // compte précède son libellé, le numéro le suit, et la ligne suivante
  // commence par la valeur de la colonne de droite. On vise donc chaque
  // champ par son motif propre plutôt que par sa position.
  const texte = lignes.join("\n");
  const num = texte.match(/Compte\s*:\s*(\d{6,})/i);
  const periode = texte.match(/to\s+(\d{2}\/\d{2}\/\d{4})/i);
  // LE MONTANT SE COLLE A L'ETIQUETTE SUIVANTE : « ...de clôture :XOF
  // 950,877.00Total des retraits : ». Découpée en colonnes, la case ne finit
  // pas par un chiffre et le solde tombait à zéro — un compte plein passait
  // pour un compte vide. On vise donc le montant par son motif.
  const apresLabel = (source: string): number | null => {
    const m = texte.match(new RegExp(`${source}\\s*:?\\s*(?:XOF)?\\s*([\\d.,]+)`, "i"));
    return m ? montantDuReleve(m[1]) : null;
  };
  const solde = apresLabel("Solde comptable de cl[oô]ture");
  return {
    ...VIDE,
    format: "ecobank",
    numeroCompte: num ? num[1] : "",
    intitule: avantEtiquette(lignes, /Nom du Compte/i),
    solde,
    soldeDisponible: apresLabel("Solde disponible de cl[oô]ture"),
    // Dates à l'américaine — cf. `dateDuReleve`.
    dateSolde: periode
      ? dateDuReleve(periode[1], "mja")
      : dateDuReleve(apresEtiquette(lignes, /Date \/ heure du rapport\s*:/i), "mja"),
    probleme: solde === null ? "Solde comptable de clôture introuvable." : null,
  };
}

/**
 * NSIA Banque Côte d'Ivoire — historique encadré de « ! ».
 *
 * LE DERNIER « Solde au » FAIT FOI : le relevé en porte un par arrêté
 * intermédiaire, du plus ancien au plus récent.
 */
function lireNsia(lignes: string[]): ReleveLu {
  let solde: number | null = null;
  let date: string | null = null;
  for (const l of lignes) {
    const m = l.match(/Solde au\s*!?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!m) continue;
    const v = montantsDe(l.slice(m.index! + m[0].length));
    if (v.length === 0) continue;
    solde = v[v.length - 1];
    date = dateDuReleve(m[1]);
  }
  // « Compte No ..: 01216 XOF 25113000 ! 21184302022-54 ! NSIA ASSET
  //   MANAGEMENT ! NSIA AM / DEPENSES CI »
  // Les cases se séparent aux BLANCS LARGES ; les « ! » ne bornent que la
  // ligne entière, si bien qu'un découpage sur eux rendait la ligne entière.
  const ligneCompte = lignes.find((l) => /Compte No/i.test(l)) ?? "";
  const cases = ligneCompte
    .replace(/!/g, " ")
    .split(/\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  const numero = ligneCompte.match(/\b\d{6,}-\d+\b/);
  return {
    ...VIDE,
    format: "nsia",
    numeroCompte: numero ? numero[0] : "",
    // L'INTITULE EST LA DERNIERE CASE : « NSIA AM / DEPENSES CI » nomme le
    // compte, quand celle d'avant ne nomme que la société.
    intitule: cases[cases.length - 1] ?? "",
    solde,
    dateSolde: date,
    probleme: solde === null ? "Aucun « Solde au » dans le relevé." : null,
  };
}

/**
 * UBA — « Account Statement », deux colonnes d'étiquettes fondues en une.
 *
 * Le relevé mélange les libellés de gauche et les valeurs de droite sur la
 * même ligne, sans séparateur : « Numéro de compte   Solde d'ouverture
 * (01/01/2026):101170000491   7,150,155 » porte le numéro de compte collé au
 * deux-points, et le solde d'ouverture tout à droite. On vise donc chaque
 * champ par son motif propre.
 *
 * LE RELEVE EXISTE EN DEUX LANGUES. Jusqu'en 2025 UBA l'editait en anglais
 * — « Account Summary », « Closing Balance » —, depuis en francais. Meme mise
 * en page, memes colonnes : seules les etiquettes changent, et les deux jeux
 * sont donc acceptes partout.
 *
 * LE TITULAIRE EST LA LIGNE QUI SUIT LA PAGINATION. Les quatre premières
 * lignes sont toujours « Account Statement », l'horodatage, « Page 1 of N »
 * puis le nom du compte — et c'est le seul endroit où il figure en entier :
 * le « Surnom du compte » est tronqué à vingt caractères, « FCP AURORE » pour
 * trois fonds différents.
 */
function lireUba(lignes: string[]): ReleveLu {
  const iPage = lignes.findIndex((l) => /^\s*Page\s+\d+\s+(of|sur|de)\s+\d+/i.test(l));
  const intitule = iPage >= 0 && iPage + 1 < lignes.length ? lignes[iPage + 1].trim() : "";

  const ligneCompte =
    lignes.find((l) => /Num[ée]ro de compte|Account Number/i.test(l)) ?? "";
  const num = ligneCompte.match(/:\s*(\d{6,})/);

  const ligneDispo =
    lignes.find((l) => /Solde disponible|Available Balance/i.test(l)) ?? "";
  const solde = montantApres(lignes, /Solde de cl[oô]ture|Closing Balance/i);

  return {
    ...VIDE,
    format: "uba",
    numeroCompte: num ? num[1] : "",
    intitule,
    solde,
    soldeDisponible: montantApres(lignes, /Solde disponible|Available Balance/i),
    // « Solde disponible (30/09/2026): » — la date de la situation est entre
    // parenthèses, là où les autres banques la mettent en tête de relevé.
    dateSolde: dateDuReleve(ligneDispo.match(/\(([^)]*)\)/)?.[1] ?? ""),
    probleme: solde === null ? "Solde de clôture introuvable." : null,
  };
}

/** NSIA Banque Togo — « SOLDE » seul, en fin de tableau. */
function lireNsiaTogo(lignes: string[]): ReleveLu {
  let solde: number | null = null;
  for (const l of lignes) {
    if (!/^\s*SOLDE\b/i.test(l)) continue;
    const v = montantsDe(l);
    if (v.length > 0) solde = v[v.length - 1];
  }
  const ligne = lignes.find((l) => /Num[ée]ro de Compte/i.test(l)) ?? "";
  const reste = ligne.replace(/.*Num[ée]ro de Compte/i, "").trim();
  const num = reste.match(/\d{8,}/);
  return {
    ...VIDE,
    format: "nsia-togo",
    numeroCompte: num ? num[0] : "",
    intitule: num ? reste.slice(reste.indexOf(num[0]) + num[0].length).trim() : reste,
    solde,
    dateSolde: dateDuReleve(apresEtiquette(lignes, /\bAu\b/i)),
    probleme: solde === null ? "Aucune ligne « SOLDE » en fin de relevé." : null,
  };
}

// ── Le répartiteur ──────────────────────────────────────────────────────────

/**
 * Reconnaît le format puis lit le relevé.
 *
 * L'ORDRE DES TESTS COMPTE. « EXTRAIT DE COMPTE » est la signature la plus
 * sûre et vient en premier ; les autres se distinguent par une étiquette qui
 * leur est propre. Un relevé qui ne correspond à rien ressort avec un format
 * vide — il sera signalé, pas interprété au jugé.
 */
export function interpreterReleve(lignes: string[]): ReleveLu {
  const texte = sansAccent(lignes.join("\n"));

  if (texte.includes("extrait de compte")) return lireExtrait(lignes);
  if (texte.includes("titulaire du compte") && texte.includes("solde de cloture"))
    return lireAfg(lignes);
  if (texte.includes("solde comptable de cloture")) return lireEcobank(lignes);
  if (texte.includes("nom du titulaire") && texte.includes("solde de cloture"))
    return lireBoa(lignes);
  if (texte.includes("intitule du compte") && texte.includes("solde disponible"))
    return lireBis(lignes);
  if (texte.includes("historique des mouvements")) return lireNsia(lignes);
  if (
    texte.includes("account statement") &&
    (texte.includes("resume du compte") || texte.includes("account summary"))
  )
    return lireUba(lignes);
  if (texte.includes("solde debut periode")) return lireNsiaTogo(lignes);

  return {
    ...VIDE,
    probleme:
      "Format de relevé non reconnu : aucune des huit mises en page connues.",
  };
}
