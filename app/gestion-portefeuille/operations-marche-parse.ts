import "server-only";

// === Import des opérations de marché — rapport du dépositaire ===
//
// Le « Rapport Asset Management » donne une ligne par TRANSACTION élémentaire,
// telle que le carnet d'ordres l'a servie. Une séance en produit des centaines
// — 541 pour six titres le 22 septembre — parce qu'un ordre de 2 604 titres se
// sert en cent-huit fois, au gré des contreparties qui se présentent.
//
// ON REGROUPE PAR TITRE, PRIX ET DATE. Ce n'est pas un confort d'affichage :
// le module raisonne en ORDRES, et cent-huit exécutions au même prix le même
// jour sont un seul fait de gestion. Les saisir une à une produirait cent-huit
// ordres là où il y en a eu un, et un point de trésorerie illisible.
//
// L'HEURE revient d'ExcelJS en `Date`, pas en numéro de série — la
// bibliothèque a déjà fait la conversion. On n'en garde que le JOUR : un ordre
// se date du jour, et la minute d'exécution appartient au carnet, pas au
// portefeuille.
//
// LE SYMBOLE ET LE FONDS ne sont portés, dans l'export brut, que par la
// première ligne de chaque bloc. On les REPORTE d'une ligne sur l'autre : les
// lire sans mémoire donnerait des transactions sans titre.

import ExcelJS from "exceljs";

/** Une ligne d'ordre, après regroupement. */
export type OrdreImporte = {
  /** Mnémonique BRVM tel que le dépositaire l'écrit — BOAC, SNTS… */
  symbole: string;
  /** Date de la séance, ISO. */
  date: string;
  sens: "achat" | "vente";
  quantite: number;
  prix: number;
  /** Somme des valeurs des transactions regroupées. Sert de CONTRÔLE : elle
   *  doit valoir quantité × prix, et un écart signale une ligne mal lue. */
  valeur: number;
  /** Nombre de transactions élémentaires derrière cette ligne. Affiché : un
   *  ordre servi en cent-huit fois ne se lit pas comme un ordre unique. */
  transactions: number;
  /** Nom du fonds tel qu'écrit dans le fichier. Sert à AVERTIR quand il ne
   *  correspond pas au fonds choisi à l'écran — pas à décider à sa place. */
  fondsFichier: string;
};

export type ResultatImportOperations = {
  ordres: OrdreImporte[];
  /** Transactions élémentaires retenues, avant regroupement. */
  transactionsLues: number;
  avertissements: string[];
};

/** En-têtes cherchés, en minuscules sans accent. Les colonnes du dépositaire
 *  que le module n'exploite pas — numéro de transaction, compte DC/BR,
 *  référence d'affectation, n° d'ordre — ne figurent pas ici : les nommer
 *  n'aurait servi qu'à faire échouer la lecture le jour où l'une change. */
const ENTETES: Record<string, string> = {
  symbole: "code symbole",
  heure: "heure de transactions",
  volume: "volume",
  cours: "cours",
  valeur: "valeur",
  type: "type",
};

const sansAccent = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const texte = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  if (typeof v === "object" && "richText" in v)
    return v.richText.map((t) => t.text).join("").trim();
  if (typeof v === "object" && "text" in v) return String(v.text ?? "").trim();
  return String(v).trim();
};

const nombre = (v: ExcelJS.CellValue): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  // Le dépositaire exporte parfois ses montants en texte, à la française :
  // espaces de milliers — insécables compris — et virgule décimale.
  const n = Number(texte(v).replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Jour d'une cellule d'horodatage, ISO.
 *
 * ExcelJS rend un `Date` quand la cellule est formatée en date ; on lit alors
 * ses composantes UTC, parce que c'est ainsi qu'il l'a construite et que
 * passer par l'heure locale décalerait d'un jour toute séance ouverte avant
 * l'aube ou close après minuit selon le fuseau de la machine.
 *
 * Un classeur écrit par un autre outil peut laisser le NUMÉRO DE SÉRIE brut :
 * 46287 pour le 22/09/2026. L'époque d'Excel est le 30/12/1899 — à cause du
 * faux 29 février 1900 qu'il a gardé par compatibilité avec Lotus —, d'où les
 * 25 569 jours qui la ramènent à l'époque Unix.
 */
function jourDe(v: ExcelJS.CellValue): string {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return new Date((Math.floor(v) - 25569) * 86_400_000).toISOString().slice(0, 10);
  }
  const t = texte(v);
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const fr = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  return "";
}

type Entete = {
  ligne: number;
  col: Record<string, number>;
  /** Dernière colonne NOMMÉE de l'en-tête, toutes colonnes confondues — y
   *  compris celles qu'on n'exploite pas. C'est d'elle que se déduit la
   *  colonne du fonds, qui n'a, elle, aucun en-tête. */
  derniereNommee: number;
};

/** Repère les colonnes par leur EN-TÊTE, jamais par leur position. */
function reperer(ws: ExcelJS.Worksheet): Entete | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
    const row = ws.getRow(r);
    const col: Record<string, number> = {};
    let derniereNommee = 0;
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const t = sansAccent(texte(cell.value));
      if (!t) return;
      derniereNommee = Math.max(derniereNommee, c);
      for (const [clef, attendu] of Object.entries(ENTETES)) {
        if (!col[clef] && t === attendu) col[clef] = c;
      }
    });
    // Le volume, le cours et le type suffisent à reconnaître la ligne
    // d'en-tête : sans eux il n'y a pas d'opération à reconstituer, et avec
    // eux on est certain de ne pas avoir pris un titre de rapport pour elle.
    if (col.volume && col.cours && col.type) return { ligne: r, col, derniereNommee };
  }
  return null;
}

