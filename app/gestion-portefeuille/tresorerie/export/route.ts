import { buildEngagementsExcel } from "@/lib/reports/engagementsExcel";

import { loadMyFunds } from "../../data";
import { construireExportEngagements } from "../../engagements-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /gestion-portefeuille/tresorerie/export?fonds=<id>&engagements=AAAA-MM-JJ
 *
 * Les engagements au format de la feuille « Autres opérations » du classeur de
 * gestion de trésorerie. MÊMES PARAMÈTRES QUE L'ÉCRAN, volontairement : le
 * fichier doit porter ce que le gérant a sous les yeux, pas un périmètre qu'il
 * faudrait re-choisir.
 *
 * Sans `fonds`, ou avec un identifiant inconnu, l'export couvre TOUS les fonds
 * — c'est la règle de l'écran, où l'absence de choix vaut consolidé.
 *
 * La garde d'accès du layout couvre cette route comme le reste du module :
 * `loadMyFunds` ne rend que les fonds du gérant connecté, et un visiteur non
 * authentifié en obtient zéro.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const choix = url.searchParams.get("fonds") ?? "";
  const demande = url.searchParams.get("engagements") ?? "";
  const dateArrete = EST_DATE.test(demande)
    ? demande
    : new Date().toISOString().slice(0, 10);

  const tous = await loadMyFunds();
  if (tous.length === 0) {
    return new Response("Aucun fonds géré.", { status: 404 });
  }
  const choisi = tous.find((f) => f.id === choix);
  const fonds = choisi ? [choisi] : tous;

  try {
    const donnees = await construireExportEngagements(fonds, dateArrete);
    const buf = await buildEngagementsExcel(donnees);
    const nom = choisi
      ? `engagements-${choisi.nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${dateArrete}.xlsx`
      : `engagements-${dateArrete}.xlsx`;

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nom}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[gestion-portefeuille/tresorerie/export]", err);
    return new Response(
      "Échec de la génération de l'export : " +
        (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
