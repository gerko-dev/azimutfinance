import "server-only";

import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

import { NextResponse } from "next/server";

// =========================================================================
// GET /api/cron/publier-referentiel-aurore
// =========================================================================
//
// POURQUOI LE PORTAIL PUBLIE POUR AURORE.
//
// Aurore est un logiciel installé sur des postes. Il lui faut la cote, les
// adjudications et les historiques — les mêmes données que ce site, qui en est
// la source. Elles étaient jusqu'ici recopiées à la main : le 7 novembre 2026,
// un poste travaillait encore sur la cote du 30 octobre, et l'application
// répondait « à jour » parce qu'elle avait bien la dernière version PUBLIÉE.
// Personne n'avait publié depuis une semaine.
//
// CETTE TÂCHE SUPPRIME LE GESTE MANUEL. Les rafraîchissements de données de ce
// dépôt sont des commits qui redéploient le site ; la tâche qui suit dépose le
// référentiel là où les postes le lisent. Ils suivent donc la production sans
// que personne n'ait à y penser.
//
// ELLE REJOINT L'AIGUILLEUR `/api/cron/[job]` : aucune fonction serverless de
// plus, seulement les fichiers de données tracés sur celle-ci.
//
// LES POSTES NE LISENT PAS CE SITE. Ils lisent l'espace de fichiers, qui reste
// debout si le portail tombe — et une panne du portail n'éteint pas les postes
// de gestion d'une société de gestion.
//
// Auth : `Authorization: Bearer <CRON_SECRET>`, comme les autres tâches.

const DATA_DIR = join(process.cwd(), "data");

/**
 * L'espace de fichiers visé.
 *
 * CONFIGURABLE POUR POUVOIR ÊTRE ESSAYÉ. Publier est une écriture qui remplace
 * ce que lisent tous les postes : l'éprouver sur la vraie destination
 * reviendrait à leur livrer ce qu'on est en train de tester. Un seau d'essai
 * laisse vérifier la tâche de bout en bout sans toucher à la production.
 */
const SEAU = process.env.AURORE_BUCKET?.trim() || "referentiel";

/**
 * Ce qu'Aurore lit, et rien d'autre.
 *
 * LISTE EXPLICITE ET NON « tout le dossier » : `data/` pèse 158 Mo ici, dont
 * 97 pour le seul `macro.csv`. Aurore n'en ouvre qu'une quinzaine. Publier le
 * reste coûterait du transfert à chaque poste pour des séries qu'aucun écran
 * n'affiche.
 *
 * Elle doit rester d'accord avec `scripts/sync-referentiel.mjs` du dépôt
 * Aurore : les deux décrivent le même référentiel.
 */
const FICHIERS = [
  "obligations-cotees.csv",
  "obligations-cotees-prix.csv",
  "obligations-cotees-amortissements.csv",
  "obligations-cotees-boc-statut.csv",
  "obligations-cotees-vn-boc.csv",
  "obligations-cotees-boc-synthese.json",
  "umoa-emissions-realisees.csv",
  "umoa-emissions-planifiees.csv",
  "umoa-emissions-a-venir.csv",
  "umoa-courbes-taux.csv",
  "titres.csv",
  "dividendes-boc.csv",
  "DB_Titres.csv",
  "DB_Postes.csv",
  "DB_Valeurs.csv",
  "fcp.csv",
  "fcp/aumfcp.csv",
  "fcp/risque.csv",
  "fcp/vl-historique.csv",
  "fcp/fractionnements.csv",
  "marche-monetaire/Bul_stat.pdf",
  "calendrier_publications/publications_annuelles.csv",
  "calendrier_publications/publications_s1.csv",
  "calendrier_publications/publications_t1.csv",
  "calendrier_publications/publications_t3.csv",
  "calendrier_publications/publications_dividendes.csv",
];

/** Un fichier par titre : les lister à la main, c'est oublier le prochain. */
const DOSSIERS = ["historique_sika", "historique_sika_indices"];

/** macro.csv fait 97 Mo pour quinze feuilles ; Aurore n'en ouvre qu'une. */
const MACRO = { fichier: "macro.csv", feuille: "Inflation" } as const;

const EXTENSIONS_IGNOREES = new Set([".rar", ".zip", ".7z"]);

type Entree = { chemin: string; taille: number; empreinte: string };

/** 32 caractères : on distingue deux versions d'un fichier de cote, on ne se
 *  défend pas contre une collision fabriquée. */
const empreinte = (b: Buffer) =>
  createHash("sha256").update(b).digest("hex").slice(0, 32);

