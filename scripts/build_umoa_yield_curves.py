#!/usr/bin/env python3
"""
Construit les courbes de taux zero-coupon des Etats de l'UMOA a partir des
adjudications scrapees, en suivant la note de l'Agence UMOA-Titres
"Courbes de taux des emetteurs du MTP".

Entree  : data/umoa-emissions-realisees.csv
Sortie  : data/umoa-courbes-taux.csv

Colonnes de sortie : une ligne par pilier, plus les parametres de la
fonctionnelle repetes sur chaque ligne de la courbe a laquelle ils
appartiennent, pour que le site retrace la courbe continue sans refaire le
demembrement ni le balayage de tau1 a chaque rendu.

  pays;dateReference;maturiteAnnees;maturiteLibelle;zeroCoupon;apresLissage;
  source;beta0;beta1;beta2;beta3;tau1;tau2;residuPb

Chaine de calcul, dans l'ordre de la note :

  IV.a  Les OAT sont positionnees par leur DUREE DE VIE MOYENNE a l'emission,
        arrondie au pilier de maturite standard le plus proche. Les piliers
        non emis sont obtenus par interpolation lineaire.

  IV.b  Les BAT, dont les interets sont precomptes, sont convertis en taux
        post-comptes :  T_post = T_pre / (1 - n * T_pre).
        Le CSV porte deja le resultat dans `rendementMoyenPondere` ; le script
        le recalcule depuis `tauxMoyenPonderePct` et verifie la concordance.

  IV.c  Un BAT est un zero-coupon par nature. Une OAT est demembree : ses flux
        sont actualises avec les taux zero-coupon deja etablis aux maturites
        anterieures, et le taux du pilier est celui qui restitue le prix
        observe.

  IV.f  La courbe est lissee par la fonctionnelle de Nelson-Siegel-Svensson :

        R(0,t) = b0
               + b1 (1-exp(-t/T1))/(t/T1)
               + b2 [(1-exp(-t/T1))/(t/T1) - exp(-t/T1)]
               + b3 [(1-exp(-t/T2))/(t/T2) - exp(-t/T2)]

Deux points que la note ne fixe pas et que les fichiers publies revelent :
  - T2 vaut 3 ans. Verifie sur les courbes officielles des 14, 21 et 28 aout
    2026 : residu median de 0,02 pb sur les huit pays, contre 11 a 39 pb avec
    un Nelson-Siegel a trois facteurs.
  - Un pilier se perime. La note dit "la derniere emission" sans horizon, mais
    l'erreur suit l'anciennete de l'adjudication retenue : mesuree sur les 351
    piliers des trois courbes publiees, elle vaut 6 pb quand l'adjudication a
    moins de trois mois, 26 pb entre un et trois ans, 70 pb au-dela. Un seuil
    de 5 ans conserve 98 % des piliers et ramene le troisieme quartile de
    l'ecart de 42 a 24 pb ; un seuil plus court gagne peu et coute cher en
    couverture (6 mois : 43 % des piliers seulement, et plus de courbe
    beninoise, le Benin n'ayant emis que du BAT court sur la periode).

Usage : python scripts/build_umoa_yield_curves.py [--as-of YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import sys
from datetime import date, datetime
from typing import Optional

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTREE = os.path.join(RACINE, "data", "umoa-emissions-realisees.csv")
SORTIE = os.path.join(RACINE, "data", "umoa-courbes-taux.csv")

# Piliers de maturite standard, en annees (grille des fichiers publies).
PILIERS = [1 / 12, 0.25, 0.5, 0.75, 1] + [float(n) for n in range(2, 16)]

# Facteurs d'amortissement de la fonctionnelle. La note les presente tous deux
# comme "parametres a estimer", mais les courbes publiees tranchent : en
# reajustant une NSS libre sur la colonne "apres lissage" des trois fichiers,
# tau2 ressort a 3,00 pour sept pays sur huit (residu 0,02 a 0,3 pb, donc la
# colonne EST une NSS de tau2 = 3), et tau1 se tient entre 0,20 et 1,05.
#
# Borner tau1 n'est pas un raffinement cosmetique : laisse libre, le critere
# des moindres carres l'envoie vers 0,05, ou les deux premiers facteurs
# s'eteignent avant le premier pilier et ne servent plus qu'a passer
# exactement par le point le plus bruite de la courbe. La bande ci-dessous
# ramene l'ecart median aux courbes publiees de 9,7 pb a 2,2 pb.
TAU2 = 3.0
TAU1_MIN = 0.20
TAU1_MAX = 1.50

# Anciennete maximale d'une adjudication retenue, en mois. 0 = aucun seuil.
FENETRE_MOIS = 60

# Un BAT au-dela de trois ans est un artefact : la colonne "maturite (mois)"
# porte parfois une duree en JOURS (91, 364).
BAT_MAX_ANNEES = 3.0

NOMINAL = 10_000.0


# ---------------------------------------------------------------- utilitaires

def nombre(v: str) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip().replace(" ", "").replace(" ", "").replace(",", ".")
    if s in ("", "-", "--", "NC"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def libelle_pilier(t: float) -> str:
    if t < 1:
        return f"{round(t * 12)} mois"
    n = round(t)
    return "1 an" if n == 1 else f"{n} ans"


def pilier_proche(annees: float) -> float:
    return min(PILIERS, key=lambda p: abs(annees - p))


def taux_post_compte(taux_precompte: float, annees: float) -> float:
    """Note, IV.b. Un taux precompte rapporte les interets a l'avance ; le
    denominateur ramene la base au capital reellement immobilise."""
    d = 1 - annees * taux_precompte
    return taux_precompte / d if d > 0 else taux_precompte


def duree_vie_moyenne(maturite: float, differe: float, amortissement: str) -> float:
    """Note, IV.a. In fine : le capital est rembourse en une fois, la DVM egale
    la maturite. Lineaire : tranches egales des annees D+1 a M, dont la moyenne
    vaut (D + 1 + M) / 2."""
    if maturite <= 0:
        return 0.0
    if amortissement != "Linéaire":
        return maturite
    d = differe if differe and differe > 0 else 0.0
    if d >= maturite:
        return maturite
    return (d + 1 + maturite) / 2


# ------------------------------------------------------------------- lecture

# Seuls les echanges et rachats sont ecartes : leur taux est un taux de SORTIE,
# negocie dans un contexte particulier. Une adjudication ciblee, un bon COVID
# ou une obligation de relance restent des emissions primaires en numeraire,
# donc des observations legitimes de la courbe.
CLASSEMENT_HORS_CASH = ("echange", "échange", "rachat")


def est_adjudication_cash(precisions: str) -> bool:
    p = (precisions or "").strip().lower()
    return not any(mot in p for mot in CLASSEMENT_HORS_CASH)


def charge_titres(as_of: Optional[str]) -> dict[str, list[dict]]:
    par_pays: dict[str, list[dict]] = {}
    controles_bat = {"verifies": 0, "ecarts": 0}

    with open(ENTREE, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            pays = (r.get("pays") or "").strip()
            instrument = (r.get("instrument") or "").strip()
            date_op = (r.get("dateOperation") or "").strip()
            if not pays or instrument not in ("BAT", "OAT") or not date_op:
                continue
            if as_of and date_op > as_of:
                continue
            if not est_adjudication_cash(r.get("precisions", "")):
                continue

            maturite_mois = nombre(r.get("maturiteMois"))
            rendement = nombre(r.get("rendementMoyenPondere"))
            if maturite_mois is None or rendement is None or rendement <= 0:
                continue
            maturite = maturite_mois / 12
            if maturite <= 0 or maturite > 50:
                continue
            if instrument == "BAT" and maturite > BAT_MAX_ANNEES:
                continue

            # Controle de la conversion precomptee (note IV.b) : le CSV porte
            # deja le taux post-compte, on verifie qu'il correspond.
            taux_pre = nombre(r.get("tauxMoyenPonderePct"))
            if instrument == "BAT" and taux_pre is not None:
                attendu = taux_post_compte(taux_pre / 100, maturite) * 100
                controles_bat["verifies"] += 1
                if abs(attendu - rendement) > 0.05:
                    controles_bat["ecarts"] += 1

            par_pays.setdefault(pays, []).append(
                {
                    "date": date_op,
                    "type": instrument,
                    "maturite": maturite,
                    "dvm": duree_vie_moyenne(
                        maturite,
                        nombre(r.get("differeAnnee")) or 0.0,
                        (r.get("typeAmortissement") or "").strip(),
                    ),
                    "rendement": rendement / 100,
                    "prix": nombre(r.get("prixMoyenPondere")),
                    "coupon": (nombre(r.get("tauxInteret")) or 0) / 100,
                    "differe": nombre(r.get("differeAnnee")) or 0.0,
                    "amortissement": (r.get("typeAmortissement") or "").strip(),
                }
            )

    if controles_bat["verifies"]:
        pct = 100 * controles_bat["ecarts"] / controles_bat["verifies"]
        print(
            f"  Controle IV.b : {controles_bat['verifies']} BAT verifies, "
            f"{controles_bat['ecarts']} ecarts ({pct:.1f} %) entre le taux "
            f"post-compte du CSV et la formule de la note."
        )
    return par_pays


# --------------------------------------------------------------- demembrement

def flux_titre(titre: dict) -> list[tuple[float, float]]:
    """Flux annuels d'un titre, par coupure de 10 000 de nominal.

    Les flux courent sur la MATURITE reelle du titre, pas sur son pilier. Une
    OAT 7 ans a amortissement lineaire a une duree de vie moyenne de 4 ans :
    elle se positionne au pilier 4, mais elle paie bel et bien pendant 7 ans.
    Tronquer l'echeancier a 4 ans changeait le profil au point de faire
    ressortir des taux zero-coupon a 17 %.
    """
    c = titre["coupon"]
    n = max(1, round(titre["maturite"]))
    flux: list[tuple[float, float]] = []
    if titre["amortissement"] == "Linéaire":
        d = min(max(0, round(titre["differe"])), n - 1)
        amort = NOMINAL / (n - d)
        restant = NOMINAL
        for k in range(1, n + 1):
            remb = amort if k > d else 0.0
            flux.append((float(k), restant * c + remb))
            restant -= remb
    else:
        for k in range(1, n + 1):
            flux.append((float(k), NOMINAL * c + (NOMINAL if k == n else 0.0)))
    return flux


def interpole(points: list[tuple[float, float]], t: float) -> float:
    if not points:
        return 0.0
    if t <= points[0][0]:
        return points[0][1]
    if t >= points[-1][0]:
        return points[-1][1]
    for i in range(1, len(points)):
        (ta, za), (tb, zb) = points[i - 1], points[i]
        if t <= tb:
            return (za * (tb - t) + zb * (t - ta)) / (tb - ta)
    return points[-1][1]


def extrait_zero_coupon(titres: list[dict], fenetre_mois: int) -> list[dict]:
    if not titres:
        return []

    if fenetre_mois and fenetre_mois > 0:
        reference = max(t["date"] for t in titres)
        ref = datetime.strptime(reference, "%Y-%m-%d").date()
        mois = ref.month - fenetre_mois
        annee = ref.year + (mois - 1) // 12
        mois = (mois - 1) % 12 + 1
        limite = date(annee, mois, min(ref.day, 28)).isoformat()
        recents = [t for t in titres if t["date"] >= limite]
    else:
        # Lecture litterale de la note : « la derniere emission » a chaque
        # pilier, sans horizon.
        recents = titres

    # Un seul titre par pilier : le plus recemment adjuge.
    par_pilier: dict[float, dict] = {}
    for t in recents:
        if t["dvm"] <= 0:
            continue
        p = pilier_proche(t["dvm"])
        if p not in par_pilier or t["date"] > par_pilier[p]["date"]:
            par_pilier[p] = t

    zc: list[dict] = []
    for p in sorted(par_pilier):
        titre = par_pilier[p]

        # Note IV.c : un BAT est un zero-coupon une fois post-compte.
        if titre["type"] == "BAT" or p <= 1:
            zc.append({"t": p, "z": titre["rendement"], "source": "BAT"})
            continue

        prix = titre["prix"] if titre["prix"] and titre["prix"] > 0 else None
        if prix is None:
            # Sans prix, on retombe sur le rendement d'adjudication : cela
            # confond taux actuariel et zero-coupon, ecart d'autant plus faible
            # que le titre s'adjuge pres du pair.
            zc.append({"t": p, "z": titre["rendement"], "source": "OAT (rendement)"})
            continue

        flux = flux_titre(titre)
        connus = [(x["t"], x["z"]) for x in zc]

        def valeur(z_final: float) -> float:
            v = 0.0
            for t_f, montant in flux:
                z = interpole(connus, t_f) if t_f < p else z_final
                v += montant / ((1 + z) ** t_f)
            return v

        bas, haut = 0.001, 0.40
        if valeur(bas) < prix or valeur(haut) > prix:
            zc.append({"t": p, "z": titre["rendement"], "source": "OAT (rendement)"})
            continue
        for _ in range(200):
            milieu = (bas + haut) / 2
            if valeur(milieu) > prix:
                bas = milieu
            else:
                haut = milieu
        z = (bas + haut) / 2

        # Un zero-coupon reste voisin du taux actuariel du titre : l'ecart tient
        # a la pente de la courbe, pas a un facteur deux. Au-dela de 400 pb, le
        # demembrement a bute sur une donnee douteuse (prix hors marche, coupon
        # ou differe mal renseigne) plutot que revele une prime.
        if abs(z - titre["rendement"]) > 0.04:
            zc.append({"t": p, "z": titre["rendement"], "source": "OAT (rendement)"})
        else:
            zc.append({"t": p, "z": z, "source": "OAT"})

    # Note IV.a : les piliers non emis sont obtenus par interpolation lineaire.
    # On n'extrapole pas au-dela des bornes observees.
    if len(zc) >= 2:
        connus = [(x["t"], x["z"]) for x in zc]
        bornes = (zc[0]["t"], zc[-1]["t"])
        for p in PILIERS:
            if p <= bornes[0] or p >= bornes[1]:
                continue
            if any(abs(x["t"] - p) < 1e-9 for x in zc):
                continue
            zc.append({"t": p, "z": interpole(connus, p), "source": "interpolé"})
        zc.sort(key=lambda x: x["t"])

    return zc


# ----------------------------------------------------------- Nelson-Siegel-Svensson

def base_nss(t: float, tau1: float, tau2: float) -> list[float]:
    x1, x2 = t / tau1, t / tau2
    f1 = 1.0 if x1 < 1e-8 else (1 - math.exp(-x1)) / x1
    f2 = f1 - math.exp(-x1)
    g = 1.0 if x2 < 1e-8 else (1 - math.exp(-x2)) / x2
    return [1.0, f1, f2, g - math.exp(-x2)]


def moindres_carres(X: list[list[float]], y: list[float]) -> Optional[list[float]]:
    """Equations normales resolues par elimination de Gauss avec pivot."""
    k = 4
    A = [[0.0] * (k + 1) for _ in range(k)]
    for i in range(k):
        for j in range(k):
            A[i][j] = sum(X[r][i] * X[r][j] for r in range(len(X)))
        A[i][k] = sum(X[r][i] * y[r] for r in range(len(X)))
    for col in range(k):
        piv = max(range(col, k), key=lambda r: abs(A[r][col]))
        if abs(A[piv][col]) < 1e-14:
            return None
        A[col], A[piv] = A[piv], A[col]
        for r in range(k):
            if r == col:
                continue
            f = A[r][col] / A[col][col]
            for c in range(col, k + 1):
                A[r][c] -= f * A[col][c]
    return [A[i][k] / A[i][i] for i in range(k)]


def ajuste_nss(points: list[dict]) -> Optional[dict]:
    """La fonctionnelle est LINEAIRE en beta une fois les tau fixes : chaque
    essai de tau1 se resout par moindres carres ordinaires, sans optimiseur."""
    pts = [p for p in points if p["t"] > 0]
    if len(pts) < 4:
        return None
    y = [p["z"] for p in pts]

    meilleur = None
    tau1 = TAU1_MIN
    while tau1 <= TAU1_MAX + 1e-9:
        if abs(tau1 - TAU2) > 0.02:
            X = [base_nss(p["t"], tau1, TAU2) for p in pts]
            beta = moindres_carres(X, y)
            if beta:
                sse = sum(
                    (sum(X[i][j] * beta[j] for j in range(4)) - y[i]) ** 2
                    for i in range(len(pts))
                )
                if meilleur is None or sse < meilleur["sse"]:
                    meilleur = {"beta": beta, "tau1": tau1, "sse": sse}
        tau1 += 0.01

    if meilleur is None:
        return None
    meilleur["rmse_pb"] = math.sqrt(meilleur["sse"] / len(pts)) * 10000
    return meilleur


def evalue(fit: dict, t: float) -> float:
    b = fit["beta"]
    return sum(v * b[j] for j, v in enumerate(base_nss(t, fit["tau1"], TAU2)))


# ---------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--as-of",
        help="Date de reference YYYY-MM-DD. Par defaut, la derniere adjudication du fichier.",
    )
    ap.add_argument("--fenetre", type=int, default=FENETRE_MOIS)
    args = ap.parse_args()

    if not os.path.exists(ENTREE):
        print(f"Fichier introuvable : {ENTREE}", file=sys.stderr)
        return 1

    print("Construction des courbes de taux UMOA-Titres")
    par_pays = charge_titres(args.as_of)
    if not par_pays:
        print("Aucune adjudication exploitable.", file=sys.stderr)
        return 1

    lignes = []
    print(f"  {'Pays':22}{'points':>8}{'tau1':>8}{'residu':>10}  reference")
    for pays in sorted(par_pays):
        titres = par_pays[pays]
        reference = max(t["date"] for t in titres)
        zc = extrait_zero_coupon(titres, args.fenetre)
        if len(zc) < 4:
            print(f"  {pays:22}{len(zc):>8}   (trop peu de piliers, ignore)")
            continue
        fit = ajuste_nss(zc)
        if fit is None:
            print(f"  {pays:22}{len(zc):>8}   (ajustement impossible, ignore)")
            continue
        print(
            f"  {pays:22}{len(zc):>8}{fit['tau1']:>8.2f}{fit['rmse_pb']:>9.1f} pb  {reference}"
        )
        b = fit["beta"]
        for p in zc:
            lignes.append(
                {
                    "pays": pays,
                    "dateReference": reference,
                    "maturiteAnnees": f"{p['t']:.4f}",
                    "maturiteLibelle": libelle_pilier(p["t"]),
                    "zeroCoupon": f"{p['z']:.6f}",
                    "apresLissage": f"{evalue(fit, p['t']):.6f}",
                    "source": p["source"],
                    "beta0": f"{b[0]:.8f}",
                    "beta1": f"{b[1]:.8f}",
                    "beta2": f"{b[2]:.8f}",
                    "beta3": f"{b[3]:.8f}",
                    "tau1": f"{fit['tau1']:.4f}",
                    "tau2": f"{TAU2:.4f}",
                    "residuPb": f"{fit['rmse_pb']:.1f}",
                }
            )

    if not lignes:
        print("Aucune courbe produite.", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with open(SORTIE, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "pays",
                "dateReference",
                "maturiteAnnees",
                "maturiteLibelle",
                "zeroCoupon",
                "apresLissage",
                "source",
                "beta0",
                "beta1",
                "beta2",
                "beta3",
                "tau1",
                "tau2",
                "residuPb",
            ],
            delimiter=";",
        )
        w.writeheader()
        w.writerows(lignes)

    print(f"\n{len(lignes)} lignes ecrites dans data/umoa-courbes-taux.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
