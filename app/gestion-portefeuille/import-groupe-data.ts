import "server-only";

// === Importer tout un arrêté d'un coup ====================================
//
// LE GESTE EST GROUPE, L'ECRAN NE L'ETAIT PAS. Le gérant reçoit quinze
// inventaires et quinze états de valeur liquidative le même jour, pour le même
// arrêté. Il les chargeait un par un : choisir le fonds, choisir le fichier,
// relire, enregistrer — quatre-vingt-dix gestes pour une seule livraison, et
// autant d'occasions de poser l'inventaire d'un fonds sur la ligne d'un autre.
//
// LE FICHIER DIT A QUI IL APPARTIENT, et c'est tout ce qu'il faut : « Inventaire
// du FCP AURORE SECURITE II au 3062026.xlsx » nomme son fonds et sa date. On ne
// demande donc plus au gérant de les redire.
//
// RIEN N'EST ECRIT ICI. Ce module lit, classe, rattache, et rend ce qu'il a
// compris — fichier par fichier, avec ce qui cloche. L'écran montre, le gérant
// vérifie, et l'enregistrement est un second geste, explicite. Quinze
// inventaires posés sans qu'on les ait vus passer ne sont pas une
// automatisation : c'est une erreur qui se découvre au trimestre suivant.

import { parseInventoryBuffer } from "./portfolio-parse";
import { parseNavBuffer } from "./nav-parse";
import { matchPositions, normName } from "./portfolio-match";
import { fondsDansLeTexte, type Candidat } from "./releves-rapprochement";
import type { CustomSecurity, ImportedPosition } from "./portfolio-types";
import type { NavPoint } from "./nav-types";

/** Ce qu'un fichier du lot s'est révélé être. */
export type NatureFichier = "inventaire" | "vl";

/** Un fichier du lot, lu et rattaché — ou écarté, avec sa raison. */
export type FichierImporte = {
  fichier: string;
  nature: NatureFichier | null;
  fondsId: string;
  fondsNom: string;
  /** Date lue dans le NOM du fichier, quand il en porte une. */
  dateFichier: string | null;
  /** Ce qui empêche d'importer ce fichier, ou null. */
  probleme: string | null;
  /** Ce que la lecture a dû supposer. À lire avant d'enregistrer. */
  avertissements: string[];

  // ── La charge, selon la nature ────────────────────────────────────────
  positions?: ImportedPosition[];
  totalValorisation?: number;
  /** Lignes rattachées / non rattachées, pour que l'écran le dise. */
  comptes?: { total: number; rattachees: number; nonRattachees: number };
  /**
   * LES TITRES QUE CET INVENTAIRE FERA NAITRE AU REFERENTIEL.
   *
   * Tout libellé d'inventaire absent du référentiel y entre à
   * l'enregistrement, sous son nom d'inventaire — c'est la règle du module, et
   * elle épargne au gérant de tout ressaisir. Mais elle se fait en silence :
   * on ne savait pas, AVANT de valider, ce qu'on s'apprêtait à créer. Quinze
   * inventaires peuvent ouvrir cent fiches sans qu'on l'ait vu venir.
   */
  aCreer?: { code: string; libelle: string; section: string }[];
  points?: NavPoint[];
  premiereDate?: string;
  derniereDate?: string;
};

export type LotImporte = {
  fichiers: FichierImporte[];
  /** La date que le lot propose, déduite des noms de fichier. */
  dateProposee: string | null;
};

/**
 * LA DATE ECRITE DANS UN NOM DE FICHIER.
 *
 * « au 3062026 » veut dire le 30 juin 2026, et c'est moins évident qu'il n'y
 * paraît : sept chiffres se lisent aussi 3 | 06 | 2026. On lit donc EN
 * PRENANT LE PLUS LONG D'ABORD — deux chiffres pour le jour, puis deux pour le
 * mois — et l'on revient en arrière quand le reste ne tombe pas juste. C'est
 * la lecture naturelle : personne n'écrit « 3062026 » en pensant au 3 juin.
 *
 * Une date ISO dans le nom — « 2026-06-30 » — est reconnue telle quelle.
 *
 * Rend null plutôt que de deviner : l'écran propose alors sa propre date, et
 * le gérant tranche.
 */
export function dateDuNomDeFichier(nom: string): string | null {
  const iso = /\b(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})\b/.exec(nom);
  if (iso) {
    const d = valide(Number(iso[3]), Number(iso[2]), Number(iso[1]));
    if (d) return d;
  }

  for (const bloc of nom.match(/\d{6,8}/g) ?? []) {
    for (const nJour of [2, 1]) {
      for (const nMois of [2, 1]) {
        if (nJour + nMois + 4 !== bloc.length) continue;
        const d = valide(
          Number(bloc.slice(0, nJour)),
          Number(bloc.slice(nJour, nJour + nMois)),
          Number(bloc.slice(nJour + nMois)),
        );
        if (d) return d;
      }
    }
  }
  return null;
}

