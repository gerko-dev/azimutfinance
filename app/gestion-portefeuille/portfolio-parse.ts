// Parsing serveur d'un fichier d'inventaire Excel (.xlsx) vers des lignes de
// portefeuille brutes, regroupées par section. Utilise exceljs (dépendance déjà
// présente). Module serveur : importé uniquement par les server actions.
import ExcelJS from "exceljs";
import type { PortfolioSection } from "./portfolio-types";

// Disposition par défaut (modèle NSIA) :
// Code/Symbole | Titre | Quantité | PRU | Prix de revient | Cours | Intérêts courus | Valorisation
//
// Ce n'est qu'un REPLI. Les colonnes sont d'abord repérées par leur en-tête :
// se fier à la position est silencieusement faux dès qu'un dépositaire insère
// une colonne ou en retire une — et l'erreur ne se voit pas, elle se lit comme
// une donnée manquante. Un intérêt couru lu dans la mauvaise colonne vaut
// « 0 » sans que rien ne le signale.
const COL = {
  code: 1,
  label: 2,
  quantity: 3,
  pru: 4,
  cost: 5,
  price: 6,
  accrued: 7,
  valuation: 8,
} as const;

type ColonneCle = keyof typeof COL;
type Disposition = Record<ColonneCle, number>;

/** Synonymes d'en-tête, du plus spécifique au plus général.
 *
 *  L'ordre compte : « prix de revient unitaire » désigne le PRU, pas le prix de
 *  revient total. On teste donc les libellés longs avant les courts. */
const ENTETES: { cle: ColonneCle; motifs: string[] }[] = [
  { cle: "pru", motifs: ["pru", "prix de revient unitaire", "cout unitaire", "cmp"] },
  {
    cle: "cost",
    motifs: ["prix de revient", "cout d achat", "cout total", "montant investi", "valeur d acquisition"],
  },
  {
    cle: "accrued",
    motifs: ["interets courus", "interet couru", "coupon couru", "coupons courus", "couru"],
  },
  {
    cle: "valuation",
    motifs: ["valorisation", "valeur boursiere", "valeur de marche", "evaluation", "valeur actuelle"],
  },
  { cle: "quantity", motifs: ["quantite", "qte", "nombre de titres", "nombre"] },
  { cle: "price", motifs: ["cours", "prix de marche", "dernier cours", "prix"] },
  { cle: "code", motifs: ["code symbole", "code isin", "symbole", "code", "isin"] },
  { cle: "label", motifs: ["titre", "libelle", "designation", "valeur", "intitule"] },
];

function normEntete(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Repère la ligne d'en-tête et la position de chaque colonne.
 *
 * Renvoie la disposition par défaut si aucun en-tête exploitable n'est trouvé
 * dans les premières lignes — certains exports n'en ont pas.
 */
function detecterDisposition(ws: ExcelJS.Worksheet): {
  disposition: Disposition;
  ligneEntete: number | null;
  trouvees: Set<ColonneCle>;
} {
  const disposition: Disposition = { ...COL };
  const trouvees = new Set<ColonneCle>();
  let ligneEntete: number | null = null;

  const limite = Math.min(ws.rowCount, 15);
  for (let n = 1; n <= limite && ligneEntete === null; n++) {
    const row = ws.getRow(n);
    const vues = new Map<ColonneCle, number>();

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const t = normEntete(cellText(cell));
      if (!t) return;
      for (const { cle, motifs } of ENTETES) {
        if (vues.has(cle)) continue;
        // Égalité d'abord, puis inclusion : « cours » ne doit pas capturer
        // « cours de revient » avant que « prix de revient » ne soit testé.
        if (motifs.some((m) => t === m) || motifs.some((m) => t.includes(m))) {
          vues.set(cle, col);
          return;
        }
      }
    });

    // Une vraie ligne d'en-tête nomme au moins le libellé et un montant.
    if (vues.has("label") && (vues.has("valuation") || vues.has("quantity"))) {
      ligneEntete = n;
      for (const [cle, col] of vues) {
        disposition[cle] = col;
        trouvees.add(cle);
      }
      // Colonne code non NOMMÉE dans l'en-tête. Deux situations opposées, que
      // seule la position du libellé sépare :
      //
      //  - le libellé est en 2e colonne ou au-delà : il y a bien une colonne
      //    avant lui, et c'est le symbole (modèle NSIA, dont l'en-tête de cette
      //    colonne est vide) ;
      //  - le libellé est en 1re colonne : le fichier n'a PAS de colonne code.
      //    Garder le repli à la colonne 1 ferait lire le libellé comme un
      //    symbole, et chaque ligne porterait un faux code impossible à
      //    rapprocher.
      if (!vues.has("code")) disposition.code = disposition.label > 1 ? 1 : 0;
    }
  }

  return { disposition, ligneEntete, trouvees };
}

// Une ligne brute avant matching.
export type RawPosition = {
  section: PortfolioSection;
  rawCode: string;
  rawLabel: string;
  quantity: number | null;
  pru: number | null;
  cost: number | null;
  price: number | null;
  accruedInterest: number | null;
  valuation: number | null;
};

