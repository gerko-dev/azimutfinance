import { getFundTitre, getStatement } from "@/lib/fundamentals";
import { computeRatiosByTicker } from "@/lib/fundamentalsCalc";
import { buildFundamentalsExcel } from "@/lib/reports/fundamentalsExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /pros/titre/[code]/fundamentals/xlsx
// Exporte les états financiers détaillés (bilan, compte de résultat, flux)
// d'un émetteur, tous exercices confondus, au format Excel.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const ticker = code.toUpperCase();

  const titre = getFundTitre(ticker);
  if (!titre) {
    return new Response(`Aucune donnée fondamentale pour ${ticker}.`, {
      status: 404,
    });
  }

  try {
    const ratios = computeRatiosByTicker(ticker);
    const exercices = ratios.map((r) => r.exercice).sort((a, b) => a - b);

    const sections = [
      { title: "Bilan · Actif", lines: getStatement(ticker, "Bilan_Actif", exercices) },
      { title: "Bilan · Passif", lines: getStatement(ticker, "Bilan_Passif", exercices) },
      {
        title: "Compte de résultat",
        lines: getStatement(ticker, "Compte_Resultat", exercices),
      },
      {
        title: "Tableau des flux",
        lines: getStatement(ticker, "Tableau_Flux", exercices),
      },
    ];

    const buf = await buildFundamentalsExcel({
      ticker,
      titre,
      exercices,
      sections,
    });

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="etats-financiers-${ticker}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[pros/titre/fundamentals/xlsx]", err);
    return new Response(
      "Échec de la génération de l'Excel : " +
        (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
