import { NextResponse } from "next/server";

import { obligationsBrvm } from "@/lib/brvm/endpoints/bonds";
import { indicesBrvm } from "@/lib/brvm/endpoints/indices";
import { actionsBrvm } from "@/lib/brvm/endpoints/quotes";

export const dynamic = "force-dynamic";

/**
 * GET /api/brvm/<dataset> — snapshots BRVM en direct.
 *
 *   quotes   actions        ?code=SNTS     un seul titre
 *   bonds    obligations    ?code=EOM.O10  un seul titre
 *   indices  indices        ?refresh=1     force un refetch (contourne le cache)
 *                           ?debug=1       ajoute des statistiques
 *
 * Ces trois endpoints avaient chacun leur route — /api/brvm-quotes,
 * /api/brvm-bonds, /api/brvm-indices — donc chacun sa fonction serverless.
 * Aucun code du site ne les appelle : ce sont des sondes de diagnostic, tirées
 * à la main quand un scraping se comporte mal. Trois fonctions du budget Hobby
 * pour ça, c'était cher payé.
 *
 * CE REGROUPEMENT CHANGE LES URL — /api/brvm-quotes devient /api/brvm/quotes.
 * C'est le seul des trois regroupements qui en change, et il ne casse aucun
 * appelant : la recherche n'en a trouvé aucun hors outillage de développement.
 */
const JEUX: Record<string, (req: Request) => Promise<Response>> = {
  quotes: actionsBrvm,
  bonds: obligationsBrvm,
  indices: indicesBrvm,
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ dataset: string }> },
) {
  const { dataset } = await params;
  const jeu = JEUX[dataset];
  if (!jeu) {
    return NextResponse.json(
      {
        error: `Jeu de données inconnu : « ${dataset} ».`,
        disponibles: Object.keys(JEUX),
      },
      { status: 404 },
    );
  }
  return jeu(req);
}