export async function parseOperationsMarcheBuffer(
  buffer: Buffer,
): Promise<ResultatImportOperations> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const feuilles = wb.worksheets.filter((s) => s.rowCount > 1);
  if (feuilles.length === 0) {
    return { ordres: [], transactionsLues: 0, avertissements: ["Le fichier est vide."] };
  }

  // La feuille qui PORTE L'EN-TÊTE, pas la première venue : un export peut
  // ouvrir sur une page de garde.
  let ws: ExcelJS.Worksheet | null = null;
  let entete: Entete | null = null;
  for (const f of feuilles) {
    const e = reperer(f);
    if (e) {
      ws = f;
      entete = e;
      break;
    }
  }
  if (!ws || !entete) {
    return {
      ordres: [],
      transactionsLues: 0,
      avertissements: [
        "Aucune feuille ne porte les colonnes « Volume », « Cours » et « Type » : " +
          "ce fichier n'est pas un rapport de transactions.",
      ],
    };
  }

  const { ligne, col, derniereNommee } = entete;
  const avertissements: string[] = [];
  // LA COLONNE DU FONDS N'A PAS D'EN-TÊTE dans l'export : elle suit la
  // dernière colonne nommée. On la déduit plutôt que de coder un numéro en
  // dur, que l'ajout d'une colonne par le dépositaire invaliderait en silence.
  const colFonds = derniereNommee + 1;

  let symbole = "";
  let fondsFichier = "";
  let transactionsLues = 0;
  let ignorees = 0;
  const groupes = new Map<string, OrdreImporte>();

  for (let r = ligne + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);

    // REPORT : le symbole et le fonds ne figurent que sur la première ligne du
    // bloc. Les écraser avec du vide perdrait toutes les lignes suivantes.
    const s = col.symbole ? texte(row.getCell(col.symbole).value) : "";
    if (s) symbole = s;
    const f = texte(row.getCell(colFonds).value);
    if (f) fondsFichier = f;

    const quantite = nombre(row.getCell(col.volume).value);
    const prix = nombre(row.getCell(col.cours).value);
    // Ligne vide ou ligne de total : ni l'une ni l'autre n'est une
    // transaction, et toutes deux se reconnaissent à ceci.
    if (!(quantite > 0) || !(prix > 0)) continue;

    const brutType = sansAccent(texte(row.getCell(col.type).value));
    const estAchat = brutType.startsWith("achat");
    const estVente = brutType.startsWith("vente");
    if (!estAchat && !estVente) {
      ignorees += 1;
      avertissements.push(
        `Ligne ${r} : sens « ${texte(row.getCell(col.type).value) || "vide"} » ` +
          `non reconnu, transaction écartée.`,
      );
      continue;
    }

    const date = col.heure ? jourDe(row.getCell(col.heure).value) : "";
    if (!date) {
      ignorees += 1;
      avertissements.push(`Ligne ${r} : date illisible, transaction écartée.`);
      continue;
    }
    if (!symbole) {
      ignorees += 1;
      avertissements.push(`Ligne ${r} : aucun code symbole, transaction écartée.`);
      continue;
    }

    transactionsLues += 1;
    const valeur = col.valeur ? nombre(row.getCell(col.valeur).value) : quantite * prix;
    const sens: "achat" | "vente" = estAchat ? "achat" : "vente";

    // LA CLEF : titre, date, prix — et le sens, qu'on y ajoute parce qu'un
    // achat et une vente du même titre au même prix le même jour sont deux
    // faits opposés, que les additionner effacerait l'un et l'autre.
    const clef = `${symbole}|${date}|${sens}|${prix}`;
    const deja = groupes.get(clef);
    if (deja) {
      deja.quantite += quantite;
      deja.valeur += valeur;
      deja.transactions += 1;
    } else {
      groupes.set(clef, {
        symbole,
        date,
        sens,
        quantite,
        prix,
        valeur,
        transactions: 1,
        fondsFichier,
      });
    }
  }

  const ordres = [...groupes.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.symbole.localeCompare(b.symbole) ||
      b.prix - a.prix,
  );

  // CONTRÔLE DE BOUCLAGE : la valeur cumulée doit valoir quantité × prix. Un
  // écart dit que la colonne « Valeur » du fichier porte autre chose que le
  // brut — des frais, par exemple —, auquel cas les montants calculés ici ne
  // correspondront pas à l'avis d'opéré. Mieux vaut le dire que le taire.
  for (const o of ordres) {
    const attendu = o.quantite * o.prix;
    if (attendu > 0 && Math.abs(o.valeur - attendu) / attendu > 0.001) {
      avertissements.push(
        `${o.symbole} au ${o.date} à ${o.prix} : le fichier porte ` +
          `${Math.round(o.valeur).toLocaleString("fr-FR")} F là où quantité × prix ` +
          `donne ${Math.round(attendu).toLocaleString("fr-FR")} F.`,
      );
    }
  }

  if (ordres.length === 0 && ignorees === 0) {
    avertissements.push("Aucune transaction trouvée sous l'en-tête.");
  }

  return { ordres, transactionsLues, avertissements };
}
