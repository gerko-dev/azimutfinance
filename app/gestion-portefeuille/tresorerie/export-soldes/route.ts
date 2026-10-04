import { buildSoldesExcel } from "@/lib/reports/soldesExcel";

import { estNiveau1 } from "../../guard";
import { loadMyFunds } from "../../data";
import { construireExportSoldes, structureDuClasseur } from "../../soldes-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Le classeur de trésorerie pèse quatre mégaoctets ; on laisse de la marge. */
const TAILLE_MAX = 30 * 1024 * 1024;

/**
 * POST /gestion-portefeuille/tresorerie/export-soldes
 *
 * Reçoit le CLASSEUR DE GESTION DE TRESORERIE et rend un fichier calqué sur sa
 * feuille « Point de trésorerie », soldes remplis.
 *
 * POURQUOI LE CLASSEUR DOIT ÊTRE DÉPOSÉ. L'ordre des colonnes de chaque fonds
 * n'obéit à aucune règle — c'est l'histoire du portefeuille — et le site ne
 * peut pas le deviner. Exporter dans notre ordre obligerait à réaligner
 * colonne par colonne avant de coller, c'est-à-dire à refaire le travail qu'on
 * veut supprimer, avec en prime le risque de poser le solde d'une banque sur
 * une autre.
 *
 * LE CLASSEUR N'EST NI ÉCRIT NI CONSERVÉ : il est lu en mémoire pour sa
 * structure, et c'est tout.
 */
export async function POST(requete: Request) {
  if (!(await estNiveau1())) {
    return new Response("Tu n'as pas accès au module de gestion de portefeuille.", {
      status: 403,
    });
  }

  let formulaire: FormData;
  try {
    formulaire = await requete.formData();
  } catch {
    return new Response("Dépôt illisible.", { status: 400 });
  }

  const fichier = formulaire.get("classeur");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return new Response("Aucun classeur reçu.", { status: 400 });
  }
  if (fichier.size > TAILLE_MAX) {
    return new Response(
      `Classeur trop lourd (${Math.round(fichier.size / 1024 / 1024)} Mo).`,
      { status: 413 },
    );
  }
  if (!/\.(xlsm|xlsx)$/i.test(fichier.name)) {
    return new Response("Dépose le classeur Excel (.xlsm ou .xlsx).", { status: 400 });
  }

  const demande = String(formulaire.get("arrete") ?? "");
  const dateArrete = EST_DATE.test(demande) ? demande : new Date().toISOString().slice(0, 10);

  const fonds = await loadMyFunds();
  if (fonds.length === 0) return new Response("Aucun fonds géré.", { status: 404 });

  try {
    const octets = Buffer.from(await fichier.arrayBuffer());
    const blocs = await structureDuClasseur(octets);
    const donnees = await construireExportSoldes(fonds, blocs, dateArrete);
    const buf = await buildSoldesExcel(donnees);
    const nom = `soldes-point-tresorerie-${dateArrete}.xlsx`;

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nom}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[gestion-portefeuille/tresorerie/export-soldes]", err);
    return new Response(
      "Échec de la génération : " + (err instanceof Error ? err.message : "erreur inconnue"),
      { status: 500 },
    );
  }
}