/**
 * Jusqu'à quelle date le référentiel porte-t-il des cours ?
 *
 * C'est la question du gérant — « de quand datent les cours que je valorise ? »
 * — et non « quand ce fichier a-t-il été fabriqué ? ». Deux dates, parce que
 * les actions et la cote obligataire ne sont pas alimentées au même rythme.
 */
function datesDeCote(): {
  cote_actions: string | null;
  cote_obligations: string | null;
  cote_au: string | null;
} {
  const derniere = (chemin: string, colonne: string): string | null => {
    try {
      const lignes = readFileSync(join(DATA_DIR, chemin), "utf-8").split(/\r?\n/);
      const i = lignes[0].replace(/^﻿/, "").split(";").indexOf(colonne);
      if (i < 0) return null;
      let max: string | null = null;
      for (const l of lignes.slice(1)) {
        const v = l.split(";")[i];
        if (/^\d{4}-\d{2}-\d{2}$/.test(v) && (max === null || v > max)) max = v;
      }
      return max;
    } catch {
      return null;
    }
  };
  // UN SEUL TITRE POUR LES ACTIONS : le plus échangé de la cote, qui cote tous
  // les jours ouvrés. Lire les quarante-huit fichiers coûterait une seconde,
  // et un titre suspendu donnerait une date fausse.
  const actions = derniere(join("historique_sika", "SNTS.sn.csv"), "date_iso");
  const obligations = derniere("obligations-cotees-prix.csv", "date");
  const connues = [actions, obligations].filter(Boolean) as string[];
  return {
    cote_actions: actions,
    cote_obligations: obligations,
    // LA PLUS ANCIENNE : c'est la date jusqu'à laquelle le référentiel est
    // COMPLET, donc la seule qu'on puisse annoncer sans surestimer.
    cote_au: connues.length ? connues.sort()[0] : null,
  };
}

/** Rassemble ce qui doit partir, contenu compris. */
function rassembler(): Map<string, Buffer> {
  const out = new Map<string, Buffer>();

  for (const rel of FICHIERS) {
    const p = join(DATA_DIR, rel);
    if (existsSync(p)) out.set(rel, readFileSync(p));
  }

  for (const dossier of DOSSIERS) {
    const d = join(DATA_DIR, dossier);
    if (!existsSync(d)) continue;
    for (const nom of readdirSync(d)) {
      const point = nom.lastIndexOf(".");
      if (point >= 0 && EXTENSIONS_IGNOREES.has(nom.slice(point).toLowerCase())) continue;
      const p = join(d, nom);
      try {
        out.set(`${dossier}/${nom}`, readFileSync(p));
      } catch {
        // Un sous-dossier, un lien : ce n'est pas un fichier de cote.
      }
    }
  }

  // La seule feuille d'inflation. LATIN-1 DE BOUT EN BOUT : le fichier source
  // l'est, et un aller-retour par UTF-8 changerait les accents, donc
  // l'empreinte, donc ferait retélécharger 4 Mo à chaque poste pour rien.
  const macro = join(DATA_DIR, MACRO.fichier);
  if (existsSync(macro)) {
    const lignes = readFileSync(macro).toString("latin1").split(/\r?\n/);
    const gardees = lignes.slice(1).filter((l) => l.split(";")[1] === MACRO.feuille);
    out.set(
      MACRO.fichier,
      Buffer.from([lignes[0], ...gardees].join("\r\n") + "\r\n", "latin1"),
    );
  }

  return out;
}

const TYPES: Record<string, string> = {
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
};

