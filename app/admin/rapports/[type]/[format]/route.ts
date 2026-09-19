import { getMyAdminLevel } from "@/lib/admin/auth";
import { getCotationReportData } from "@/lib/reports/cotation";
import { renderCotationReportHtml } from "@/lib/reports/cotationReportHtml";
import { buildCotationExcel } from "@/lib/reports/cotationExcel";
import { getCommoditiesWeeklyData } from "@/lib/reports/commoditiesWeekly";
import { renderCommoditiesWeeklyHtml } from "@/lib/reports/commoditiesWeeklyHtml";
import { getMoneyMarketWeeklyData } from "@/lib/reports/moneyMarketWeekly";
import { renderMoneyMarketWeeklyHtml } from "@/lib/reports/moneyMarketWeeklyHtml";
import { htmlToPdf } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La valeur la PLUS LONGUE des quatre rapports (les hebdos matières premières
// et titres publics interrogent le web avant de rendre le PDF). Un maxDuration
// propre à chaque route les aurait séparées en autant de fonctions — c'est
// précisément ce qu'on cherche à éviter ici. Un plafond plus haut ne coûte rien
// aux rapports rapides : il borne, il ne réserve pas.
export const maxDuration = 300;

const PDF = "application/pdf";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Document = {
  // `Uint8Array<ArrayBuffer>` et non `Uint8Array` : depuis TypeScript 5.7 le
  // type est generique sur son tampon, et la forme large `ArrayBufferLike`
  // n'est pas acceptee comme corps de Response.
  octets: Uint8Array<ArrayBuffer>;
  contentType: string;
  nomFichier: string;
};

/**
 * GET /admin/rapports/<type>/<format>
 *
 * GUICHET UNIQUE DES RAPPORTS ADMIN.
 *
 * Les quatre rapports avaient chacun sa route, donc chacun sa fonction
 * serverless — sur un plan Hobby plafonné à douze, c'est un quart du budget
 * pour quatre variantes du même geste : produire des données, les rendre,
 * renvoyer un fichier en pièce jointe.
 *
 * Deux segments dynamiques suffisent, et AUCUNE URL ne change :
 * /admin/rapports/cotation/pdf répond exactement comme avant. Les liens de la
 * console admin n'ont pas à bouger.
 */
const RAPPORTS: Record<string, () => Promise<Document>> = {
  "cotation/pdf": async () => {
    const data = await getCotationReportData();
    const pdf = await htmlToPdf(renderCotationReportHtml(data));
    const date = data.session.fetchedAt.slice(0, 10);
    return {
      octets: new Uint8Array(pdf),
      contentType: PDF,
      nomFichier: `Daily_Market_Report_${date}.pdf`,
    };
  },
  "cotation/xlsx": async () => {
    const data = await getCotationReportData();
    const buf = await buildCotationExcel(data);
    const date = data.session.fetchedAt.slice(0, 10);
    return {
      octets: new Uint8Array(buf),
      contentType: XLSX,
      nomFichier: `cotation-brvm-${date}.xlsx`,
    };
  },
  "commodities/pdf": async () => {
    const data = await getCommoditiesWeeklyData();
    const pdf = await htmlToPdf(renderCommoditiesWeeklyHtml(data), { landscape: false });
    const date = data.asOf || new Date().toISOString().slice(0, 10);
    return {
      octets: new Uint8Array(pdf),
      contentType: PDF,
      nomFichier: `Hebdo_Matieres_Premieres_${date}.pdf`,
    };
  },
  "mtp/pdf": async () => {
    const data = await getMoneyMarketWeeklyData();
    const pdf = await htmlToPdf(renderMoneyMarketWeeklyHtml(data), { landscape: false });
    const date = data.asOf || new Date().toISOString().slice(0, 10);
    return {
      octets: new Uint8Array(pdf),
      contentType: PDF,
      nomFichier: `Hebdo_Marche_Titres_Publics_${date}.pdf`,
    };
  },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string; format: string }> },
) {
  const level = await getMyAdminLevel();
  if (level === null) {
    return new Response("Accès réservé aux administrateurs.", { status: 403 });
  }

  const { type, format } = await params;
  const cle = `${type}/${format}`;
  const produire = RAPPORTS[cle];
  // 404 et non 400 : pour l'appelant, une combinaison inconnue est une URL qui
  // n'existe pas — c'est ce que répondait l'ancien routage.
  if (!produire) return new Response("Rapport inconnu.", { status: 404 });

  try {
    const doc = await produire();
    return new Response(doc.octets, {
      headers: {
        "Content-Type": doc.contentType,
        "Content-Disposition": `attachment; filename="${doc.nomFichier}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(`[rapports/${cle}]`, err);
    return new Response(
      (format === "xlsx" ? "Échec de la génération de l'Excel : " : "Échec de la génération du PDF : ") +
        (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
