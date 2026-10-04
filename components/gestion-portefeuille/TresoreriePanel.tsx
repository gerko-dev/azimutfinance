"use client";

import { useState } from "react";

import {
  FONDS_GLOBAL,
  intitule,
  LIGNES_POINT_TRESORERIE,
  type DefinitionLigne,
  type LigneTresorerie,
  type PointTresorerie,
} from "@/app/gestion-portefeuille/tresorerie-types";
import type { DetailMontant } from "@/app/gestion-portefeuille/tresorerie-apports";
import type { GrilleSoldes } from "@/app/gestion-portefeuille/tresorerie-grille";
import SaisieSoldesDialog from "./SaisieSoldesDialog";
import FluxSaisisDialog from "./FluxSaisisDialog";
import SpotsDialog from "./SpotsDialog";
import NivellementsDialog from "./NivellementsDialog";

/**
 * Point de trésorerie — même disposition que la feuille du classeur, mais
 * alimenté par les données du site : banques en COLONNES, postes en LIGNES,
 * Total à droite.
 *
 * La colonne des libellés est figée à gauche : un fonds peut servir une
 * vingtaine de comptes, et sans cela on perd de vue le poste dès qu'on fait
 * défiler.
 *
 * Les postes qui n'ont pas encore de source sont MARQUÉS. Ils valent zéro, et
 * un zéro muet se lirait comme une absence de flux au lieu d'une absence de
 * donnée — c'est la confusion qu'il faut éviter sur un tableau de trésorerie.
 */

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const montant = (v: number | null) => (v === null ? "—" : fmt0.format(Math.round(v)));
const pourcent = (v: number | null) => (v === null ? "—" : fmt2.format(v * 100) + " %");

function classeLigne(l: { nature: LigneTresorerie["nature"]; source: LigneTresorerie["source"] }) {
  if (l.nature === "solde") return "bg-blue-50/70 font-semibold text-slate-900";
  if (l.nature === "total") return "bg-slate-50 font-medium text-slate-800";
  if (l.nature === "pourcentage") return "text-slate-500 italic";
  return l.source === "a_alimenter" ? "text-slate-400" : "text-slate-700";
}

/**
 * Largeurs du tableau, en pixels.
 *
 * En pixels et non en `rem` : ces nombres servent aussi à CALCULER la largeur
 * de la table, et un calcul mêlant unités relatives et absolues serait faux
 * dès que la taille de police racine change.
 *
 * 120 px pour une colonne d'établissement : le plus long montant des
 * inventaires, « -220 180 967 », occupe environ 90 px en tabulaire de 11 px,
 * padding compris. Le reste est la marge.
 */
const LARGEUR_POSTE = 256;
const LARGEUR_COLONNE = 120;
const LARGEUR_TOTAL = 128;

/**
 * Hauteur de la ligne de REGROUPEMENT de l'en-tête, en pixels.
 *
 * Elle est imposée parce que la seconde ligne d'en-tête se colle juste en
 * dessous : son `top` doit valoir exactement la hauteur de la première, et une
 * hauteur laissée au contenu aurait fait apparaître un liseré ou un
 * chevauchement selon la police. 16 px d'interligne + 2 × 4 px de padding.
 */
const HAUTEUR_GROUPE = 24;

/** Hauteur maximale du tableau : au-delà, il défile sous son en-tête figé. */
const HAUTEUR_TABLEAU = "calc(100vh - 20rem)";

/**
 * L'infobulle d'une cellule de montant : CE QUI LA COMPOSE, rien d'autre.
 *
 * POURQUOI ELLE EXISTE. Le tableau est un tableau de sommes. « Deux milliards
 * en achats MTP » ne dit ni quel titre, ni quand, ni en combien de fois, et il
 * fallait ouvrir l'écran des opérations pour refaire l'addition à la main.
 *
 * ELLE N'EXPLIQUE PAS LA LIGNE. Ce que porte un poste et sur quel solde il
 * pèse se lisent au survol de son INTITULÉ, dans la première colonne ; le
 * montant, lui, ne répond qu'à une question — de quoi est-il fait.
 *
 * ELLE EST ANCRÉE À LA CELLULE, en position `fixed`, et non rendue dedans :
 * le tableau défile dans les deux sens sous un en-tête figé, et une bulle
 * posée dans une cellule serait coupée par le conteneur de défilement dès
 * qu'elle dépasserait d'un bord.
 */
