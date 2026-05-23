import { getMyAdminLevel } from "@/lib/admin/auth";
import { getCotationReportData } from "@/lib/reports/cotation";
import { buildCotationExcel } from "@/lib/reports/cotationExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /admin/rapports/cotation/xlsx — génère le classeur de cotation.
export async function GET() {
  const level = await getMyAdminLevel();
  if (level === null) {
    return new Response("Accès réservé aux administrateurs.", { status: 403 });
  }

  try {
    const data = await getCotationReportData();
    const buf = await buildCotationExcel(data);
    const date = data.session.fetchedAt.slice(0, 10);

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cotation-brvm-${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[rapports/cotation/xlsx]", err);
    return new Response(
      "Échec de la génération de l'Excel : " +
        (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
