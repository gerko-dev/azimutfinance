import { getMyAdminLevel } from "@/lib/admin/auth";
import { getMoneyMarketWeeklyData } from "@/lib/reports/moneyMarketWeekly";
import { renderMoneyMarketWeeklyHtml } from "@/lib/reports/moneyMarketWeeklyHtml";
import { htmlToPdf } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La recherche web Claude + le rendu Chromium peuvent prendre du temps.
export const maxDuration = 300;

// GET /admin/rapports/mtp/pdf — hebdo marché des titres publics (A4 portrait).
export async function GET() {
  const level = await getMyAdminLevel();
  if (level === null) {
    return new Response("Accès réservé aux administrateurs.", { status: 403 });
  }

  try {
    const data = await getMoneyMarketWeeklyData();
    const html = renderMoneyMarketWeeklyHtml(data);
    const pdf = await htmlToPdf(html, { landscape: false });
    const date = data.asOf || new Date().toISOString().slice(0, 10);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Hebdo_Marche_Titres_Publics_${date}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[rapports/mtp/pdf]", err);
    return new Response(
      "Échec de la génération du PDF : " +
        (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
