// === EXPORT DES SERIES BCEAO ===
//
// Deux jeux tres differents cohabitent sur /marche-monetaire :
//
//   « bulletin »  les 500 observations du bulletin mensuel, deja envoyees au
//                 navigateur pour alimenter le studio. L'apercu s'y fait sans
//                 aller-retour ; seul le telechargement passe par ici, pour que
//                 le controle d'abonnement se fasse cote SERVEUR.
//
//   « macro »     les 719 000 observations de data/macro.csv, seize feuilles de
//                 1960 a 2026. Impossible a envoyer au navigateur : elles ne
//                 quittent le serveur que filtrees, et par ce point d'entree.
//
// Le telechargement est reserve aux abonnes Premium. La verification est faite
// ici et non dans le composant : un bouton grise n'est pas un controle d'acces.

import { NextResponse } from "next/server";

import { fetchUserRole } from "@/lib/auth/userRole";
import { loadMacroRaw } from "@/lib/macroLoader";
import { COUNTRY_BY_CODE } from "@/lib/macroTypes";
import {
  preloadTauxData,
  loadTauxRaw,
  getSourceLabel,
} from "@/lib/tauxLoader";

export const dynamic = "force-dynamic";

/** Plafond de lignes d'un apercu. Au-dela, personne ne fait defiler. */
const MAX_APERCU = 300;

const UNITES: Record<string, string> = {
  pct: "%",
  Mds_FCFA: "Mds FCFA",
  M_FCFA: "M FCFA",
  rate: "",
  x: "",
};

/** Neutralise le separateur dans une cellule : un point-virgule egare decale
 *  toutes les colonnes suivantes du fichier. */
function cellule(v: string): string {
  return (v ?? "").replace(/;/g, ",").replace(/[\r\n]+/g, " ").trim();
}

function versCsv(entete: string[], lignes: string[][]): string {
  // BOM UTF-8 : sans lui, Excel affiche « Côte d'Ivoire » en mojibake.
  return (
    "﻿" +
    [entete.join(";"), ...lignes.map((l) => l.join(";"))].join("\n") +
    "\n"
  );
}

function reponseCsv(nom: string, csv: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? "macro";
  const format = url.searchParams.get("format") ?? "apercu";
  const feuille = url.searchParams.get("feuille") ?? "";
  const indicateur = url.searchParams.get("indicateur") ?? "";
  const pays = url.searchParams.get("pays") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  if (format === "csv") {
    const role = await fetchUserRole();
    if (role !== "premium" && role !== "pro") {
      return NextResponse.json(
        {
          erreur: "premium_requis",
          message:
            "Le téléchargement des séries BCEAO est réservé aux abonnés Premium.",
        },
        { status: 403 },
      );
    }
  }

  // ------------------------------------------------------------------ macro
  if (source === "macro") {
    const rows = loadMacroRaw().filter(
      (r) =>
        (!feuille || r.feuille === feuille) &&
        (!pays || r.country === pays) &&
        (!indicateur || r.indicator === indicateur) &&
        (!q || r.indicator.toLowerCase().includes(q)),
    );

    if (format === "csv") {
      if (!feuille) {
        return NextResponse.json(
          {
            erreur: "feuille_requise",
            message:
              "Choisissez une feuille : la base entière pèse 719 000 lignes.",
          },
          { status: 400 },
        );
      }
      const lignes = rows
        .slice()
        .sort(
          (a, b) =>
            a.indicator.localeCompare(b.indicator) ||
            a.country.localeCompare(b.country) ||
            a.sortKey - b.sortKey,
        )
        .map((r) => [
          cellule(r.feuille),
          cellule(r.indicator),
          cellule(COUNTRY_BY_CODE[r.country]?.shortName ?? r.country),
          cellule(r.iso),
          // Point decimal : le fichier est une donnee, pas un affichage.
          String(r.value),
          r.periodicity === "monthly" ? "mensuelle" : "annuelle",
        ]);
      const suffixe = feuille.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
      return reponseCsv(
        `azimut_bceao_${suffixe}.csv`,
        versCsv(
          ["Feuille", "Indicateur", "Pays", "Periode", "Valeur", "Periodicite"],
          lignes,
        ),
      );
    }

    // Apercu : le plus recent en premier, c'est ce qu'on vient verifier.
    const apercu = rows
      .slice()
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, MAX_APERCU)
      .map((r) => ({
        feuille: r.feuille,
        indicateur: r.indicator,
        pays: COUNTRY_BY_CODE[r.country]?.shortName ?? r.country,
        periode: r.label,
        valeur: r.value,
        periodicite: r.periodicity,
      }));
    return NextResponse.json({ total: rows.length, apercu });
  }

  // --------------------------------------------------------------- bulletin
  await preloadTauxData();
  const rows = loadTauxRaw().filter(
    (r) =>
      (!feuille || r.section === feuille) &&
      (!pays || r.country === pays) &&
      (!q ||
        r.indicator.toLowerCase().includes(q) ||
        r.country.toLowerCase().includes(q)),
  );

  if (format !== "csv") {
    return NextResponse.json({ total: rows.length, apercu: [] });
  }

  const lignes = rows
    .slice()
    .sort(
      (a, b) =>
        a.section.localeCompare(b.section) ||
        a.indicator.localeCompare(b.indicator) ||
        a.country.localeCompare(b.country) ||
        a.period.sortKey - b.period.sortKey,
    )
    .map((r) => [
      cellule(r.section),
      cellule(r.indicator),
      cellule(r.country),
      cellule(r.period.iso),
      String(r.value),
      cellule(UNITES[r.unit] ?? r.unit),
    ]);

  const suffixe = feuille
    ? feuille.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
    : "toutes-series";
  return reponseCsv(
    `azimut_bulletin-bceao_${suffixe}.csv`,
    versCsv(
      ["Section", "Indicateur", "Pays", "Periode", "Valeur", "Unite"],
      lignes,
    ) +
      // Le libelle de source appartient au fichier : sans lui, le CSV circule
      // sans qu'on sache de quel bulletin il sort.
      `# Source : ${getSourceLabel()}\n`,
  );
}
