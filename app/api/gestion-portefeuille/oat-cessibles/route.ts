/**
 * Export des OAT cessibles d'un fonds, au format attendu par la contrepartie.
 *
 * GET /api/gestion-portefeuille/oat-cessibles?fund=<uuid>
 *
 * Cinq colonnes — Titre, Quantité, Facial, Échéance, Prix de cession —, les
 * quantités nettes des titres prêtés, pris en réméré et déjà engagés à la
 * vente, et le prix de cession des opérations à réaliser.
 *
 * La garde est explicite et NON déléguée au proxy : celui-ci ne protège que
 * /compte et /bienvenue, et laisse passer /api. Sans elle, un appel anonyme
 * obtiendrait le portefeuille obligataire d'un fonds.
 */
import { NextResponse } from "next/server";

import { getMyAdminLevel } from "@/lib/admin/auth";
import { loadFundById } from "@/app/gestion-portefeuille/data";
import { construireExportOat, nomFichierOat } from "@/app/gestion-portefeuille/oat-export";
import { buildOatExcel } from "@/lib/reports/oatExcel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const niveau = await getMyAdminLevel();
  if (niveau === null) {
    return NextResponse.json({ erreur: "Accès réservé." }, { status: 401 });
  }

  const fundId = new URL(req.url).searchParams.get("fund");
  if (!fundId) {
    return NextResponse.json({ erreur: "Paramètre `fund` manquant." }, { status: 400 });
  }

  const fonds = await loadFundById(fundId);
  if (!fonds) {
    return NextResponse.json({ erreur: "Fonds introuvable." }, { status: 404 });
  }

  try {
    const donnees = await construireExportOat(fundId, fonds.nom);
    const classeur = await buildOatExcel(donnees);
    const nom = nomFichierOat(fonds.nom, donnees.dateInventaire);

    return new NextResponse(new Uint8Array(classeur), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nom}"`,
        "Content-Length": String(classeur.byteLength),
        // Les quantités cessibles bougent à chaque ordre : rien à mettre en
        // cache.
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[oat-cessibles]", e);
    return NextResponse.json(
      { erreur: e instanceof Error ? e.message : "Export impossible." },
      { status: 500 },
    );
  }
}
