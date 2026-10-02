import "server-only";

// === Le texte d'un relevé, ligne par ligne ===
//
// UN RELEVE N'EST PAS UN TEXTE, C'EST UNE MISE EN PAGE. Les douze banques
// posent leurs étiquettes et leurs montants à des positions choisies par leur
// logiciel ; le flux de texte d'un PDF, lui, ne garde que l'ordre de dessin —
// qui chez AFG place la valeur avant son libellé, et chez Ecobank entrelace
// deux colonnes d'étiquettes.
//
// On reconstruit donc les lignes À PARTIR DES COORDONNEES, et on marque les
// colonnes par des blancs larges : c'est ce qui permet au lecteur
// (`releves-parse.ts`) de distinguer « 261 700 » et « 216 845 » — un débit et
// un solde — de l'unique nombre que leur concaténation formerait.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsModule: any = null;

async function getPdfJs() {
  if (!pdfjsModule) {
    pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Le worker est importé explicitement pour que le traceur de Next
    // l'embarque — même raison que dans `lib/tauxPdfParser.ts`, où son absence
    // en production faisait échouer tout parsing avec « fake worker failed ».
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }
  return pdfjsModule;
}

/** Deux fragments séparés de plus de ce nombre de points sont deux COLONNES. */
const BLANC_LARGE = 12;

/** Deux fragments à moins de cette distance verticale sont sur la MEME ligne. */
const MEME_LIGNE = 3;

/**
 * Les lignes de texte d'un PDF, dans l'ordre de lecture.
 *
 * Les colonnes sont séparées par trois espaces, les mots par un seul : le
 * lecteur s'appuie sur cette distinction pour découper les montants.
 */
export async function lignesDuPdf(donnees: Uint8Array): Promise<string[]> {
  const pdfjs = await getPdfJs();
  const pdf = await pdfjs.getDocument({
    data: donnees,
    disableFontFace: true,
    useSystemFonts: false,
    // Les relevés n'embarquent pas toujours leurs polices standard ; sans
    // cela, pdfjs avertit à chaque page et pollue les journaux du serveur.
    standardFontDataUrl: undefined,
  }).promise;

  const lignes: { y: number; items: { str: string; x: number }[] }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const contenu = await page.getTextContent();
    const vue = page.getViewport({ scale: 1 });
    const items = contenu.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => ({
        str: String(it.str ?? ""),
        x: Math.round(it.transform[4] * 10) / 10,
        y: Math.round((vue.height - it.transform[5]) * 10) / 10,
      }))
      .filter((it: { str: string }) => it.str.trim() !== "");
    items.sort(
      (a: { x: number; y: number }, b: { x: number; y: number }) =>
        a.y - b.y || a.x - b.x,
    );

    let courante: { y: number; items: { str: string; x: number }[] } | null = null;
    for (const it of items) {
      if (!courante || Math.abs(it.y - courante.y) > MEME_LIGNE) {
        courante = { y: it.y, items: [it] };
        lignes.push(courante);
      } else {
        courante.items.push(it);
      }
    }
  }

  return lignes.map((l) => {
    let texte = "";
    let xFin: number | null = null;
    for (const it of l.items) {
      if (xFin !== null) {
        const ecart = it.x - xFin;
        texte += ecart > BLANC_LARGE ? "   " : ecart > 2 ? " " : "";
      }
      texte += it.str;
      // Largeur approchée du fragment : pdfjs ne la donne pas toujours, et
      // 4,5 points par caractère suffit à savoir si le suivant est collé ou
      // s'il commence une autre colonne.
      xFin = it.x + it.str.length * 4.5;
    }
    return texte;
  });
}