type Bulle = {
  x: number;
  y: number;
  /** Vrai : la bulle s'ouvre SOUS la cellule ; faux : au-dessus. */
  dessous: boolean;
  titre: string;
  colonne: string;
  montant: string;
  lignes: DetailMontant[];
};

/** Largeur de la bulle, en pixels — sert aussi à la ramener dans la fenêtre. */
const LARGEUR_BULLE = 420;

/** Où poser la bulle : sous la cellule, ou au-dessus si le bas manque. */
function ancrer(cible: HTMLElement): Pick<Bulle, "x" | "y" | "dessous"> {
  const r = cible.getBoundingClientRect();
  // Sous la cellule par défaut ; au-dessus dans la moitié basse de l'écran,
  // où une bulle qui descend sortirait de la fenêtre.
  const dessous = r.bottom < window.innerHeight * 0.55;
  return {
    // Alignée à droite de la cellule — les montants sont cadrés à droite —
    // puis ramenée dans la fenêtre.
    x: Math.min(Math.max(8, r.right - LARGEUR_BULLE), window.innerWidth - LARGEUR_BULLE - 8),
    y: dessous ? r.bottom + 6 : window.innerHeight - r.top + 6,
    dessous,
  };
}

/** Les définitions par clef — les encarts de tête y prennent les deux soldes. */
const DEFS = new Map(LIGNES_POINT_TRESORERIE.map((d) => [d.libelle, d]));

/**
 * Les pièces d'une cellule.
 *
 * `banque` vaut null dans la colonne Total : on prend alors tous les comptes.
 *
 * UNE LIGNE CALCULÉE PREND LE DÉTAIL DE SES COMPOSANTES, avec leur signe —
 * les flux théoriques retranchent les rachats probables, et les afficher en
 * positif aurait donné une liste dont la somme ne fait pas la cellule.
 *
 * « SOLDE » EST ÉCARTÉ PARTOUT. Un solde bancaire vient d'un relevé, pas
 * d'opérations : il n'a rien à détailler, et sa présence dans la liste d'un
 * total l'aurait rendue illisible pour rien.
 */
function detailsDe(
  def: DefinitionLigne,
  point: PointTresorerie,
  banque: string | null,
): DetailMontant[] {
  const termes = def.composantes
    ? [
        ...def.composantes.plus.map((l) => ({ l, signe: 1 })),
        ...(def.composantes.moins ?? []).map((l) => ({ l, signe: -1 })),
      ]
    : [{ l: def.libelle, signe: 1 }];

  const lignes: DetailMontant[] = [];
  for (const { l, signe } of termes) {
    if (l === "SOLDE") continue;
    const parCompte = point.details[l];
    if (!parCompte) continue;
    const source =
      banque === null ? Object.values(parCompte).flat() : (parCompte[banque] ?? []);
    for (const d of source) {
      lignes.push(signe === 1 ? d : { ...d, montant: -d.montant });
    }
  }
  // Les plus gros d'abord : c'est ce qu'on cherche quand on survole un montant
  // qui surprend. Le serveur a déjà écrêté chaque poste ; on écrête de nouveau
  // ici, parce qu'un total en additionne plusieurs.
  return lignes.sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant)).slice(0, 30);
}

/**
 * La bulle d'une cellule, ou null s'il n'y a rien à montrer.
 *
 * TROIS CAS SANS BULLE, et ce sont des choix :
 *   - un montant NUL ou absent — il n'y a pas d'opération à détailler ;
 *   - un SOLDE et les deux ratios — ils viennent d'un relevé ou d'un calcul
 *     sur l'actif net, pas d'opérations ;
 *   - un poste dont le détail n'est pas parvenu jusqu'ici.
 */
function composerBulle(
  def: DefinitionLigne,
  point: PointTresorerie,
  parLibelle: Map<string, LigneTresorerie>,
  banque: string | null,
  colonne: string,
  cible: HTMLElement,
): Bulle | null {
  if (def.nature === "solde" || def.nature === "pourcentage") return null;
  if (def.libelle === "SOLDE") return null;

  const ligne = parLibelle.get(def.libelle);
  const valeur = ligne ? (banque === null ? ligne.total : ligne.parBanque[banque]) : null;
  if (valeur === null || valeur === undefined || Math.round(valeur) === 0) return null;

  const lignes = detailsDe(def, point, banque);
  if (lignes.length === 0) return null;

  return {
    ...ancrer(cible),
    titre: intitule(def),
    colonne,
    montant: montant(valeur),
    lignes,
  };
}

