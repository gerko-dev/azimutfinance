import { NextResponse } from "next/server";

import { estNiveau1 } from "../../guard";
import { loadMyFunds } from "../../data";
import { loadCustomSecurities } from "../../portfolio-data";
import { dateDuLot, lireFichierDuLot, type FichierImporte } from "../../import-groupe-data";

// === Déposer tout un arrêté depuis le navigateur ==========================
//
// POURQUOI UNE ROUTE ET NON UNE ACTION SERVEUR. Une action transporte au plus
// un mégaoctet de corps. Quinze inventaires et quinze états de VL en font
// moins aujourd'hui, mais un inventaire grossit avec le portefeuille, et un
// historique de valeur liquidative grossit tout seul. Une route n'a pas cette
// borne.
//
// ELLE NE FAIT QUE LIRE. Rien n'est écrit : elle rend ce que chaque fichier
// dit, à quel fonds elle l'a rattaché et ce qui cloche. L'enregistrement est
// un second geste, fonds par fonds, que l'écran déclenche après que le gérant
// a vu la liste.
//
// LE REFERENTIEL ET LA LISTE DES FONDS SE CHARGENT UNE FOIS, pour tout le lot.
// Les recharger par fichier aurait fait trente fois le même travail.

export const dynamic = "force-dynamic";

/** Au-delà, ce n'est plus un arrêté : on refuse plutôt que de faire traîner. */
const TAILLE_MAX = 40 * 1024 * 1024;

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
  if (fichiers.length === 0) {
    return NextResponse.json({ erreur: "Aucun fichier reçu." }, { status: 400 });
  }
  const poids = fichiers.reduce((s, f) => s + f.size, 0);
  if (poids > TAILLE_MAX) {
    return NextResponse.json(
      { erreur: `Dépôt trop lourd (${Math.round(poids / 1024 / 1024)} Mo).` },
      { status: 413 },
    );
  }

  const [fondsGeres, customs] = await Promise.all([loadMyFunds(), loadCustomSecurities()]);
  if (fondsGeres.length === 0) {
    return NextResponse.json(
      { erreur: "Aucun fonds géré : il n'y a aucun portefeuille où poser ces fichiers." },
      { status: 400 },
    );
  }
  const candidats = fondsGeres.map((f) => ({ cle: f.id, libelle: f.nom }));

  const lus: FichierImporte[] = [];
  for (const f of fichiers) {
    try {
      const octets = Buffer.from(await f.arrayBuffer());
      lus.push(await lireFichierDuLot(f.name, octets, candidats, customs));
    } catch (err) {
      lus.push({
        fichier: f.name,
        nature: null,
        fondsId: "",
        fondsNom: "",
        dateFichier: null,
        avertissements: [],
        probleme: `Fichier illisible : ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // UN MEME FONDS DEUX FOIS DANS LA MEME NATURE, c'est un doublon : deux
  // inventaires du même portefeuille s'écraseraient l'un l'autre, et le
  // dernier arrivé gagnerait sans qu'on sache lequel c'était.
  const vus = new Map<string, string>();
  for (const l of lus) {
    if (l.probleme || !l.fondsId || !l.nature) continue;
    const clef = `${l.nature}:${l.fondsId}`;
    const premier = vus.get(clef);
    if (premier) {
      l.probleme = `Même fonds et même nature que « ${premier} » : choisis lequel des deux garder.`;
    } else {
      vus.set(clef, l.fichier);
    }
  }

  lus.sort(
    (a, b) =>
      (a.nature ?? "z").localeCompare(b.nature ?? "z") ||
      a.fondsNom.localeCompare(b.fondsNom, "fr") ||
      a.fichier.localeCompare(b.fichier, "fr"),
  );

  return NextResponse.json({ fichiers: lus, dateProposee: dateDuLot(lus) });
}
