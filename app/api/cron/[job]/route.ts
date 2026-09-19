import { NextResponse } from "next/server";

import { evaluerAlertes } from "@/lib/cron/evaluate-alerts";
import { evaluerOrdresSimulateur } from "@/lib/cron/evaluate-simulator-orders";
import { relancerAbonnementsExpirants } from "@/lib/cron/premium-expiry-reminder";
import { snapshotPresence } from "@/lib/cron/presence-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/<job>
 *
 * AIGUILLEUR UNIQUE DES TACHES PLANIFIEES.
 *
 * Les quatre taches avaient chacune sa route. Chaque route handler compte dans
 * le plafond de fonctions serverless du plan Hobby — douze — et le depot en
 * comptait vingt. Un segment dynamique les ramene a UNE fonction sans changer
 * une seule URL : /api/cron/evaluate-alerts repond exactement comme avant, et
 * vercel.json n'a pas a bouger.
 *
 * Les traitements eux-memes n'ont pas ete touches : ils vivent maintenant dans
 * lib/cron/, un module par tache, avec leur signature d'origine (req) => Response.
 *
 * Auth : inchangee, chaque tache verifie elle-meme `Authorization: Bearer
 * <CRON_SECRET>`. On ne centralise pas ce controle ici — deux d'entre elles
 * renvoient un 503 explicite quand le secret n'est pas configure, et ce
 * diagnostic a de la valeur.
 */
const TACHES: Record<string, (req: Request) => Promise<Response>> = {
  "evaluate-alerts": evaluerAlertes,
  "evaluate-simulator-orders": evaluerOrdresSimulateur,
  "premium-expiry-reminder": relancerAbonnementsExpirants,
  "presence-snapshot": snapshotPresence,
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const { job } = await params;
  const tache = TACHES[job];
  if (!tache) {
    // 404 et non 400 : pour l'appelant, une tache inconnue est une URL qui
    // n'existe pas — c'est ce que repondait l'ancien routage.
    return NextResponse.json(
      { error: `Tâche planifiée inconnue : « ${job} ».` },
      { status: 404 },
    );
  }
  return tache(req);
}
