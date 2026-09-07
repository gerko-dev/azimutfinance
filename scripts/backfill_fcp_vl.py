#!/usr/bin/env python3
"""
Reconstitue l'historique des valeurs liquidatives des FCP / SICAV depuis les
Bulletins Officiels de la Cote archives de la BRVM.

Entree  : https://bfin.brvm.org/boc/BOC_JOUR/BOC_YYYYMMDD.pdf
Sortie  : data/fcp/vl-historique.csv
          gestionnaire;nomAumfcp;opcvm;date;vl;frequenceCalcul;source

Pourquoi ce script existe. `scrape_brvm_boc.py` ecrit data/fcp.csv, mais c'est
un INSTANTANE : une ligne par fonds, ecrasee chaque jour. Aucun historique n'en
sort. Or la derniere page du BOC porte, pour chaque fonds, DEUX valeurs datees —
la VL precedente et la VL du jour, chacune avec sa date de calcul. En relisant
les bulletins archives, on reconstitue donc une serie, et non un point.

Cadence. Tous les jours ouvres. Le BOC range les fonds en trois sections —
QUOTIDIENNES, HEBDOMADAIRES, MENSUELLES — et pres de soixante-dix d'entre eux
calculent une VL chaque jour : n'echantillonner qu'une fois par semaine leur
ferait perdre quatre points sur cinq.

On pourrait esperer n'en lire qu'un sur deux, puisque chaque bulletin porte la
VL du jour ET la precedente. Mesure faite sur quatre bulletins consecutifs, la
« precedente » ne chaine avec la veille que pour 55 a 64 fonds sur 68 : un
bulletin sur deux laisserait des trous. `--pas 7` reste disponible pour une
passe rapide, au prix de la resolution.

Le script est REPRENABLE : il relit sa propre sortie et saute les bulletins
deja depouilles. Un arret en cours de route ne coute que le bulletin courant.

Usage :
    python scripts/backfill_fcp_vl.py                     # 31/12/2022 -> aujourd'hui
    python scripts/backfill_fcp_vl.py --depuis 2025-01-01
    python scripts/backfill_fcp_vl.py --pas 1             # tous les jours ouvres
    python scripts/backfill_fcp_vl.py --max 20            # essai sur 20 bulletins
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "data", "fcp", "vl-historique.csv")
JOURNAL = os.path.join(RACINE, "data", "fcp", ".vl-historique-bulletins.txt")

# Le gestionnaire fait partie de l'identite du fonds, pas de sa description :
# le site joint les series sur le couple (gestionnaire, nom), et deux maisons
# peuvent servir un « FCP CROISSANCE ». Sans cette colonne, leurs valeurs
# liquidatives se melangeraient dans une seule courbe.
#
# `nomAumfcp` est le nom canonique du fonds dans data/fcp/aumfcp.csv, resolu
# par le meme enrichissement que le scraper quotidien. C'est LUI qui sert de
# clef de jointure cote site ; `opcvm` garde le libelle brut du bulletin, pour
# pouvoir remonter a la source en cas de doute.
ENTETES = [
    "gestionnaire",
    "nomAumfcp",
    "opcvm",
    "date",
    "vl",
    "frequenceCalcul",
    "source",
]

# Premier bulletin vise. La serie trimestrielle aumfcp demarre au 31/12/2022 ;
# on part du dernier bulletin de cette annee-la pour que les deux se recouvrent.
DEBUT_DEFAUT = "2022-12-30"

# Une VL hors de ces bornes trahit une colonne mal decoupee dans le PDF, pas un
# fonds hors norme : les VL BRVM vont de quelques milliers a quelques millions.
VL_MIN = 100.0
VL_MAX = 50_000_000.0

# Anciennete maximale d'une VL par rapport au bulletin qui la publie. Genereuse :
# meme un fonds a VL mensuelle publie une « valeur precedente » d'un mois.
PEREMPTION_JOURS = 400

# Seules des dates ISO entrent dans la serie.
RE_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def taire_avertissement_tls() -> None:
    """Le BOC est servi sur un certificat que le scraper ne verifie pas, ce qui
    fait crier urllib3 a chaque telechargement — deux cents fois par passe. On
    coupe l'avertissement ICI plutot que de filtrer la sortie au shell : un
    `| grep -v` masque aussi le code de retour, et la passe precedente a paru
    reussir alors qu'elle avait plante."""
    try:
        import urllib3

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    except Exception:  # noqa: BLE001 — cosmetique, jamais bloquant
        pass