export async function publierReferentielAurore(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré sur le serveur." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const base = (process.env.AURORE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const clef = process.env.AURORE_SERVICE_KEY ?? "";
  if (!base || !clef) {
    // 503 ET NON 500 : rien n'est cassé, la destination n'est pas configurée.
    // Le diagnostic a de la valeur — c'est l'oubli le plus probable.
    return NextResponse.json(
      { error: "AURORE_SUPABASE_URL ou AURORE_SERVICE_KEY absent." },
      { status: 503 },
    );
  }

  const urlObjet = (chemin: string) =>
    `${base}/storage/v1/object/${SEAU}/${chemin.split("/").map(encodeURIComponent).join("/")}`;
  const urlPublique = (chemin: string) =>
    `${base}/storage/v1/object/public/${SEAU}/${chemin.split("/").map(encodeURIComponent).join("/")}`;
  const entetes = (extra: Record<string, string> = {}) => ({
    apikey: clef,
    Authorization: `Bearer ${clef}`,
    ...extra,
  });

  const contenus = rassembler();
  if (contenus.size === 0) {
    return NextResponse.json(
      { ok: false, error: "Aucun fichier de référentiel trouvé dans data/." },
      { status: 500 },
    );
  }

  const fichiers: Entree[] = [...contenus]
    .map(([chemin, buf]) => ({ chemin, taille: buf.length, empreinte: empreinte(buf) }))
    .sort((a, b) => a.chemin.localeCompare(b.chemin));

  // ── Ce qui est déjà en ligne ──────────────────────────────────────────
  let distant: { fichiers?: Entree[] } = {};
  try {
    const r = await fetch(`${urlPublique("manifeste.json")}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (r.ok) distant = await r.json();
  } catch {
    // Premier dépôt, ou espace de fichiers inaccessible : on envoie tout.
  }
  const dejaLa = new Map((distant.fichiers ?? []).map((f) => [f.chemin, f.empreinte]));

  const aEnvoyer = fichiers.filter((f) => dejaLa.get(f.chemin) !== f.empreinte);
  const retires = (distant.fichiers ?? []).filter(
    (f) => !contenus.has(f.chemin),
  );

  if (aEnvoyer.length === 0 && retires.length === 0) {
    return NextResponse.json({
      ok: true,
      etat: "inchange",
      fichiers: fichiers.length,
      ...datesDeCote(),
    });
  }

  // LE SEAU SE CREE S'IL N'EXISTE PAS, et l'appel est idempotent : un seau
  // deja la rend 409, ce qui convient. Sans cela, la toute premiere
  // publication vers un projet neuf echoue sur « Bucket not found » — un
  // message qui ne dit pas a l'administrateur ce qu'il doit faire.
  {
    const r = await fetch(`${base}/storage/v1/bucket`, {
      method: "POST",
      headers: entetes({ "Content-Type": "application/json" }),
      // LECTURE PUBLIQUE : la cote de la BRVM et les adjudications du guichet
      // sont des donnees publiques, et un jeton pose sur cinquante postes
      // n'en serait plus un.
      body: JSON.stringify({ id: SEAU, name: SEAU, public: true }),
    });
    if (!r.ok && r.status !== 409) {
      const texte = (await r.text()).slice(0, 180);
      // On n'abandonne pas : le seau existe peut-etre et c'est le droit de
      // creation qui manque. L'envoi dira la verite juste apres.
      console.warn(`[referentiel-aurore] creation du seau : ${r.status} ${texte}`);
    }
  }

  const envoyer = async (chemin: string, contenu: Buffer) => {
    const ext = chemin.slice(chemin.lastIndexOf(".") + 1).toLowerCase();
    const r = await fetch(urlObjet(chemin), {
      method: "POST",
      headers: entetes({
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        // Sans cela, un fichier déjà présent fait échouer l'envoi avec 409 :
        // c'est une mise à jour, pas une création.
        "x-upsert": "true",
        "cache-control": "max-age=60",
      }),
      body: new Uint8Array(contenu),
    });
    if (!r.ok) throw new Error(`${chemin} : ${r.status} ${(await r.text()).slice(0, 180)}`);
  };

  try {
    for (const f of aEnvoyer) await envoyer(f.chemin, contenus.get(f.chemin)!);
    for (const f of retires) {
      await fetch(urlObjet(f.chemin), { method: "DELETE", headers: entetes() });
    }

    // LE MANIFESTE EN DERNIER, ET C'EST TOUT LE POINT : il fait foi. Tant
    // qu'il n'est pas remplacé, les postes travaillent sur la version
    // précédente, entière. Le publier d'abord exposerait un référentiel à
    // moitié téléversé.
    const manifeste = {
      genere_le: new Date().toISOString(),
      ...datesDeCote(),
      poids: fichiers.reduce((s, f) => s + f.taille, 0),
      fichiers,
    };
    await envoyer("manifeste.json", Buffer.from(JSON.stringify(manifeste, null, 2)));

    return NextResponse.json({
      ok: true,
      etat: "publie",
      envoyes: aEnvoyer.length,
      retires: retires.length,
      fichiers: fichiers.length,
      poids: manifeste.poids,
      cote_au: manifeste.cote_au,
      cote_actions: manifeste.cote_actions,
      cote_obligations: manifeste.cote_obligations,
    });
  } catch (e) {
    // Le manifeste n'a pas été remplacé : les postes restent sur la version
    // précédente, complète. L'échec ne laisse donc rien à moitié fait.
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 502 },
    );
  }
}
