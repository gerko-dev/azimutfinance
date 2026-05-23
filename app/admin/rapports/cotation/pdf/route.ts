import { getMyAdminLevel } from "@/lib/admin/auth";
import { getCotationReportData } from "@/lib/reports/cotation";
import { renderCotationReportHtml } from "@/lib/reports/cotationReportHtml";
import { htmlToPdf } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /admin/rapports/cotation/pdf — génère le Daily Market Report en PDF.
export async function GET() {
  const level = await getMyAdminLevel();
  if (level === null) {
    return new Response("Accès réservé aux administrateurs.", { status: 403 });
  }

  try {
    const data = await getCotationReportData();
    const html = renderCotationReportHtml(data);
    const pdf = await htmlToPdf(html);
    const date = data.session.fetchedAt.slice(0, 10);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Daily_Market_Report_${date}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[rapports/cotation/pdf]", err);
    return new Response(
      "Échec de la génération du PDF : " +
        (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