def charger_scraper():
    """Importe scrape_brvm_boc.py comme module, pour reutiliser son parseur.

    Le fichier n'est pas un package : on le charge par chemin plutot que d'en
    dupliquer les huit cents lignes d'analyse du PDF.
    """
    chemin = os.path.join(RACINE, "scripts", "scrape_brvm_boc.py")
    spec = importlib.util.spec_from_file_location("scrape_brvm_boc", chemin)
    if spec is None or spec.loader is None:
        raise SystemExit("Impossible de charger scripts/scrape_brvm_boc.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["scrape_brvm_boc"] = mod
    spec.loader.exec_module(mod)
    return mod


def lire_journal() -> set[str]:
    """Bulletins deja depouilles, y compris ceux qui n'existaient pas."""
    if not os.path.exists(JOURNAL):
        return set()
    with open(JOURNAL, encoding="utf-8") as f:
        return {l.strip() for l in f if l.strip()}


def noter_bulletins(jours: list[str]) -> None:
    """Marque des bulletins comme depouilles.

    A n'appeler qu'APRES avoir ecrit les observations. Journaliser des le
    telechargement paraissait plus simple, mais le CSV n'etant sauve que tous
    les vingt-cinq bulletins, une interruption laissait jusqu'a vingt-cinq
    bulletins marques « faits » alors que leurs valeurs etaient perdues — et la
    reprise les sautait, creusant un trou definitif dans la serie. C'est arrive :
    53 bulletins ont du etre repeches en reconstruisant le journal depuis la
    colonne `source` du CSV.
    """
    if not jours:
        return
    os.makedirs(os.path.dirname(JOURNAL), exist_ok=True)
    with open(JOURNAL, "a", encoding="utf-8") as f:
        for j in jours:
            f.write(j + "\n")


def lire_sortie() -> dict[tuple[str, str], list[str]]:
    if not os.path.exists(SORTIE):
        return {}
    with open(SORTIE, encoding="utf-8", newline="") as f:
        return {
            (r["gestionnaire"], r["nomAumfcp"] or r["opcvm"], r["date"]): [
                r[c] for c in ENTETES
            ]
            for r in csv.DictReader(f, delimiter=";")
        }


def ecrire_sortie(obs: dict[tuple[str, str], list[str]]) -> None:
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    lignes = sorted(obs.values(), key=lambda r: (r[0], r[1], r[3]))
    with open(SORTIE, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(ENTETES)
        w.writerows(lignes)


def nombre(v: str) -> float | None:
    s = str(v or "").strip().replace(" ", "").replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        x = float(s)
    except ValueError:
        return None
    return x if VL_MIN <= x <= VL_MAX else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depuis", default=DEBUT_DEFAUT, help="Date de depart YYYY-MM-DD")
    ap.add_argument("--jusqu-a", default=None, help="Date de fin YYYY-MM-DD")
    ap.add_argument(
        "--pas",
        type=int,
        default=1,
        help="1 = tous les jours ouvrés (défaut). 7 = un jour ouvré par semaine.",
    )
    ap.add_argument("--max", type=int, default=0, help="Limite le nombre de bulletins.")
    ap.add_argument(
        "--fils",
        type=int,
        default=6,
        help="Téléchargements simultanés (défaut 6).",
    )
    args = ap.parse_args()

    taire_avertissement_tls()
    boc = charger_scraper()

    debut = datetime.strptime(args.depuis, "%Y-%m-%d").date()
    fin = (
        datetime.strptime(args.jusqu_a, "%Y-%m-%d").date()
        if args.jusqu_a
        else date.today()
    )

    # Index aumfcp charge une fois : c'est lui qui donne le gestionnaire
    # canonique et le nom de reference du fonds. Sans lui, le gestionnaire
    # extrait du PDF ressort tronque de facon instable — « AFRICABOURSE ASSET »
    # une semaine, « AFRICABOURSE ASSET MANAGEMENT » la suivante, parce que son
    # nom court sur deux lignes du tableau — et un meme fonds se dedoublerait.
    index_aum = boc.load_aumfcp_index()

    obs = lire_sortie()
    deja = lire_journal()
    print(f"Sortie existante : {len(obs)} observations, {len(deja)} bulletins dépouillés")

    # On vise chaque JOUR OUVRE, pas un pas calendaire : la BRVM ne publie pas
    # le week-end, et viser un samedi ne ferait que retelecharger le bulletin du
    # vendredi, deja lu.
    #
    # Pourquoi tous les jours ouvres et pas un sur deux : chaque bulletin porte
    # la VL du jour ET la precedente, on pourrait donc esperer couvrir deux
    # journees d'un coup. Mesure faite sur quatre bulletins consecutifs, la
    # « precedente » ne chaine avec la veille que pour 55 a 64 fonds sur 68 a
    # VL quotidienne : un bulletin sur deux laisserait des trous.
    vises: list[date] = []
    j = debut
    while j <= fin:
        if j.weekday() < 5 and (args.pas == 1 or (j - debut).days % args.pas == 0):
            vises.append(j)
        j += timedelta(days=1)
    if args.max:
        vises = vises[: args.max]

    restants = [d for d in vises if d.isoformat() not in deja]
    ignores = len(vises) - len(restants)
    print(
        f"{len(vises)} jours ouvrés visés du {debut} au {fin} — "
        f"{ignores} déjà dépouillés, {len(restants)} à lire"
    )

    traites = absents = echecs = 0
    nouvelles = 0
    # Bulletins lus mais dont les observations ne sont pas encore sur disque.
    en_attente: list[str] = []
    perimees = 0
    invalides = 0
    futures = 0
    echelles = 0

    # Le telechargement domine tout : 22 secondes pour 0,5 seconde d'analyse,
    # le serveur plafonnant autour de 100 Ko/s. On parallelise donc les
    # requetes, modestement — six fils suffisent a ramener quatre heures a une,
    # sans marteler un serveur public.
    #
    # On classe l'echec, au lieu de se contenter d'un None. `fetch_boc` rend
    # None aussi bien pour un 404 — jour ferie, il n'y a rien a lire, le
    # bulletin est definitivement traite — que pour une coupure reseau, ou il
    # faudra revenir. Les confondre serait grave : une perte de connexion
    # aurait fait defiler les centaines de bulletins restants en les marquant
    # tous « faits », sans jamais les relire.
    import requests

    def telecharger(d: date) -> tuple[date, str, bytes | None]:
        erreur = False
        for suffixe in ("", "_2"):
            url = (
                "https://bfin.brvm.org/boc/BOC_JOUR/"
                f"BOC_{d.strftime('%Y%m%d')}{suffixe}.pdf"
            )
            try:
                r = requests.get(url, headers=boc.HEADERS, timeout=45, verify=False)
            except requests.RequestException:
                erreur = True
                continue
            if r.status_code == 200 and r.content[:4] == b"%PDF":
                return d, "ok", r.content
        return d, "erreur" if erreur else "absent", None

    with ThreadPoolExecutor(max_workers=args.fils) as pool:
        resultats = pool.map(telecharger, restants)

        # Les resultats arrivent dans l'ordre soumis, ce qui garde un
        # journal et un affichage lisibles.
        for cible, statut, contenu in resultats:
            jour_reel = cible

            if statut == "erreur":
                # Rien n'est journalise : la prochaine passe reprendra ce jour.
                echecs += 1
                continue

            en_attente.append(cible.isoformat())

            if statut != "ok" or not contenu:
                absents += 1
                continue

            try:
                # DERNIERE page, en mode layout : le tableau FCP aligne
                # Dépositaire, OPCVM et Catégorie a des positions de colonne fixes,
                # que l'extraction de texte brute aplatit. Avec extract_text(), le
                # parseur ne reconnait aucune ligne et rend zero fonds.
                texte = boc.extract_last_page_text(contenu)
                lignes, _ = boc.enrich_fcp_rows(boc.extract_fcp(texte), index_aum)
            except Exception as e:  # noqa: BLE001 — un PDF illisible ne doit pas tuer la passe
                absents += 1
                print(f"  {cible} : PDF illisible ({type(e).__name__})")
                continue

            avant = len(obs)
            for r in lignes:
                brut = (r.get("opcvm") or "").strip()
                gest = (r.get("gestionnaire") or "").strip()
                # Le nom canonique quand l'enrichissement a trouve le fonds, le
                # libelle du bulletin sinon : mieux vaut une serie sous un nom
                # approximatif que pas de serie du tout.
                nom = (r.get("nomAumfcp") or "").strip() or brut
                if not nom:
                    continue
                freq = (r.get("frequenceCalcul") or "").strip()
                # VL du referentiel trimestriel, quand l'enrichissement l'a
                # trouvee : sert d'ordre de grandeur de controle.
                reference = nombre(r.get("vlAumfcp", ""))
                # Deux observations datees par fonds et par bulletin.
                # Noms d'apres enrichissement : enrich_fcp_rows renomme
                # valeurPrecedente/valeurJour en vlPrecedente/vlActuelle, comme
                # dans data/fcp.csv.
                for champ_vl, champ_date in (
                    ("vlPrecedente", "datePrecedente"),
                    ("vlActuelle", "dateActuelle"),
                ):
                    vl = nombre(r.get(champ_vl, ""))
                    d = (r.get(champ_date) or "").strip()
                    # Controle STRICT du format, et pas seulement de la longueur :
                    # les bulletins anciens datent en JJ.MM.AAAA, qui fait dix
                    # caracteres comme une date ISO. Un simple len(d) == 10 laissait
                    # donc entrer « 14.04.2023 » dans la serie, ou il se serait trie
                    # avant tout le reste.
                    if vl is None or not RE_ISO.match(d):
                        continue
                    # La forme ne suffit pas : le decoupage du PDF produit parfois
                    # des dates inexistantes au calendrier — un « 2024-06-31 » passe
                    # l'expression reguliere et fait planter la conversion.
                    try:
                        jour_vl = datetime.strptime(d, "%Y-%m-%d").date()
                    except ValueError:
                        invalides += 1
                        continue
                    # Le bulletin affiche la derniere VL CONNUE d'un fonds, meme
                    # dormant : trois fonds y trainaient une valeur de 2014 encore
                    # publiee en 2023. C'est une information sur le fonds, pas un
                    # point de serie — et comme les graphiques rebasent sur la
                    # premiere observation, un tel point deviendrait la base et
                    # ecraserait toute la courbe.
                    if jour_vl < jour_reel - timedelta(days=PEREMPTION_JOURS):
                        perimees += 1
                        continue
                    # Et pas de VL POSTERIEURE a son bulletin : une valeur
                    # liquidative ne se publie pas avant d'etre calculee. Le
                    # decoupage du PDF separe parfois mal une colonne
                    # numerique et fabrique une date fantaisiste — l'une
                    # tombait en l'an 5025, et soixante-quatre observations
                    # devancaient leur propre bulletin.
                    if jour_vl > jour_reel:
                        futures += 1
                        continue
                    # Controle d'echelle contre la VL du referentiel. Sur un
                    # fonds — BRIDGE EQUILIBRE — le decoupage du tableau lisait
                    # l'ACTIF NET dans la colonne de la VL : 31 millions au lieu
                    # de 6 799, un facteur 4 600, et 194 observations fausses qui
                    # auraient ecrase toute echelle de graphique. Une VL peut
                    # doubler en quatre ans, pas quintupler.
                    if reference is not None and not (
                        0.2 <= vl / reference <= 5
                    ):
                        echelles += 1
                        continue
                    cle = (gest, nom, d)
                    # Premiere lecture gagnante : une meme VL relue dans un
                    # bulletin ulterieur porte la meme valeur, inutile de la
                    # reecrire, et cela rend la passe idempotente.
                    if cle not in obs:
                        obs[cle] = [
                            gest,
                            nom,
                            brut,
                            d,
                            f"{vl:.4f}".rstrip("0").rstrip("."),
                            freq,
                            jour_reel.isoformat(),
                        ]

            gagnees = len(obs) - avant
            nouvelles += gagnees
            traites += 1
            print(
                f"  {cible} → BOC {jour_reel} : {len(lignes):3} fonds, "
                f"{gagnees:3} nouvelles VL (total {len(obs)})"
            )
            if traites % 25 == 0:
                ecrire_sortie(obs)
                noter_bulletins(en_attente)
                en_attente = []

    ecrire_sortie(obs)
    noter_bulletins(en_attente)

    if perimees:
        print(f"VL périmées écartées : {perimees} (plus de {PEREMPTION_JOURS} jours avant leur bulletin)")
    if invalides:
        print(f"Dates inexistantes au calendrier écartées : {invalides}")
    if futures:
        print(f"VL postérieures à leur bulletin écartées : {futures}")
    if echelles:
        print(
            f"VL d'ordre de grandeur incohérent écartées : {echelles} "
            "(colonne mal découpée dans le PDF)"
        )
    fonds = len({(k[0], k[1]) for k in obs})
    dates = sorted({k[2] for k in obs})
    print()
    print(
        f"Bulletins dépouillés : {traites}   déjà faits : {ignores}   "
        f"fériés : {absents}   échecs réseau : {echecs}"
    )
    if echecs:
        print(
            f"Les {echecs} jours en échec réseau ne sont PAS journalisés : "
            "relancez le script, il les reprendra."
        )
    print(f"Observations : {len(obs)} (+{nouvelles})   fonds : {fonds}")
    if dates:
        print(f"Période couverte : {dates[0]} → {dates[-1]}")
    print(f"Écrit dans data/fcp/vl-historique.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
