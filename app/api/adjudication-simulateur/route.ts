/**
 * Calcul du repere de soumission aux adjudications.
 *
 * Cote serveur et non dans le navigateur : le calcul suppose l'historique
 * complet des adjudications — plus de trois mille lignes qu'il n'y a aucune
 * raison d'envoyer au client a chaque frappe.
 */
import { NextResponse } from "next/server";
import { loadUmoaEmissions } from "@/lib/dataLoader";
import {
  simulerAdjudication,
  type CibleAdjudication,
} from "@/lib/auctionSimulator";
import { fetchUserRole } from "@/lib/auth/userRole";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const role = await fetchUserRole();
  if (role !== "premium" && role !== "pro") {
    return NextResponse.json({ erreur: "Réservé aux abonnés." }, { status: 403 });
  }

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  }

  const c = corps as Partial<CibleAdjudication> & { couponPct?: number };
  const instrument = c.instrument === "OAT" ? "OAT" : "BAT";
  const maturiteMois = Number(c.maturiteMois);
  if (!c.pays || !Number.isFinite(maturiteMois) || maturiteMois <= 0) {
    return NextResponse.json({ erreur: "Paramètres invalides." }, { status: 400 });
  }

  const cible: CibleAdjudication = {
    pays: String(c.pays),
    instrument,
    // Borne haute a trente ans : au-dela, l'echeancier n'a plus de sens et la
    // boucle de flux tournerait pour rien.
    maturiteMois: Math.min(360, Math.round(maturiteMois)),
    couponRate:
      instrument === "OAT" && Number.isFinite(Number(c.couponPct))
        ? Number(c.couponPct) / 100
        : null,
    amortissement: c.amortissement === "Linéaire" ? "Linéaire" : "In Fine",
    differeAnnees: Number.isFinite(Number(c.differeAnnees))
      ? Math.max(0, Math.round(Number(c.differeAnnees)))
      : 0,
  };

  const aujourdhui = new Date().toISOString().slice(0, 10);
  return NextResponse.json(
    simulerAdjudication(loadUmoaEmissions(), cible, aujourdhui),
  );
}
