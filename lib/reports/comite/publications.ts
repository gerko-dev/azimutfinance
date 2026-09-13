import "server-only";

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

// === Calendrier des publications officielles ===
//
// Source : data/calendrier_publications/*.csv, alimentes par
// scripts/scrape_richbourse_calendrier.py. Aucun loader TypeScript n'existait
// jusqu'ici — ces fichiers n'etaient lus par personne cote application.
//
// FORME DES FICHIERS : une ligne par societe, une COLONNE PAR ANNEE.
//   ticker;2010;2011;...;2026
//   NTLC;;;;...;30/04/2026
// La cellule porte la date de publication de l'exercice concerne, au format
// francais, ou reste vide si la societe n'a rien publie cette annee-la.
// Ce pivot par annee interdit un simple filtre de lignes : il faut aplatir.

const DIR = join(process.cwd(), "data", "calendrier_publications");

/** Nature de la publication, deduite du fichier qui la porte. */
export type TypePublication =
  | "annuelle"
  | "semestrielle"
  | "trimestrielle-t1"
  | "trimestrielle-t3"
  | "dividende";

const FICHIERS: { fichier: string; type: TypePublication }[] = [
  { fichier: "publications_annuelles.csv", type: "annuelle" },
  { fichier: "publications_s1.csv", type: "semestrielle" },
  { fichier: "publications_t1.csv", type: "trimestrielle-t1" },
  { fichier: "publications_t3.csv", type: "trimestrielle-t3" },
  { fichier: "publications_dividendes.csv", type: "dividende" },
];

export const LIBELLE_PUBLICATION: Record<TypePublication, string> = {
  annuelle: "États financiers annuels",
  semestrielle: "États financiers semestriels",
  "trimestrielle-t1": "Indicateurs T1",
  "trimestrielle-t3": "Indicateurs T3",
  dividende: "Mise en paiement du dividende",
};

export type Publication = {
  ticker: string;
  type: TypePublication;
  /** Date de publication, ISO. */
  date: string;
  /** Exercice concerne (l'en-tete de colonne). */
  exercice: string;
};

let _cache: Publication[] | null = null;

/** Date francaise JJ/MM/AAAA -> ISO. Renvoie "" si la cellule est vide ou
 *  illisible : une date incomplete ne doit pas devenir une fausse date. */
function versISO(cellule: string): string {
  const s = (cellule ?? "").trim();
  if (!s) return "";
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // Certaines cellules arrivent deja en ISO selon la passe de scraping.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

/** Aplatit les cinq fichiers pivotes en une liste de publications datees.
 *  Memoise au niveau module : les CSV sont lus une fois par process serveur,
 *  comme les autres loaders du portail. */
export function loadPublications(): Publication[] {
  if (_cache) return _cache;

  const out: Publication[] = [];
  for (const { fichier, type } of FICHIERS) {
    let brut: string;
    try {
      brut = readFileSync(join(DIR, fichier), "utf8").replace(/^﻿/, "");
    } catch {
      // Un fichier absent ne doit pas priver le rapport des quatre autres.
      continue;
    }
    const parsed = Papa.parse<Record<string, string>>(brut, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });
    for (const ligne of parsed.data) {
      const ticker = (ligne.ticker ?? "").trim().toUpperCase();
      if (!ticker) continue;
      for (const [colonne, valeur] of Object.entries(ligne)) {
        if (colonne === "ticker") continue;
        // Seules les colonnes-annees portent des dates.
        if (!/^\d{4}$/.test(colonne)) continue;
        const date = versISO(valeur);
        if (!date) continue;
        out.push({ ticker, type, date, exercice: colonne });
      }
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
  _cache = out;
  return out;
}

/** Publications tombees dans [debut, fin], bornes incluses. */
export function publicationsSurPeriode(
  debut: string,
  fin: string,
): Publication[] {
  return loadPublications().filter((p) => p.date >= debut && p.date <= fin);
}
