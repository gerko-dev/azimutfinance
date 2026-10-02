import { NextResponse } from "next/server";

import { lignesDuPdf } from "@/lib/releves/pdfLignes";

import { estNiveau1 } from "../../guard";
import { interpreterReleve } from "../../releves-parse";
import { RELEVE_ILLISIBLE, type ReleveBrut } from "../../releves-data";

// === Déposer les relevés depuis le navigateur ===
//
// POURQUOI UNE ROUTE ET NON UNE ACTION SERVEUR. Une action transporte au plus
// un mégaoctet de corps ; les relevés d'un arrêté en font quatre, et ils
// grossiront. Une route n'a pas cette borne.
//
// ELLE NE FAIT QUE LIRE. Elle rend ce que les PDF disent — numéro de compte,
// titulaire, solde — et rien de plus : le rattachement à une banque et à un
// fonds se fait ensuite, d'un seul coup, par `rattacherRelevesAction`. Le faire
// ici obligerait à reconstruire la grille de trésorerie à chaque lot, c'est-à-
// dire le point de tous les fonds, douze fois de suite.
//
// LE CHEMIN RELATIF PORTE LA BANQUE. Le navigateur le donne avec chaque
// fichier quand on choisit un DOSSIER : « 2026-10-01/BOA/BOA AM (79).pdf ».
// Sans lui, cinquante-trois PDF arriveraient sans rien qui dise de quelle
// banque ils viennent — c'est le dossier qui le dit, pas le relevé.

/** Au-delà, ce n'est plus un relevé : on refuse plutôt que de faire traîner. */
const TAILLE_MAX = 20 * 1024 * 1024;

export async function POST(requete: Request) {
  if (!(await estNiveau1())) {
    return NextResponse.json(
      { erreur: "Tu n'as pas accès au module de gestion de portefeuille." },
      { status: 403 },
    );
  }

  let formulaire: FormData;
  try {
    formulaire = await requete.formData();
  } catch {
    return NextResponse.json({ erreur: "Dépôt illisible." }, { status: 400 });
  }

  const fichiers = formulaire.getAll("fichiers").filter((f): f is File => f instanceof File);
  // Les chemins arrivent en parallèle des fichiers, dans le même ordre : un
  // File ne porte pas son `webkitRelativePath` une fois sérialisé.
  const chemins = formulaire.getAll("chemins").map(String);
  if (fichiers.length === 0) {
    return NextResponse.json({ erreur: "Aucun fichier reçu." }, { status: 400 });
  }

  const total = fichiers.reduce((s, f) => s + f.size, 0);
  if (total > TAILLE_MAX) {
    return NextResponse.json(
      { erreur: `Lot trop lourd (${Math.round(total / 1048576)} Mo). Dépose moins de relevés à la fois.` },
      { status: 413 },
    );
  }

  const lus: ReleveBrut[] = [];
  for (let i = 0; i < fichiers.length; i++) {
    const f = fichiers[i];
    const chemin = (chemins[i] || f.name).replace(/\\/g, "/");
    const bouts = chemin.split("/").filter(Boolean);
    // L'AVANT-DERNIER SEGMENT EST LA BANQUE : « …/2026-10-01/BOA/relevé.pdf ».
    // Un fichier déposé seul n'en a pas, et son dossier restera vide — il
    // ressortira « non rattaché », ce qui est exactement ce qu'il est.
    const dossierBanque = bouts.length >= 2 ? bouts[bouts.length - 2] : "";
    const fichier = bouts.slice(-2).join("/") || f.name;

    try {
      const octets = new Uint8Array(await f.arrayBuffer());
      lus.push({ ...interpreterReleve(await lignesDuPdf(octets)), fichier, dossierBanque });
    } catch (err) {
      lus.push({
        ...RELEVE_ILLISIBLE,
        fichier,
        dossierBanque,
        probleme: `PDF illisible : ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({ lus });
}
