import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRapportComite } from "@/lib/reports/comite/data";
import { renderRapportComiteHtml } from "@/lib/reports/comite/html";
import { htmlToPdf } from "@/lib/reports/pdf";

import { estNiveau1, MSG_NIVEAU1 } from "../../guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Le rapport assemble une dizaine de sections et lance Chromium : la durée par
// défaut d'une route ne suffit pas. Même plafond que les rapports existants.
export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /gestion-portefeuille/reporting/pdf?debut=&intermediaire=&fin=
 *
 *  Les trois bornes sont OBLIGATOIRES et fournies par l'utilisateur : aucune
 *  valeur par défaut ici. Un rapport de comité qui se génère sur une période
 *  implicite est un rapport dont personne ne sait ce qu'il mesure.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Tu dois être connecté.", { status: 401 });
  if (!(await estNiveau1())) return new Response(MSG_NIVEAU1, { status: 403 });

  const q = new URL(req.url).searchParams;
  const debut = q.get("debut") ?? "";
  const intermediaire = q.get("intermediaire") ?? "";
  const fin = q.get("fin") ?? "";

  for (const [nom, v] of [
    ["date de début", debut],
    ["date intermédiaire", intermediaire],
    ["date de fin", fin],
  ] as const) {
    if (!ISO.test(v)) {
      return new Response(`La ${nom} est manquante ou mal formée (AAAA-MM-JJ).`, {
        status: 400,
      });
    }
  }

  // L'ordre des bornes est vérifié côté serveur : inversées, elles produiraient
  // des variations de signe opposé, silencieusement fausses.
  if (!(debut < fin)) {
    return new Response("La date de début doit précéder la date de fin.", {
      status: 400,
    });
  }
  if (intermediaire < debut || intermediaire > fin) {
    return new Response(
      "La date intermédiaire doit tomber entre le début et la fin de période.",
      { status: 400 },
    );
  }

  try {
    const rapport = getRapportComite({ debut, intermediaire, fin });
    const html = renderRapportComiteHtml(rapport);
    const pdf = await htmlToPdf(html, { landscape: true });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Comite_Investissement_${debut}_${fin}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[reporting/pdf]", err);
    return new Response(
      "Échec de la génération du rapport : " +
        (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
