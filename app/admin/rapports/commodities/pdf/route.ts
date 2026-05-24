import { getMyAdminLevel } from "@/lib/admin/auth";
import { getCommoditiesWeeklyData } from "@/lib/reports/commoditiesWeekly";
import { renderCommoditiesWeeklyHtml } from "@/lib/reports/commoditiesWeeklyHtml";
import { htmlToPdf } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La recherche web Claude + le rendu Chromium peuvent prendre du temps.
export const maxDuration = 300;

// GET /admin/rapports/commodities/pdf — rapport hebdo matières premières (A4 portrait).
export async function GET() {
  const level = await getMyAdminLevel();
  if (level === null) {
    return new Response("Accès réservé aux administrateurs.", { status: 403 });
  }

  try {
    const data = await getCommoditiesWeeklyData();
    const html = renderCommoditiesWeeklyHtml(data);
    const pdf = await htmlToPdf(html, { landscape: false });
    const date = data.asOf || new Date().toISOString().slice(0, 10);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Hebdo_Matieres_Premieres_${date}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[rapports/commodities/pdf]", err);
    return new Response(
      "Échec de la génération du PDF : " +
        (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