function valide(jour: number, mois: number, annee: number): string | null {
  if (!(annee >= 2000 && annee <= 2100)) return null;
  if (!(mois >= 1 && mois <= 12)) return null;
  if (!(jour >= 1 && jour <= 31)) return null;
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  if (d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * CE QUE LE NOM LAISSE ATTENDRE — un inventaire ou un état de VL.
 *
 * Ce n'est qu'une PRESOMPTION : elle décide seulement par quel lecteur on
 * commence, et le fichier a toujours le dernier mot. Un état de VL nommé
 * « Inventaire » sera lu comme un état de VL, parce que le lecteur
 * d'inventaire n'y aura trouvé aucune ligne.
 */
function presomption(nom: string): NatureFichier {
  const n = nom.toLowerCase();
  if (/valeur|liquadative|liquidative|\bvl\b/.test(n)) return "vl";
  return "inventaire";
}

/**
 * Lit un fichier du lot et le rattache à son fonds.
 *
 * LES DEUX LECTEURS SONT ESSAYES, dans l'ordre que le nom suggère. C'est ce
 * qui rend le dépôt indifférent au rangement : un dossier mélangé passe aussi
 * bien que deux dossiers séparés, et une convention de nommage qui change ne
 * casse rien.
 */
export async function lireFichierDuLot(
  nom: string,
  octets: Buffer,
  fonds: Candidat[],
  customs: CustomSecurity[],
): Promise<FichierImporte> {
  const sansExtension = nom.replace(/\.[a-z0-9]+$/i, "");
  const rattachement = fondsDansLeTexte(sansExtension, fonds);
  const base: FichierImporte = {
    fichier: nom,
    nature: null,
    fondsId: rattachement.trouve ? rattachement.cle : "",
    fondsNom: rattachement.trouve
      ? (fonds.find((f) => f.cle === rattachement.cle)?.libelle ?? "")
      : "",
    dateFichier: dateDuNomDeFichier(sansExtension),
    probleme: null,
    avertissements: [],
  };

  if (!/\.(xlsx|xlsm)$/i.test(nom)) {
    return { ...base, probleme: "Seuls les fichiers Excel (.xlsx) sont lus." };
  }

  const ordre: NatureFichier[] =
    presomption(nom) === "vl" ? ["vl", "inventaire"] : ["inventaire", "vl"];

  for (const nature of ordre) {
    try {
      if (nature === "vl") {
        const points = await parseNavBuffer(octets);
        if (points.length === 0) continue;
        return {
          ...base,
          nature: "vl",
          points,
          premiereDate: points[0].date,
          derniereDate: points[points.length - 1].date,
          probleme: rattachement.trouve ? null : rattachement.raison,
        };
      }
      const lu = await parseInventoryBuffer(octets);
      if (lu.positions.length === 0) continue;
      const positions = matchPositions(lu.positions, customs, base.fondsId);
      const total = positions.reduce((s, p) => s + (p.valuation ?? 0), 0);
      const aCreer = titresAOuvrir(positions, customs);
      return {
        ...base,
        nature: "inventaire",
        positions,
        totalValorisation: total,
        comptes: {
          total: positions.length,
          rattachees: positions.filter(
            (p) => p.matchKind !== "unmatched" && p.matchKind !== "cash",
          ).length,
          nonRattachees: positions.filter((p) => p.matchKind === "unmatched").length,
        },
        aCreer,
        avertissements: lu.avertissements,
        probleme: rattachement.trouve ? null : rattachement.raison,
      };
    } catch {
      /* ce lecteur-là n'en veut pas : on essaie l'autre */
    }
  }

  return {
    ...base,
    probleme:
      "Ni inventaire ni état de valeur liquidative : aucun des deux lecteurs n'y a trouvé de ligne.",
  };
}

/**
 * Les lignes qui n'ont PAS encore de fiche au référentiel.
 *
 * LA REGLE EST CELLE DE L'ENREGISTREMENT, à la lettre, sans quoi l'aperçu
 * annoncerait autre chose que ce qui se passera : la clef est le CODE quand la
 * ligne en porte un, le NOM EXACT sinon ; le référentiel est indexé sous les
 * deux. Une ligne déjà rapprochée d'un titre du site compte quand même, si le
 * gérant n'en a pas encore la fiche — c'est bien une fiche qui va naître.
 */
function titresAOuvrir(
  positions: ImportedPosition[],
  customs: CustomSecurity[],
): { code: string; libelle: string; section: string }[] {
  const connus = new Set<string>();
  for (const c of customs) {
    const code = (c.code ?? "").trim().toLowerCase();
    if (code) connus.add(code);
    const nom = normName(c.name ?? "");
    if (nom) connus.add(nom);
  }

  const out: { code: string; libelle: string; section: string }[] = [];
  const vus = new Set<string>();
  for (const p of positions) {
    const clef = (p.rawCode ?? "").trim().toLowerCase() || normName(p.rawLabel ?? "");
    if (!clef || connus.has(clef) || vus.has(clef)) continue;
    vus.add(clef);
    out.push({
      code: (p.rawCode ?? "").trim(),
      libelle: (p.rawLabel || p.matchLabel || "").trim(),
      section: p.section,
    });
  }
  return out;
}

/** La date que le lot propose : celle que portent le plus de fichiers. */
export function dateDuLot(fichiers: FichierImporte[]): string | null {
  const compte = new Map<string, number>();
  for (const f of fichiers) {
    if (!f.dateFichier) continue;
    compte.set(f.dateFichier, (compte.get(f.dateFichier) ?? 0) + 1);
  }
  let meilleure: string | null = null;
  let max = 0;
  for (const [d, n] of compte) {
    if (n > max) {
      max = n;
      meilleure = d;
    }
  }
  return meilleure;
}
