/**
 * Export des propositions d'achat et de vente au format du courtier.
 *
 * GET /api/gestion-portefeuille/propositions?fund=<uuid>[&tresorerie=<nombre>]
 *
 * Renvoie le classeur bati sur template_propositions.xlsx, en piece jointe.
 *
 * La garde est explicite et NON deleguee au proxy : celui-ci ne protege que
 * /compte et /bienvenue, et laisse passer /api. Sans elle, un simple appel
 * anonyme obtiendrait le portefeuille d'un fonds — les chargeurs Supabase
 * rendraient certes des listes vides faute de session, mais se reposer sur cet
 * effet de bord reviendrait a faire dependre la confidentialite d'un detail
 * d'implementation.
 */
import { NextResponse } from "next/server";

import { getMyAdminLevel } from "@/lib/admin/auth";
import { loadFundById } from "@/app/gestion-portefeuille/data";
import { construirePlanOperations } from "@/app/gestion-portefeuille/operations-data";
import {
  construireClasseurPropositions,
  nomFichierPropositions,
} from "@/app/gestion-portefeuille/propositions-export";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const niveau = await getMyAdminLevel();
  if (niveau === null) {
    return NextResponse.json({ erreur: "Accès réservé." }, { status: 401 });
  }

  const url = new URL(req.url);
  const fundId = url.searchParams.get("fund");
  if (!fundId) {
    return NextResponse.json(
      { erreur: "Paramètre `fund` manquant." },
      { status: 400 },
    );
  }
  const tresorerie = Number(url.searchParams.get("tresorerie") ?? 0) || 0;

  const fonds = await loadFundById(fundId);
  if (!fonds) {
    return NextResponse.json({ erreur: "Fonds introuvable." }, { status: 404 });
  }

  try {
    const plan = await construirePlanOperations(fundId, tresorerie);
    const classeur = await construireClasseurPropositions(plan);
    const nom = nomFichierPropositions(fonds.nom, plan.dateInventaire);

    return new NextResponse(new Uint8Array(classeur), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nom}"`,
        "Content-Length": String(classeur.byteLength),
        // Un plan se recalcule a chaque inventaire : rien a mettre en cache.
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        erreur:
          e instanceof Error ? e.message : "Export impossible : erreur inattendue.",
      },
      { status: 500 },
    );
  }
}