/** La bulle elle-même, posée en `fixed` au-dessus de tout le reste. */
function Infobulle({ bulle }: { bulle: Bulle }) {
  return (
    <div
      role="tooltip"
      className="fixed z-50 pointer-events-none rounded-md border border-slate-700 bg-slate-900 text-slate-100 shadow-xl px-3 py-2"
      style={{
        left: bulle.x,
        width: LARGEUR_BULLE,
        ...(bulle.dessous ? { top: bulle.y } : { bottom: bulle.y }),
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold">{bulle.titre}</span>
        <span className="text-[11px] font-semibold tabular-nums">{bulle.montant}</span>
      </div>
      <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">
        {bulle.colonne} · {bulle.lignes.length} ligne(s)
      </div>
      <ul className="mt-1.5 pt-1.5 border-t border-slate-700 space-y-1">
        {bulle.lignes.map((d, i) => (
          <li key={`${d.date}-${d.libelle}-${i}`} className="text-[10px] leading-tight">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-slate-100 truncate">{d.libelle}</span>
              <span className="tabular-nums shrink-0">{montant(d.montant)}</span>
            </div>
            {(d.date || d.info) && (
              <div className="text-[9px] text-slate-400">
                {[d.date, d.info].filter(Boolean).join(" · ")}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TresoreriePanel({
  point,
  grille,
}: {
  point: PointTresorerie | null;
  /** Grille de saisie — banques en colonnes, fonds en lignes. Absente, le
   *  bouton de saisie ne s'affiche pas : c'est le cas sur un écran qui ne la
   *  charge pas. */
  grille?: GrilleSoldes | null;
}) {
  if (!point) {
    return (
      <p className="text-sm text-slate-500 text-center py-10 bg-white border border-slate-200 rounded-lg">
        Aucun inventaire enregistré : les soldes bancaires en sont tirés. Importe un
        inventaire dans l&apos;onglet Portefeuille pour voir le point de trésorerie.
      </p>
    );
  }

  return <Contenu point={point} grille={grille ?? null} />;
}

function Contenu({
  point,
  grille,
}: {
  point: PointTresorerie;
  grille: GrilleSoldes | null;
}) {
  const [saisieOuverte, setSaisieOuverte] = useState(false);
  const [fluxOuverts, setFluxOuverts] = useState(false);
  const [spotsOuverts, setSpotsOuverts] = useState(false);
  const [nivellementsOuverts, setNivellementsOuverts] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [exportErreur, setExportErreur] = useState<string | null>(null);

  /**
   * L'EXPORT DES SOLDES PART DU CLASSEUR ET Y RETOURNE.
   *
   * On y dépose le classeur de gestion de trésorerie, le serveur y relève la
   * structure de la feuille « Point de trésorerie » — quel fonds, quelle
   * ligne, quelles banques et dans quel ordre — et rend un fichier calqué
   * dessus, soldes remplis. Le copier-coller n'a plus rien à viser.
   *
   * C'EST UN ENVOI, PAS UN LIEN : un classeur de quatre mégaoctets ne se passe
   * pas en paramètre d'URL. Le fichier revient donc en réponse, et on le pose
   * dans le navigateur à la main.
   */
  const exporterSoldes = async (classeur: File) => {
    setExportErreur(null);
    setExportEnCours(true);
    try {
      const corps = new FormData();
      corps.append("classeur", classeur);
      if (point.dateFin) corps.append("arrete", point.dateFin);
      const r = await fetch("/gestion-portefeuille/tresorerie/export-soldes", {
        method: "POST",
        body: corps,
      });
      if (!r.ok) {
        setExportErreur((await r.text()) || `Échec (${r.status}).`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soldes-point-tresorerie-${point.dateFin ?? "arrete"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setExportEnCours(false);
    }
  };
  // L'infobulle survolée, ou null. Elle est posée à l'ENTRÉE dans la cellule
  // et n'est plus recalculée ensuite : suivre la souris aurait fait clignoter
  // une bulle de trois cents pixels sur un tableau dont les cellules en font
  // cent vingt.
  const [bulle, setBulle] = useState<Bulle | null>(null);
  // LA SAISIE EST PAR FONDS. En vue consolidée, le tableau additionne les
  // flux de tous les portefeuilles, mais il n'y a aucun fonds à qui
  // attribuer une nouvelle ligne : les deux portes restent fermées plutôt
  // que d'ouvrir sur un formulaire qui échouerait à l'enregistrement.
  const parFonds = point.fondsId !== FONDS_GLOBAL;
  const parLibelle = new Map(point.lignes.map((l) => [l.libelle, l]));
  const ligneSolde = parLibelle.get("SOLDE");

  // Les soldes viennent DU SERVEUR, plus d'un état local.
  //
  // Ils étaient recalculés à la frappe tant que la saisie vivait dans le
  // tableau ; maintenant qu'elle se fait dans une grille à part, la page se
  // rafraîchit à l'enregistrement et les valeurs affichées sont celles
  // enregistrées. Un état local n'aurait fait que dupliquer la source, avec
  // le risque qu'ils divergent après un échec d'écriture.
  const soldeDe = (b: string): number => {
    const v = ligneSolde?.parBanque[b];
    return typeof v === "number" ? v : 0;
  };

  // Le total de la LIGNE « SOLDE » : la somme des relevés, et rien d'autre.
  const soldeBancaire = point.banques.reduce((s, b) => s + soldeDe(b), 0);

  // LES DEUX ENCARTS PORTENT LES SOLDES CALCULÉS, PAS LE SOLDE BANCAIRE.
  //
  // Ils affichaient la somme des relevés sous les noms « solde réel » et
  // « solde théorique » — c'était vrai le jour où aucun poste n'avait de
  // source, ce ne l'est plus : engagements, encaissements à recevoir et flux
  // théoriques sont désormais calculés. L'encart disait donc le contraire de
  // la ligne du même nom, deux écrans plus bas.
  const soldeReel = parLibelle.get("SOLDEREEL")?.total ?? soldeBancaire;
  const soldeTheorique = parLibelle.get("SOLDETHEORIQUE")?.total ?? soldeBancaire;

  // `banques` et `etablissements` sortent de la même liste ordonnée, dans le
  // même ordre : la i-ième colonne est le i-ième établissement.
  const nomColonne = (i: number): string => {
    const e = point.etablissements[i];
    if (!e) return point.banques[i] ?? "";
    return [e.nom, e.pays, e.sens].filter(Boolean).join(" · ");
  };

  const survol = (def: DefinitionLigne, banque: string | null, colonne: string) => ({
    onMouseEnter: (ev: React.MouseEvent<HTMLElement>) =>
      setBulle(composerBulle(def, point, parLibelle, banque, colonne, ev.currentTarget)),
    onMouseLeave: () => setBulle(null),
  });

  return (
    <div className="space-y-4">
      {bulle && <Infobulle bulle={bulle} />}
      {saisieOuverte && grille && (
        <SaisieSoldesDialog grille={grille} onFermer={() => setSaisieOuverte(false)} />
      )}
      {fluxOuverts && (
        <FluxSaisisDialog
          fondsId={point.fondsId}
          fondsNom={point.fonds}
          comptes={point.etablissements}
          flux={point.fluxSaisis}
          onFermer={() => setFluxOuverts(false)}
        />
      )}
      {nivellementsOuverts && (
        <NivellementsDialog
          fondsId={point.fondsId}
          fondsNom={point.fonds}
          comptes={point.etablissements}
          nivellements={point.nivellements}
          onFermer={() => setNivellementsOuverts(false)}
        />
      )}
      {spotsOuverts && (
        <SpotsDialog
          fondsId={point.fondsId}
          fondsNom={point.fonds}
          comptes={point.etablissements}
          spots={point.spots}
          contreparties={point.etablissements.map((e) => e.nom)}
          onFermer={() => setSpotsOuverts(false)}
        />
      )}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Point de trésorerie</h2>
          <p className="text-[11px] text-slate-500 tabular-nums">
            Inventaire du {point.dateInventaire ?? "—"} · {point.banques.length} compte(s)
            {point.actifNet !== null && <> · actif net {montant(point.actifNet)} F</>}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 max-w-lg">
          {/* Pas d'infobulle sur les deux soldes : ils ne viennent d'aucune
              opération, seulement de relevés et de sous-totaux. */}
          <div
            className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2"
            title={DEFS.get("SOLDEREEL")?.explication}
          >
            <div className="text-[10px] uppercase tracking-wider text-blue-700">Solde réel</div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
              {montant(soldeReel)} F
            </div>
          </div>
          <div
            className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2"
            title={DEFS.get("SOLDETHEORIQUE")?.explication}
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-600">
              Solde théorique
            </div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
              {montant(soldeTheorique)} F
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3">
          {/* LA SAISIE SORT DU TABLEAU.
              Le tableau est une RESTITUTION : y mêler des champs rendait
              chaque cellule ambiguë — celle-ci se corrige, celle-là se
              calcule, et rien ne les distinguait qu'une bordure. Elle se fait
              désormais dans une grille dédiée, banques en colonnes et fonds en
              lignes, qui est la forme d'un relevé bancaire. */}
          {grille && (
            <button
              type="button"
              onClick={() => setSaisieOuverte(true)}
              className="px-3 py-1 rounded text-[11px] font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 transition"
            >
              Saisir les soldes
            </button>
          )}
          {/* LES FLUX QUI NE SE DEDUIRONT JAMAIS ont leur propre porte.
              Quatre lignes du classeur ne viennent d'aucune source du site et
              n'en viendront pas : appel de marge, regularisation, commission
              exceptionnelle. Leur formulaire n'est pas un pis-aller en
              attendant mieux, c'est leur place. */}
          {parFonds && (
          <button
            type="button"
            onClick={() => setFluxOuverts(true)}
            className="px-3 py-1 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Flux saisis
            {/* LE COMPTE EST CELUI DE CE QUI PESE ENCORE, comme pour les
                nivellements : un flux réglé ne demande plus rien au gérant, et
                le compter l'aurait envoyé ouvrir une liste où il n'y a plus
                rien à faire. */}
            {point.fluxSaisis.filter((f) => !f.rapprocheLe).length > 0 && (
              <span className="ml-1.5 text-slate-400">
                {point.fluxSaisis.filter((f) => !f.rapprocheLe).length}
              </span>
            )}
          </button>
          )}
          {parFonds && (
          <button
            type="button"
            onClick={() => setSpotsOuverts(true)}
            className="px-3 py-1 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Opérations spot
            {point.spots.filter((s) => !s.dateDenouement).length > 0 && (
              <span className="ml-1.5 text-slate-400">
                {point.spots.filter((s) => !s.dateDenouement).length}
              </span>
            )}
          </button>
          )}
          {/* LE NIVELLEMENT NE DEPLACE PAS D'ARGENT HORS DU FONDS : ses deux
              jambes se compensent au total. Il a pourtant sa propre porte,
              parce qu'il se RAPPROCHE en deux fois - debit puis credit - et
              qu'une ligne de flux isolee n'aurait pas su porter cela. */}
          {parFonds && (
          <button
            type="button"
            onClick={() => setNivellementsOuverts(true)}
            className="px-3 py-1 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Nivellements
            {point.nivellements.filter((n) => !n.rapprocheDebit || !n.rapprocheCredit)
              .length > 0 && (
              <span className="ml-1.5 text-slate-400">
                {
                  point.nivellements.filter(
                    (n) => !n.rapprocheDebit || !n.rapprocheCredit,
                  ).length
                }
              </span>
            )}
          </button>
          )}
          {/* L'EXPORT SUIT L'ECRAN. Meme fonds, meme date d'arrete : le
              fichier porte ce que le gerant a sous les yeux, et non un
              perimetre qu'il faudrait re-choisir dans une boite de dialogue.
              C'est un lien et non un bouton, parce que c'est un
              telechargement : le navigateur sait faire, une action serveur
              aurait demande de reconstituer le fichier cote client. */}
          <a
            href={`/gestion-portefeuille/tresorerie/export?${new URLSearchParams({
              ...(parFonds ? { fonds: point.fondsId } : {}),
              ...(point.dateFin ? { engagements: point.dateFin } : {}),
            }).toString()}`}
            className="px-3 py-1 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
            title="Les engagements au format de la feuille « Autres opérations » du classeur de trésorerie, prêts à coller."
          >
            Export engagements
          </a>
          {/* L'EXPORT DES SOLDES DEMANDE LE CLASSEUR, et ce n'est pas un
              caprice : l'ordre des colonnes de chaque fonds n'obeit a aucune
              regle — c'est l'histoire du portefeuille — et le site ne peut pas
              le deviner. Exporter dans NOTRE ordre obligerait a realigner
              colonne par colonne avant de coller, c'est-a-dire a refaire le
              travail qu'on veut supprimer, avec le risque de poser le solde
              d'une banque sur une autre.
              Le classeur est lu en memoire pour sa structure, jamais ecrit ni
              conserve. */}
          <label
            className={`px-3 py-1 rounded text-[11px] font-medium border cursor-pointer transition ${
              exportEnCours
                ? "border-slate-200 text-slate-400"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
            title="Dépose ton classeur de gestion de trésorerie : le fichier rendu est calqué sur sa feuille « Point de trésorerie », soldes remplis, prêt à coller."
          >
            {exportEnCours ? "Génération…" : "Export soldes"}
            <input
              type="file"
              accept=".xlsm,.xlsx"
              className="hidden"
              disabled={exportEnCours}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void exporterSoldes(f);
              }}
            />
          </label>
          {exportErreur && (
            <span className="text-[11px] text-rose-700">{exportErreur}</span>
          )}
          {point.soldesSaisisLe && (
            <span className="text-[11px] text-slate-500">
              Derniers soldes saisis : {point.soldesSaisisLe}
            </span>
          )}
        </div>



        {/* LES SPOTS DONT L'ÉCHÉANCE EST ENCORE DEVANT. Même raison que les
            rémérés : le flux est certain, il n'entre simplement pas dans
            l'horizon de l'arrêté. */}
        {point.spotsAVenir.length > 0 && (
          <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-2">
            <strong>
              {point.spotsAVenir.length} spot(s) à échoir après le{" "}
              {point.dateFin ?? point.dateInventaire ?? "—"}
            </strong>{" "}
            : intérêts compris, ils ne comptent pas encore.
            <ul className="mt-1 space-y-0.5">
              {point.spotsAVenir.map((s, i) => (
                <li key={i} className="tabular-nums">
                  échéance {s.dateEcheance} · {s.libelle} —{" "}
                  <span
                    className={
                      s.sens === "placement" ? "text-emerald-700" : "text-rose-700"
                    }
                  >
                    {s.sens === "placement" ? "encaissement" : "décaissement"} de{" "}
                    {montant(s.montant)} F
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* LES RÉMÉRÉS DONT LE TERME EST ENCORE DEVANT.
            Leur flux est certain — un réméré se dénoue toujours — mais il ne
            tombe pas dans l'horizon de l'arrêté, donc il ne compte pas encore.
            Sans ce bandeau, un remboursement à sept chiffres n'apparaissait
            qu'au moment où il devenait exigible. */}
        {point.remeresAVenir.length > 0 && (
          <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-2">
            <strong>
              {point.remeresAVenir.length} réméré(s) à dénouer après le{" "}
              {point.dateFin ?? point.dateInventaire ?? "—"}
            </strong>{" "}
            : leur terme est au-delà de l&apos;arrêté, ils ne comptent pas encore.
            <ul className="mt-1 space-y-0.5">
              {point.remeresAVenir.map((r, i) => (
                <li key={i} className="tabular-nums">
                  dénouement {r.dateFin} · {r.libelle} —{" "}
                  <span
                    className={
                      r.sens === "encaissement" ? "text-emerald-700" : "text-rose-700"
                    }
                  >
                    {r.sens} de {montant(r.montant)} F
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* UN ENGAGEMENT QUI S'EVAPORE DOIT SE VOIR.
            La part non servie d'un ordre sort du point dès que sa validité est
            passée — c'est la règle. Mais sans ce bandeau, le gérant constatait
            seulement qu'un montant n'était plus là, sans rien pour lui dire
            que c'était voulu ni depuis quand. */}
        {point.operationsSansColonne.length > 0 && (
          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-2">
            <strong>
              {point.operationsSansColonne.length} montant(s) sans colonne
            </strong>{" "}
            — leur compte de règlement ne figure pas dans l&apos;inventaire de fin, donc
            le montant n&apos;entre nulle part :
            <ul className="mt-1 space-y-0.5">
              {point.operationsSansColonne.map((o) => (
                <li key={`${o.libelle}-${o.compte}`} className="tabular-nums">
                  {o.libelle} · {o.compte} — {montant(o.montant)} F
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        {/* LE TABLEAU DÉFILE DANS LES DEUX SENS, DANS SON PROPRE CADRE.
            Il le faut pour que l'en-tête reste visible : une cellule `sticky`
            se cale sur le conteneur qui défile, et tant que c'était la PAGE
            qui défilait, figer l'en-tête l'aurait posé en haut de l'écran,
            au-dessus des boutons et du reste. Bornée à la hauteur de la
            fenêtre moins le bandeau, la table garde ses colonnes et ses
            libellés sous les yeux jusqu'à la dernière ligne. */}
        <div className="overflow-auto" style={{ maxHeight: HAUTEUR_TABLEAU }}>
          {/* LARGEURS IMPOSEES, EN PIXELS ET EN DUR.
              Sans contrainte, le navigateur dimensionne chaque colonne sur son
              contenu : « UBA » tenait en quelques pixels quand « Coris Bank
              International - Sénégal (CBI-Sénégal) » en prenait dix fois plus,
              et les montants d'une même ligne ne s'alignaient sur rien. Or un
              point de trésorerie se lit en balayant la ligne du regard.

              LA LARGEUR DE LA TABLE EST CALCULEE, pas laissée à « auto ».
              C'est ce qui manquait à la première tentative : en disposition
              `fixed`, une table de largeur auto se cale sur son conteneur puis
              redistribue l'espace entre les colonnes — les largeurs du
              `colgroup` n'étaient plus que des suggestions, et rien ne
              s'harmonisait. En donnant à la table exactement la somme de ses
              colonnes, il n'y a plus rien à redistribuer. Le conteneur parent
              défile horizontalement, ce qui est de toute façon nécessaire
              au-delà d'une dizaine d'établissements. */}
          <table
            className="text-[11px] border-collapse table-fixed"
            style={{ width: LARGEUR_POSTE + point.etablissements.length * LARGEUR_COLONNE + LARGEUR_TOTAL }}
          >
            <colgroup>
              <col style={{ width: LARGEUR_POSTE }} />
              {point.etablissements.map((e) => (
                <col key={e.cle} style={{ width: LARGEUR_COLONNE }} />
              ))}
              <col style={{ width: LARGEUR_TOTAL }} />
            </colgroup>
            {/* L'EN-TÊTE EST FIGÉ, SES DEUX LIGNES.
                Sur un fonds à vingt comptes et quarante postes, on perdait le
                nom de la banque dès la dixième ligne et l'on comptait les
                colonnes du doigt pour savoir de quel compte était le montant
                qu'on lisait.

                LE `sticky` EST PORTÉ PAR CHAQUE CELLULE, jamais par `<tr>` ni
                par `<thead>` : un rang de tableau ne se positionne pas. Et
                chaque cellule figée porte un FOND OPAQUE, sans quoi les lignes
                du corps défileraient visiblement dessous — le fond de
                `<thead>` ne suit pas une cellule que l'on a sortie du flux.

                L'ÉTAGEMENT compte : le coin haut-gauche (z-30) passe devant
                l'en-tête (z-20), qui passe devant la colonne des libellés
                (z-10), elle-même devant le corps. */}
            <thead className="bg-slate-100 text-slate-600">
              {/* Regroupement : dépositaires, espèce, mobile money. Une colonne
                  par établissement, mais le trésorier raisonne d'abord par
                  famille de comptes. */}
              <tr className="text-[9px] uppercase tracking-wider text-slate-500">
                <th
                  className="sticky left-0 z-30 bg-slate-100 border-r border-slate-200"
                  style={{ top: 0, height: HAUTEUR_GROUPE }}
                />
                {(() => {
                  const cases: React.ReactNode[] = [];
                  let i = 0;
                  while (i < point.etablissements.length) {
                    const g = point.etablissements[i].groupe;
                    let n = 1;
                    while (
                      i + n < point.etablissements.length &&
                      point.etablissements[i + n].groupe === g
                    ) n++;
                    cases.push(
                      <th
                        key={g + i}
                        colSpan={n}
                        className="sticky z-20 bg-slate-100 px-3 py-1 font-semibold text-left border-l border-slate-300"
                        style={{ top: 0, height: HAUTEUR_GROUPE }}
                      >
                        {g}
                      </th>,
                    );
                    i += n;
                  }
                  return cases;
                })()}
                <th
                  className="sticky z-20 border-l border-slate-300 bg-slate-200"
                  style={{ top: 0, height: HAUTEUR_GROUPE }}
                />
              </tr>
              <tr>
                <th
                  className="sticky left-0 z-30 bg-slate-100 text-left px-3 py-2 font-medium border-r border-slate-200 shadow-[0_1px_0_0_#cbd5e1]"
                  style={{ top: HAUTEUR_GROUPE }}
                >
                  Poste
                </th>
                {point.etablissements.map((e) => (
                  <th
                    key={e.cle}
                    className="sticky z-20 bg-slate-100 text-right px-2 py-2 font-medium align-bottom leading-tight break-words shadow-[0_1px_0_0_#cbd5e1]"
                    style={{ top: HAUTEUR_GROUPE }}
                    title={e.nom}
                  >
                    {e.nom}
                    <span className="block text-[9px] font-normal text-slate-400">
                      {e.pays || "—"}
                    </span>
                    {/* Chez un opérateur de monnaie électronique, encaissement
                        et décaissement sont deux poches distinctes : le sens
                        doit se lire sans avoir à le déduire du nom. */}
                    {e.sens && (
                      <span
                        className={`block text-[9px] font-semibold ${
                          e.sens === "encaissement"
                            ? "text-emerald-600"
                            : e.sens === "décaissement"
                              ? "text-rose-600"
                              : e.sens === "à préciser"
                                ? "text-amber-600"
                                : "text-slate-400"
                        }`}
                        title={
                          e.sens === "à préciser"
                            ? "Type de compte non renseigné au référentiel — ouvre la fiche pour indiquer encaissement ou décaissement."
                            : undefined
                        }
                      >
                        {e.sens}
                      </span>
                    )}
                  </th>
                ))}
                <th
                  className="sticky z-20 text-right px-2 py-2 font-semibold whitespace-nowrap border-l border-slate-300 bg-slate-200 shadow-[0_1px_0_0_#cbd5e1]"
                  style={{ top: HAUTEUR_GROUPE }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {LIGNES_POINT_TRESORERIE.map((def) => {
                const l = parLibelle.get(def.libelle);
                const pct = def.nature === "pourcentage";
                const valeur = (v: number | null) => (pct ? pourcent(v) : montant(v));
                // Un solde vient d'un relevé, un ratio de l'actif net : ni
                // l'un ni l'autre n'a d'opérations à montrer.
                const detaillable =
                  def.nature !== "solde" && !pct && def.libelle !== "SOLDE";
                const aide = detaillable ? "cursor-help" : "";
                return (
                  <tr key={def.libelle} className={classeLigne(def)}>
                    <td
                      className={`sticky left-0 z-10 px-3 py-1.5 border-r border-slate-200 whitespace-nowrap ${
                        def.nature === "solde"
                          ? "bg-blue-50"
                          : def.nature === "total"
                            ? "bg-slate-50"
                            : "bg-white"
                      }`}
                    >
                      {/* CE QUE LA LIGNE PORTE se lit ICI, sur son
                          intitulé — pas sur les montants, qui ne doivent
                          répondre qu'à « de quoi est-il fait ». */}
                      <span className="cursor-help" title={def.explication}>
                        {intitule(def)}
                      </span>
                      {def.source === "a_alimenter" && (
                        <span
                          className="ml-1.5 text-[9px] text-amber-600"
                          title="Ce poste n'a pas encore de source dans le site : il vaut zéro."
                        >
                          à alimenter
                        </span>
                      )}
                    </td>
                    {point.banques.map((b, i) =>
                      def.libelle === "SOLDE" ? (
                        <td
                          key={b}
                          className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                        >
                          {montant(l ? (l.parBanque[b] ?? null) : null)}
                          {/* Le solde COMPTABLE de l'inventaire reste en
                              regard : l'écart entre les deux est
                              l'information utile du tableau. */}
                          <span className="block text-[9px] text-slate-400 mt-0.5 tabular-nums">
                            inv. {montant(point.soldesInventaire[b] ?? 0)}
                          </span>
                        </td>
                      ) : (
                        <td
                          key={b}
                          className={`text-right px-2 py-1.5 tabular-nums whitespace-nowrap ${aide}`}
                          {...(detaillable ? survol(def, b, nomColonne(i)) : {})}
                        >
                          {l ? valeur(l.parBanque[b] ?? null) : "—"}
                        </td>
                      ),
                    )}
                    <td
                      className={`text-right px-2 py-1.5 tabular-nums font-semibold border-l border-slate-300 bg-slate-50/80 whitespace-nowrap ${aide}`}
                      {...(detaillable
                        ? survol(def, null, `Tous comptes (${point.banques.length})`)
                        : {})}
                    >
                      {def.libelle === "SOLDE"
                        ? montant(soldeBancaire)
                        : l
                          ? valeur(l.total)
                          : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