// Extrait la valeur scalaire d'une cellule exceljs (nombre, formule, texte riche).
function cellRaw(cell: ExcelJS.Cell): unknown {
  let v: unknown = cell.value;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) v = o.result;
    else if ("text" in o) v = o.text;
    else if ("richText" in o && Array.isArray(o.richText))
      v = (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
    else v = null;
  }
  return v;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cellRaw(cell);
  return v === null || v === undefined ? "" : String(v).trim();
}

// Convertit une cellule en nombre. Gère les nombres natifs et les chaînes
// françaises ("12 345,67", "1,23E+11") ou standard. "" / null => null.
function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cellRaw(cell);
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === "" || s === "-" || s === "NC") return null;
  // Espaces (y compris insécables) = séparateurs de milliers.
  s = s.replace(/[\s  ]/g, "");
  // Format français : virgule décimale.
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Déduit une section à partir d'une ligne "en-tête de section" (code vide,
// libellé du type "Action" / "Obligation" / "OPCVM" / "Banque").
function sectionFromHeader(label: string): PortfolioSection | null {
  const l = label.toLowerCase();
  if (l.includes("obligation")) return "obligation";
  if (l.includes("opcvm")) return "opcvm";
  if (l.includes("action")) return "action";
  if (l.includes("banque") || l.includes("trésor") || l.includes("tresor") || l.includes("liquid"))
    return "tresorerie";
  return null;
}

export type ParseResult = {
  positions: RawPosition[];
  totalValuation: number;
  /** Ce que la lecture du fichier a dû supposer. Un import silencieux sur un
   *  fichier mal disposé est la pire des issues : les chiffres sortent, faux. */
  avertissements: string[];
};

// Parse le buffer d'un .xlsx en lignes de portefeuille.
export async function parseInventoryBuffer(buffer: Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  // Cast : @types/node expose Buffer<ArrayBufferLike>, exceljs attend son type
  // Buffer historique — même objet à l'exécution.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  // On prend la première feuille contenant des données.
  let ws: ExcelJS.Worksheet | undefined;
  wb.eachSheet((sheet) => {
    if (!ws && sheet.rowCount > 1) ws = sheet;
  });
  if (!ws) return { positions: [], totalValuation: 0, avertissements: [] };

  const { disposition, ligneEntete, trouvees } = detecterDisposition(ws);
  const avertissements: string[] = [];
  if (ligneEntete === null) {
    avertissements.push(
      "Aucune ligne d'en-tête reconnue : les colonnes ont été lues à leur position du modèle NSIA (Code | Titre | Quantité | PRU | Prix de revient | Cours | Intérêts courus | Valorisation). Vérifiez les montants importés.",
    );
  } else {
    // On ne signale que ce qui change un calcul. L'intérêt couru en fait
    // partie : sans lui, un dépôt à terme est valorisé à son seul nominal.
    if (!trouvees.has("accrued")) {
      avertissements.push(
        "Colonne « Intérêts courus » introuvable dans le fichier : les dépôts à terme et les obligations seront valorisés sans coupon couru.",
      );
    }
    if (!trouvees.has("valuation")) {
      avertissements.push(
        "Colonne « Valorisation » introuvable : la valorisation a été lue à sa position par défaut.",
      );
    }
  }

  const positions: RawPosition[] = [];
  let section: PortfolioSection = "autre";
  let total = 0;

  ws.eachRow((row, numero) => {
    if (numero === ligneEntete) return;

    const code = disposition.code > 0 ? cellText(row.getCell(disposition.code)) : "";
    const label = cellText(row.getCell(disposition.label));

    // En-tête de colonnes d'un fichier sans ligne d'en-tête détectée.
    if (code.toLowerCase().replace(/\s/g, "").startsWith("code/") || code.toLowerCase() === "code") {
      return;
    }

    const quantity = cellNum(row.getCell(disposition.quantity));
    const pru = cellNum(row.getCell(disposition.pru));
    const cost = cellNum(row.getCell(disposition.cost));
    const price = cellNum(row.getCell(disposition.price));
    const accruedInterest = cellNum(row.getCell(disposition.accrued));
    const valuation = cellNum(row.getCell(disposition.valuation));
    const aUnChiffre = [quantity, pru, cost, price, accruedInterest, valuation].some(
      (v) => v !== null,
    );

    // Ni code ni libellé : ligne vide, ou SOUS-TOTAL de section — les fichiers
    // issus de notre système laissent la colonne titre vide sur ces lignes.
    // Les totaux sont recalculés, jamais repris.
    if (!code && !label) return;

    // Une ligne sans aucun montant n'est pas une position : c'est l'en-tête
    // d'une section (« Action », « Banque », « Obligation », « OPCVM »).
    //
    // Ce test ne s'applique QU'EN L'ABSENCE de code : dans un fichier qui en
    // porte un, une ligne codée sans montant reste une position — à zéro,
    // mais réelle — et la faire disparaître serait pire que de l'importer.
    if (!code && !aUnChiffre) {
      const s = sectionFromHeader(label);
      if (s) section = s;
      return;
    }

    positions.push({
      section,
      rawCode: code,
      rawLabel: label,
      quantity,
      pru,
      cost,
      price,
      accruedInterest,
      valuation,
    });
    if (valuation != null) total += valuation;
  });

  return { positions, totalValuation: total, avertissements };
}
