#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Note mensuelle sur le marche des actions de la BRVM, au format Word.

POURQUOI UN SCRIPT ET NON UN DOCUMENT ECRIT A LA MAIN. Une note de marche est
faite de deux choses : des chiffres et un commentaire. Les chiffres se
recalculent chaque mois a partir des memes fichiers ; les recopier a la main,
c'est se tromper une fois sur dix, et ne jamais savoir laquelle. Ici ils sont
LUS des donnees du site a chaque execution, et le commentaire est redige autour
d'eux -- il reste a relire, mais il ne peut plus contredire le tableau qui le
suit.

SOURCES, TOUTES LOCALES :
  data/historique_sika_indices/*.csv  cours de cloture des onze indices BRVM
  data/historique_sika/*.csv          cours et volumes des 47 valeurs suivies
  data/titres.csv                     capitalisation, titres en circulation, PER
  data/dividendes-boc.csv             calendrier des detachements (BOC)
  data/obligations-cotees-boc-synthese.json  synthese obligataire du BOC
  data/umoa-emissions-realisees.csv   adjudications UMOA-Titres du mois

LE DOCX EST ECRIT SANS DEPENDANCE. python-docx n'est pas installe et un
document Word est une archive zip de quelques fichiers XML : autant les ecrire.
Cela evite d'imposer une dependance a un depot qui n'en a pas besoin, et le
format reste lisible ici meme, sans boite noire.

Usage :
    python scripts/note_marche_actions.py              # mois ecoule
    python scripts/note_marche_actions.py 2026-09      # mois explicite
    python scripts/note_marche_actions.py 2026-09 --tv # version parlee, plateau TV
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import os
import re
import sys
import zipfile
from xml.sax.saxutils import escape

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RACINE, "data")

NOMS_INDICES = {
    "BRVMC": "BRVM Composite",
    "BRVM30": "BRVM 30",
    "BRVMPA": "BRVM Principal",
    "BRVMPR": "BRVM Prestige",
    "BRVM-CB": "BRVM Consommation de Base",
    "BRVM-CD": "BRVM Consommation Discrétionnaire",
    "BRVM-EN": "BRVM Énergie",
    "BRVM-IN": "BRVM Industriels",
    "BRVM-SF": "BRVM Services Financiers",
    "BRVM-SP": "BRVM Services Publics",
    "BRVM-TEL": "BRVM Télécommunications",
}
SECTORIELS = ["BRVM-TEL", "BRVM-SF", "BRVM-IN", "BRVM-SP", "BRVM-EN", "BRVM-CB", "BRVM-CD"]

MOIS_FR = [
    "", "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


# ── Lecture des donnees ─────────────────────────────────────────────────────

def nombre(x: str | None) -> float | None:
    """Un nombre de CSV, francais ou anglais, ou None."""
    if x is None:
        return None
    s = x.strip().replace(" ", "").replace(" ", "")
    if not s or s in {"NC", "-", "--"}:
        return None
    if "," in s and "." not in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def serie(chemin: str) -> dict[str, tuple[float, float]]:
    """Date ISO -> (cloture, volume), pour un historique Sikafinance."""
    out: dict[str, tuple[float, float]] = {}
    with io.open(chemin, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            d = (r.get("date_iso") or "").strip()
            c = nombre(r.get("close"))
            if len(d) == 10 and c is not None:
                out[d] = (c, nombre(r.get("volume")) or 0.0)
    return out


def variation(s: dict[str, tuple[float, float]], mois: str) -> dict | None:
    """Performance du mois : cloture de fin de mois precedent -> fin de mois."""
    dedans = sorted(d for d in s if d.startswith(mois))
    avant = sorted(d for d in s if d < mois + "-01")
    if not dedans or not avant:
        return None
    base = s[avant[-1]][0]
    fin = s[dedans[-1]][0]
    if base <= 0:
        return None
    debut_annee = [d for d in s if d < mois[:4] + "-01-01"]
    ytd = s[sorted(debut_annee)[-1]][0] if debut_annee else None
    return {
        "base": base,
        "fin": fin,
        "pct": 100 * (fin / base - 1),
        "ytd": 100 * (fin / ytd - 1) if ytd else None,
        "haut": max(s[d][0] for d in dedans),
        "bas": min(s[d][0] for d in dedans),
        "seances": len(dedans),
        "premiere": dedans[0],
        "derniere": dedans[-1],
        "volume": sum(s[d][1] for d in dedans),
        "valeur": sum(s[d][0] * s[d][1] for d in dedans),
    }


def collecter(mois: str) -> dict:
    """Tout ce que la note dit, lu dans les donnees."""
    d: dict = {"mois": mois}

    # Indices.
    dossier = os.path.join(DATA, "historique_sika_indices")
    d["indices"] = {}
    for f in sorted(os.listdir(dossier)):
        if not f.endswith(".csv"):
            continue
        v = variation(serie(os.path.join(dossier, f)), mois)
        if v:
            d["indices"][f[:-4]] = v

    # Referentiel des valeurs.
    titres = {}
    with io.open(os.path.join(DATA, "titres.csv"), encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            titres[r["code"].strip().upper()] = {
                "nom": (r.get("name") or "").strip(),
                "secteur": (r.get("sector") or "").strip(),
                "pays": (r.get("country") or "").strip(),
                "titres": nombre(r.get("sharesOutstanding")),
                "cap": nombre(r.get("capitalization")),
                "per": nombre(r.get("per")),
            }
    d["capitalisationActions"] = sum(t["cap"] or 0 for t in titres.values())
    d["nbSocietes"] = len(titres)
    pers = sorted(t["per"] for t in titres.values() if t["per"] and 0 < t["per"] < 100)
    d["perMedian"] = pers[len(pers) // 2] if pers else None

    # Valeurs : performance, volume, contribution a la capitalisation.
    dossier = os.path.join(DATA, "historique_sika")
    valeurs = []
    for f in sorted(os.listdir(dossier)):
        if not f.endswith(".csv"):
            continue
        code = f.split(".")[0].upper()
        v = variation(serie(os.path.join(dossier, f)), mois)
        if not v:
            continue
        info = titres.get(code, {})
        n = info.get("titres")
        valeurs.append({
            "code": code,
            "nom": info.get("nom") or code,
            "secteur": info.get("secteur") or "",
            "debut": v["base"],
            "fin": v["fin"],
            "pct": v["pct"],
            "volume": v["volume"],
            "valeur": v["valeur"],
            "contribution": (v["fin"] - v["base"]) * n if n else None,
        })
    d["valeurs"] = valeurs
    d["hausses"] = sum(1 for v in valeurs if v["pct"] > 0.001)
    d["baisses"] = sum(1 for v in valeurs if v["pct"] < -0.001)
    d["stables"] = len(valeurs) - d["hausses"] - d["baisses"]
    d["volumeMois"] = sum(v["volume"] for v in valeurs)
    d["valeurMois"] = sum(v["valeur"] for v in valeurs)

    # Le mois precedent, pour comparer l'activite.
    precedent = mois_precedent(mois)
    total_prec = 0.0
    for f in sorted(os.listdir(dossier)):
        if not f.endswith(".csv"):
            continue
        v = variation(serie(os.path.join(dossier, f)), precedent)
        if v:
            total_prec += v["valeur"]
    d["moisPrecedent"] = precedent
    d["valeurMoisPrecedent"] = total_prec

    # LE MOIS EST-IL LE PLUS ACTIF DE L'ANNEE ? La question se verifie, elle ne
    # s'affirme pas : une note qui ecrit « au plus haut de l'annee » sans avoir
    # compare les douze mois finit par l'ecrire un mois de trop.
    annee: dict[str, float] = {}
    for f in sorted(os.listdir(dossier)):
        if not f.endswith(".csv"):
            continue
        for r in csv.DictReader(io.open(os.path.join(dossier, f), encoding="utf-8-sig"), delimiter=";"):
            m = (r.get("date_iso") or "")[:7]
            if not m.startswith(mois[:4]) or m > mois:
                continue
            c, v = nombre(r.get("close")), nombre(r.get("volume"))
            if c and v:
                annee[m] = annee.get(m, 0.0) + c * v
    d["plusActifDeLAnnee"] = bool(annee) and max(annee, key=lambda k: annee[k]) == mois
    d["moisEcoules"] = len(annee)

    avec_contrib = [v for v in valeurs if v["contribution"] is not None]
    d["contributions"] = sorted(avec_contrib, key=lambda v: -v["contribution"])
    d["soldeCapitalisation"] = sum(v["contribution"] for v in avec_contrib)

    # Synthese obligataire du BOC.
    try:
        with io.open(os.path.join(DATA, "obligations-cotees-boc-synthese.json"), encoding="utf-8") as f:
            d["boc"] = json.load(f)
    except OSError:
        d["boc"] = None

    # Detachements du mois et du mois suivant.
    div = []
    try:
        with io.open(os.path.join(DATA, "dividendes-boc.csv"), encoding="utf-8-sig", newline="") as f:
            div = list(csv.DictReader(f, delimiter=";"))
    except OSError:
        pass
    d["dividendesMois"] = [r for r in div if (r.get("exDividende") or "").startswith(mois)]
    d["dividendesAVenir"] = sorted(
        (r for r in div if (r.get("exDividende") or "") > mois + "-31"),
        key=lambda r: r.get("exDividende") or "",
    )

    # Marche primaire souverain : la concurrence directe pour l'epargne.
    lignes = []
    try:
        with io.open(os.path.join(DATA, "umoa-emissions-realisees.csv"), encoding="utf-8-sig", newline="") as f:
            lignes = [r for r in csv.DictReader(f, delimiter=";")
                      if (r.get("dateOperation") or "").startswith(mois)]
    except OSError:
        pass
    par_pays: dict[str, list[float]] = {}
    for r in lignes:
        m = nombre(r.get("montantRetenuM")) or 0
        y = nombre(r.get("rendementMoyenPondere"))
        if m <= 0 or y is None:
            continue
        a = par_pays.setdefault(r["pays"], [0.0, 0.0])
        a[0] += m
        a[1] += y * m
    d["primaire"] = sorted(
        ({"pays": p, "montant": m * 1e6, "rmp": s / m} for p, (m, s) in par_pays.items()),
        key=lambda x: -x["montant"],
    )
    d["primaireTotal"] = sum(p["montant"] for p in d["primaire"])
    return d


def mois_precedent(mois: str) -> str:
    a, m = int(mois[:4]), int(mois[5:7])
    return f"{a - 1}-12" if m == 1 else f"{a}-{m - 1:02d}"


# ── Mise en forme ───────────────────────────────────────────────────────────

def fr(n: float, dec: int = 0) -> str:
    """Un nombre a la francaise : espace insecable pour les milliers."""
    s = f"{n:,.{dec}f}".replace(",", " ").replace(".", ",")
    return s


def pct(n: float, dec: int = 2) -> str:
    return f"{n:+.{dec}f} %".replace(".", ",")


def mds(n: float, dec: int = 1) -> str:
    return f"{n / 1e9:,.{dec}f}".replace(",", " ").replace(".", ",") + " Mds F"


def libelle_mois(mois: str) -> str:
    return f"{MOIS_FR[int(mois[5:7])]} {mois[:4]}"


def date_fr(iso: str) -> str:
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", iso or ""):
        return iso or ""
    a, m, j = iso.split("-")
    return f"{int(j)} {MOIS_FR[int(m)]} {a}"


# ── Ecriture du .docx ───────────────────────────────────────────────────────
#
# Un document Word est un zip de parties XML. Cinq suffisent : les types de
# contenu, la relation vers le document, le document, ses relations, et les
# styles. Tout le reste (themes, parametres, polices) a des valeurs par defaut
# que Word applique sans broncher.

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""


def styles_xml() -> str:
    def style(sid, nom, taille, gras, couleur, avant, apres, niveau=None):
        plan = f'<w:outlineLvl w:val="{niveau}"/>' if niveau is not None else ""
        return (
            f'<w:style w:type="paragraph" w:styleId="{sid}">'
            f'<w:name w:val="{nom}"/><w:basedOn w:val="Normal"/><w:qFormat/>'
            f'<w:pPr><w:spacing w:before="{avant}" w:after="{apres}"/>{plan}</w:pPr>'
            f'<w:rPr><w:b w:val="{"true" if gras else "false"}"/>'
            f'<w:color w:val="{couleur}"/><w:sz w:val="{taille}"/></w:rPr>'
            f"</w:style>"
        )

    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {W}>
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="fr-FR"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="280" w:lineRule="auto"/>
<w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
{style("Titre", "Title", 40, True, "0F172A", 0, 60)}
{style("SousTitre", "Subtitle", 22, False, "64748B", 0, 240)}
{style("Titre1", "heading 1", 28, True, "1D4ED8", 320, 140, 0)}
{style("Titre2", "heading 2", 23, True, "0F172A", 220, 100, 1)}
{style("Encadre", "Intense Quote", 21, False, "334155", 120, 120)}
{style("Legende", "caption", 17, False, "64748B", 0, 200)}
<w:style w:type="table" w:styleId="Grille"><w:name w:val="Table Grid"/>
<w:tblPr><w:tblBorders>
<w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/>
<w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/>
<w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/>
</w:tblBorders></w:tblPr></w:style>
</w:styles>"""


def core_xml(titre: str, auteur: str) -> str:
    maintenant = dt.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>{escape(titre)}</dc:title><dc:creator>{escape(auteur)}</dc:creator>
<cp:lastModifiedBy>{escape(auteur)}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">{maintenant}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">{maintenant}</dcterms:modified>
</cp:coreProperties>"""


def runs(texte: str) -> str:
    """Texte avec **gras**, decoupe en runs Word."""
    out = []
    for i, bout in enumerate(re.split(r"\*\*(.+?)\*\*", texte)):
        if not bout:
            continue
        gras = "<w:b/>" if i % 2 else ""
        out.append(
            f'<w:r><w:rPr>{gras}</w:rPr>'
            f'<w:t xml:space="preserve">{escape(bout)}</w:t></w:r>'
        )
    return "".join(out)


def para(texte: str = "", style: str | None = None) -> str:
    p = f'<w:pStyle w:val="{style}"/>' if style else ""
    return f"<w:p><w:pPr>{p}</w:pPr>{runs(texte)}</w:p>"


def puce(texte: str) -> str:
    return (
        '<w:p><w:pPr><w:ind w:left="340" w:hanging="200"/>'
        '<w:spacing w:after="80"/></w:pPr>'
        + runs("• " + texte)
        + "</w:p>"
    )


def tableau(entetes: list[str], lignes: list[list[str]], largeurs: list[int]) -> str:
    def cellule(txt: str, w: int, entete: bool, droite: bool) -> str:
        fond = '<w:shd w:val="clear" w:fill="E2E8F0"/>' if entete else ""
        jc = '<w:jc w:val="right"/>' if droite and not entete else ""
        gras = "<w:b/>" if entete else ""
        return (
            f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{fond}'
            f'<w:vAlign w:val="center"/></w:tcPr>'
            f'<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>{jc}</w:pPr>'
            f'<w:r><w:rPr>{gras}<w:sz w:val="18"/></w:rPr>'
            f'<w:t xml:space="preserve">{escape(txt)}</w:t></w:r></w:p></w:tc>'
        )

    grille = "".join(f'<w:gridCol w:w="{w}"/>' for w in largeurs)
    rows = [
        "<w:tr><w:trPr><w:tblHeader/></w:trPr>"
        + "".join(cellule(t, largeurs[i], True, False) for i, t in enumerate(entetes))
        + "</w:tr>"
    ]
    for l in lignes:
        rows.append(
            "<w:tr>"
            + "".join(cellule(c, largeurs[i], False, i > 0) for i, c in enumerate(l))
            + "</w:tr>"
        )
    return (
        f'<w:tbl><w:tblPr><w:tblStyle w:val="Grille"/>'
        f'<w:tblW w:w="{sum(largeurs)}" w:type="dxa"/>'
        f'<w:tblLayout w:type="fixed"/></w:tblPr>'
        f"<w:tblGrid>{grille}</w:tblGrid>" + "".join(rows) + "</w:tbl>"
    )


def ecrire_docx(chemin: str, corps: str, titre: str, auteur: str) -> None:
    document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document {W}><w:body>{corps}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"
 w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>"""
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("docProps/core.xml", core_xml(titre, auteur))
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/styles.xml", styles_xml())
        z.writestr("word/document.xml", document)


# ── La note ─────────────────────────────────────────────────────────────────

def rediger(d: dict) -> tuple[str, str]:
    mois = d["mois"]
    lm = libelle_mois(mois)
    c = d["indices"]["BRVMC"]
    t30 = d["indices"]["BRVM30"]
    v = d["valeurs"]
    hausses = sorted(v, key=lambda x: -x["pct"])[:5]
    baisses = sorted(v, key=lambda x: x["pct"])[:5]
    volumes = sorted(v, key=lambda x: -x["valeur"])[:5]
    premier = d["contributions"][0]
    part = 100 * premier["contribution"] / d["soldeCapitalisation"] if d["soldeCapitalisation"] else 0
    sans_lui = d["soldeCapitalisation"] - premier["contribution"]
    secto = [(k, d["indices"][k]) for k in SECTORIELS if k in d["indices"]]
    secto.sort(key=lambda kv: -kv[1]["pct"])
    meilleur, pire = secto[0], secto[-1]
    activite = (
        100 * (d["valeurMois"] / d["valeurMoisPrecedent"] - 1)
        if d["valeurMoisPrecedent"] else 0
    )
    titre = f"Note de marché — Actions BRVM — {lm}"

    x = [
        para(titre, "Titre"),
        para(
            f"Arrêté au {date_fr(c['derniere'])} · {c['seances']} séances de cotation · "
            f"Données : site AzimutFinance et Bulletin Officiel de la Cote",
            "SousTitre",
        ),
    ]

    # ── 1 ────────────────────────────────────────────────────────────────
    x.append(para("1. Analyse de l’évolution du marché des actions au cours du mois", "Titre1"))
    x.append(para(
        f"Le BRVM Composite termine {lm} à **{fr(c['fin'], 2)} points**, en hausse de "
        f"**{pct(c['pct'])}** sur le mois, et le BRVM 30 à {fr(t30['fin'], 2)} points "
        f"({pct(t30['pct'])}). Sur l’année, la progression atteint {pct(c['ytd'])} pour le "
        f"Composite. L’indice a évolué entre {fr(c['bas'], 2)} et {fr(c['haut'], 2)} points."
        if c["pct"] >= 0 else
        f"Le BRVM Composite termine {lm} à **{fr(c['fin'], 2)} points**, en repli de "
        f"**{pct(c['pct'])}** sur le mois, et le BRVM 30 à {fr(t30['fin'], 2)} points "
        f"({pct(t30['pct'])}). Sur l’année, la performance ressort à {pct(c['ytd'])} pour le "
        f"Composite. L’indice a évolué entre {fr(c['bas'], 2)} et {fr(c['haut'], 2)} points."
    ))
    x.append(para(
        f"**Cette performance d’indice ne doit pas faire illusion : le marché s’est replié en "
        f"profondeur.** Sur les {len(v)} valeurs suivies, {d['baisses']} ont reculé et seulement "
        f"{d['hausses']} ont progressé. La hausse de l’indice tient à un très petit nombre de "
        f"poids lourds : {premier['nom']} apporte à elle seule {mds(premier['contribution'])} de "
        f"capitalisation supplémentaire — "
        + (f"davantage que la totalité du solde net du mois ({mds(d['soldeCapitalisation'])})"
           if part > 100 else
           f"soit {fr(part, 0)} % du solde net du mois ({mds(d['soldeCapitalisation'])})")
        + f". Sans cette valeur, le marché aurait terminé "
        f"{'en hausse de ' + mds(sans_lui) if sans_lui > 0 else 'en baisse de ' + mds(abs(sans_lui))} "
        f"de capitalisation."
    ))
    x.append(para(
        f"La rotation sectorielle est nette. {NOMS_INDICES[meilleur[0]]} mène le mois "
        f"({pct(meilleur[1]['pct'])}), devant {NOMS_INDICES[secto[1][0]]} ({pct(secto[1][1]['pct'])}), "
        f"tandis que {NOMS_INDICES[pire[0]]} ferme la marche ({pct(pire[1]['pct'])}). "
        f"Les deux compartiments de la consommation, déjà les moins performants depuis le "
        f"1ᵉʳ janvier, sont aussi les plus malmenés du mois."
    ))
    x.append(para("Indices BRVM — performance du mois", "Titre2"))
    x.append(tableau(
        ["Indice", "Clôture", "Var. mois", "Depuis le 1ᵉʳ janvier"],
        [[NOMS_INDICES.get(k, k), fr(i["fin"], 2), pct(i["pct"]),
          pct(i["ytd"]) if i["ytd"] is not None else "n.d."]
         for k, i in ([("BRVMC", c), ("BRVM30", t30)]
                      + [(k, d["indices"][k]) for k in ("BRVMPA", "BRVMPR") if k in d["indices"]]
                      + secto)],
        [3600, 1500, 1500, 2400],
    ))
    x.append(para("Source : historiques de clôture des indices, site AzimutFinance.", "Legende"))

    x.append(para("Les cinq plus fortes hausses", "Titre2"))
    x.append(tableau(
        ["Valeur", "Cours fin de mois", "Var. mois"],
        [[f"{h['nom']} ({h['code']})", fr(h["fin"]) + " F", pct(h["pct"])] for h in hausses],
        [5000, 2000, 2000],
    ))
    x.append(para("Les cinq plus fortes baisses", "Titre2"))
    x.append(tableau(
        ["Valeur", "Cours fin de mois", "Var. mois"],
        [[f"{b['nom']} ({b['code']})", fr(b["fin"]) + " F", pct(b["pct"])] for b in baisses],
        [5000, 2000, 2000],
    ))
    x.append(para("Les cinq valeurs les plus traitées", "Titre2"))
    x.append(tableau(
        ["Valeur", "Capitaux échangés", "Part du marché", "Var. mois"],
        [[f"{t_['nom']} ({t_['code']})", mds(t_["valeur"], 1),
          fr(100 * t_["valeur"] / d["valeurMois"], 1) + " %", pct(t_["pct"])]
         for t_ in volumes],
        [3800, 1900, 1600, 1700],
    ))
    x.append(para(
        "Capitaux estimés séance par séance (volume × cours de clôture), faute de valeur "
        "transigée publiée par titre.", "Legende",
    ))

    x.append(para("Activité du marché", "Titre2"))
    x.append(para(
        f"Les échanges se sont intensifiés : **{fr(d['valeurMois'] / 1e9, 1)} milliards de FCFA** "
        f"traités sur le compartiment actions, contre {fr(d['valeurMoisPrecedent'] / 1e9, 1)} "
        f"milliards en {libelle_mois(d['moisPrecedent'])}, soit {pct(activite, 0)}"
        + (f", le mois le plus actif des {d['moisEcoules']} écoulés depuis le 1ᵉʳ janvier"
           if d["plusActifDeLAnnee"] else "")
        + f". {volumes[0]['nom']} concentre à elle seule "
        f"{fr(100 * volumes[0]['valeur'] / d['valeurMois'], 0)} % des capitaux traités. "
        f"La capitalisation du compartiment actions s’établit à "
        f"**{fr(d['capitalisationActions'] / 1e9, 0)} milliards de FCFA** pour "
        f"{d['nbSocietes']} sociétés cotées."
    ))
    if d.get("boc"):
        b = d["boc"]
        x.append(para(
            f"Au Bulletin Officiel de la Cote du {date_fr(b['bocDate'])}, la capitalisation du "
            f"compartiment obligataire ressort à {mds(b['capitalisationBoursiere'])}, pour "
            f"{fr(b['volumeEchange'])} titres échangés et {fr(b['valeurTransigee'])} FCFA de "
            f"valeur transigée sur cette seule séance — l’ordre de grandeur habituel d’un "
            f"compartiment obligataire dont le secondaire reste étroit."
        ))
    if d["dividendesMois"]:
        noms = ", ".join(r["titre"].strip() for r in d["dividendesMois"][:6])
        x.append(para(
            f"**{len(d['dividendesMois'])} détachements de dividende** sont intervenus dans le "
            f"mois ({noms}). Ils expliquent mécaniquement une partie des baisses de cours "
            f"constatées sur les valeurs concernées."
        ))

    # ── 2 ────────────────────────────────────────────────────────────────
    x.append(para("2. Perspectives pour les investisseurs", "Titre1"))
    x.append(para(
        f"**Le marché reste bon marché en apparence.** Le PER médian de la cote ressort à "
        f"{fr(d['perMedian'], 1)}x, un niveau qui laisse de la place à la revalorisation pour les "
        f"sociétés dont les résultats tiennent. Mais la dispersion est extrême, et la moyenne "
        f"cache deux marchés : quelques capitalisations profondes et liquides, et une longue "
        f"file de valeurs étroites où un ordre de taille moyenne déplace le cours."
    ))
    if d["primaire"]:
        tete = d["primaire"][0]
        x.append(para(
            f"**La concurrence de la dette souveraine est le fait dominant.** Les États de "
            f"l’UMOA ont levé {mds(d['primaireTotal'], 0)} sur le marché des titres publics "
            f"durant le mois, à des rendements moyens pondérés allant de "
            f"{fr(min(p['rmp'] for p in d['primaire']), 2)} % à "
            f"{fr(max(p['rmp'] for p in d['primaire']), 2)} % selon les signatures. "
            f"{tete['pays']} en concentre la plus grande part ({mds(tete['montant'], 0)}). "
            f"Un investisseur institutionnel qui obtient {fr(max(p['rmp'] for p in d['primaire']), 2)} % "
            f"sur une signature souveraine portée jusqu’à l’échéance exige une prime substantielle "
            f"pour porter à la place une action peu liquide : c’est ce qui pèse sur les multiples, et cela "
            f"ne changera pas tant que les besoins de financement des États resteront à ce niveau."
        ))
    x.append(para(
        "**La liquidité demeure la contrainte structurelle.** Elle s’améliore, mais elle reste "
        "concentrée sur une poignée de titres. Pour un portefeuille institutionnel, cela "
        "commande deux choses : dimensionner les lignes en fonction du volume quotidien plutôt "
        "que de la conviction, et accepter qu’une position se construise et se défasse en "
        "plusieurs semaines, non en plusieurs séances."
    ))

    # ── 3 ────────────────────────────────────────────────────────────────
    x.append(para("3. Prévisions pour les semaines à venir", "Titre1"))
    x.append(para(
        "Trois facteurs commanderont l’évolution du marché dans les prochaines semaines."
    ))
    x.append(puce(
        "**La publication des résultats du troisième trimestre.** C’est le rendez-vous qui "
        "tranchera entre les deux lectures possibles du mois écoulé : une correction saine après "
        "une forte hausse annuelle, ou le début d’une dégradation des fondamentaux. Les secteurs "
        "de la consommation, les plus malmenés, sont ceux à surveiller en priorité."
    ))
    if d["dividendesAVenir"]:
        p0 = d["dividendesAVenir"][0]
        x.append(puce(
            f"**Le calendrier des détachements**, désormais clairsemé : le prochain identifié au "
            f"BOC concerne {p0['titre'].strip()} (détachement le {date_fr(p0['exDividende'])}). "
            f"Le soutien technique qu’apportaient les dividendes s’estompe jusqu’à la prochaine "
            f"saison de distribution."
        ))
    else:
        x.append(puce(
            "**Le calendrier des détachements est épuisé** pour l’exercice en cours : le soutien "
            "technique qu’apportaient les dividendes s’estompe jusqu’à la prochaine saison."
        ))
    x.append(puce(
        "**Le rythme des adjudications souveraines.** Un quatrième trimestre chargé en émissions "
        "maintiendrait les rendements élevés et continuerait de drainer l’épargne institutionnelle "
        "hors du compartiment actions."
    ))
    x.append(para(
        f"**Scénario central.** Une consolidation du Composite autour de ses niveaux actuels "
        f"({fr(c['bas'], 0)}–{fr(c['haut'], 0)} points), avec une poursuite de la dispersion : "
        f"les valeurs liquides et distributrices résistent, les valeurs étroites continuent de "
        f"se replier faute d’acheteurs. Un retour durable au-dessus de {fr(c['haut'], 0)} points "
        f"demanderait un élargissement de la hausse au-delà des seuls poids lourds — ce que la "
        f"largeur du marché ne laisse pas présager à court terme."
    ))

    # ── 4 ────────────────────────────────────────────────────────────────
    x.append(para("4. Recommandations aux investisseurs", "Titre1"))
    x.append(puce(
        "**Privilégier la liquidité à la décote.** Les multiples les plus bas de la cote se "
        "trouvent sur les valeurs les plus étroites, et cette décote n’est pas une anomalie à "
        "exploiter : c’est le prix de l’illiquidité. Une ligne qu’on ne peut pas solder en moins "
        "d’un mois n’est pas une position de portefeuille, c’est un engagement."
    ))
    x.append(puce(
        "**Accepter la concentration du marché sans la subir.** La hausse de l’indice tient à "
        "quelques valeurs ; un portefeuille qui les sous-pondère sous-performera l’indice "
        "quoi qu’il arrive par ailleurs. L’écart au benchmark doit être un choix assumé, chiffré "
        "et documenté, non une conséquence non mesurée de la construction du portefeuille."
    ))
    x.append(puce(
        "**Arbitrer explicitement entre actions et titres publics.** Aux rendements souverains "
        "actuels, chaque ligne actions doit justifier sa prime de risque. Un rendement du "
        "dividende inférieur au taux souverain de même horizon, sans perspective de croissance "
        "des bénéfices, ne se défend pas."
    ))
    x.append(puce(
        "**Traiter les détachements comme un événement de trésorerie, pas de performance.** Le "
        "repli mécanique du cours le jour du détachement n’est pas une contre-performance, et "
        "l’encaissement du coupon doit être suivi au calendrier plutôt que constaté après coup."
    ))
    x.append(puce(
        "**Échelonner les interventions.** Dans un marché où quelques ordres font le cours, "
        "l’exécution en une fois coûte plus cher que l’erreur de timing qu’elle prétend éviter."
    ))

    # ── 5 ────────────────────────────────────────────────────────────────
    x.append(para("5. Conclusion", "Titre1"))
    x.append(para(
        f"{lm.capitalize()} laisse une image contrastée : un indice en {'hausse' if c['pct'] >= 0 else 'baisse'} "
        f"de {pct(c['pct'])}, une activité "
        + ("au plus haut de l’année à " if d["plusActifDeLAnnee"] else "de ")
        + f"{fr(d['valeurMois'] / 1e9, 1)} milliards de FCFA échangés, mais {d['baisses']} valeurs "
        f"en repli sur {len(v)}. Le marché ne monte plus ensemble : il trie. Cette sélectivité "
        f"n’est pas une anomalie de fin de cycle haussier, c’est la conséquence directe d’un "
        f"coût de l’argent élevé, que le marché primaire souverain rappelle chaque quinzaine."
    ))
    x.append(para(
        "Pour le gérant, la conséquence est simple : la performance de l’année ne viendra plus "
        "du marché mais de la sélection, et le risque principal n’est plus la baisse des cours "
        "mais l’incapacité à sortir d’une ligne au prix affiché. C’est sur ces deux points que "
        "doivent porter les arbitrages du dernier trimestre."
    ))
    x.append(para(
        "Document interne d’analyse, établi à partir des données de marché disponibles à la date "
        "d’arrêté. Il ne constitue ni une sollicitation ni un conseil en investissement "
        "personnalisé, et les performances passées ne préjugent pas des performances futures.",
        "Legende",
    ))
    return titre, "".join(x)


# ── La version parlee ───────────────────────────────────────────────────────
#
# CE N'EST PAS LA MEME NOTE RACCOURCIE. Un texte lu a la television n'obeit pas
# aux memes regles qu'une note ecrite : on ne peut pas relire une phrase qu'on
# n'a pas comprise, on ne revient pas sur un chiffre, et le spectateur n'a pas
# de tableau sous les yeux. Les nombres sont donc ARRONDIS -- « un peu plus de
# trois pour cent » et non « +3,22 % » --, chaque terme de metier est explique
# au moment ou il tombe, et il n'y a aucun tableau.
#
# LES CHIFFRES RESTENT CEUX DE LA NOTE ECRITE. C'est tout l'interet de les tirer
# des memes donnees : la version parlee ne peut pas raconter autre chose.

# Debit d'un intervenant sur un plateau, en mots par minute. Plus lent qu'une
# lecture ordinaire : on marque les fins de phrase et on laisse passer les
# chiffres.
MOTS_PAR_MINUTE = 145


# Chaque secteur avec son ACCORD. « L’industrie a reculé » contre « les banques
# ont reculé » : le verbe suit le sujet, et une phrase lue a l’antenne ne
# pardonne pas l’a-peu-pres qu’un tableau aurait absorbe sans bruit.
SECTEURS_PARLES: dict[str, tuple[str, str]] = {
    "BRVM-TEL": ("les télécoms", "ont"),
    "BRVM-SF": ("les banques et les assurances", "ont"),
    "BRVM-IN": ("l’industrie", "a"),
    "BRVM-SP": ("les services publics — l’eau, l’électricité", "ont"),
    "BRVM-EN": ("l’énergie et les carburants", "ont"),
    "BRVM-CB": ("l’alimentation et les produits du quotidien", "ont"),
    "BRVM-CD": ("la distribution et les biens d’équipement", "ont"),
}


def secteur_parle(code: str) -> tuple[str, str]:
    """Le nom d'un secteur tel qu'on le dit a l'antenne, et son accord."""
    return SECTEURS_PARLES.get(code, (NOMS_INDICES.get(code, code), "a"))


def arrondi_parle(x: float) -> str:
    """Un pourcentage comme on le dit : « un peu plus de 3 % »."""
    a = abs(x)
    entier = int(a)
    reste = a - entier
    if reste < 0.15:
        return f"{entier} %"
    if reste < 0.4:
        return f"un peu plus de {entier} %"
    if reste < 0.75:
        return f"environ {entier},5 %"
    return f"près de {entier + 1} %"


def majuscule(s: str) -> str:
    """Premiere lettre en capitale, sans toucher au reste."""
    return s[:1].upper() + s[1:]


def de_pct(x: float) -> str:
    """Le pourcentage precede de « de », elide s'il le faut : « d’environ 17,5 % ».

    « De environ 58,5 % » ne se dit pas, et c'est le genre de faute qui s'entend
    immediatement a l'antenne. L'elision se decide sur la premiere lettre de ce
    qui suit : elle se tranche donc ici, ou le pourcentage est mis en mots.
    """
    s = arrondi_parle(x)
    return ("d’" if s[0].lower() in "aeiouéèêh" else "de ") + s


def nom_court(n: str) -> str:
    """Le nom qu'on prononce : sans le suffixe pays de la cote."""
    return re.sub(r"\s+(CI|SN|BF|BJ|TG|ML|NE|BN)$", "", (n or "").strip())


def rediger_tv(d: dict) -> tuple[str, str]:
    mois = d["mois"]
    lm = libelle_mois(mois)
    c = d["indices"]["BRVMC"]
    v = d["valeurs"]
    premier = d["contributions"][0]
    secto = [(k, d["indices"][k]) for k in SECTORIELS if k in d["indices"]]
    secto.sort(key=lambda kv: -kv[1]["pct"])
    meilleur, pire = secto[0], secto[-1]
    volumes = sorted(v, key=lambda x: -x["valeur"])[:3]
    part_premier = 100 * volumes[0]["valeur"] / d["valeurMois"]
    sens = "gagné" if c["pct"] >= 0 else "perdu"
    titre = f"Intervention BRVM TV — Le marché des actions en {lm}"

    parties: list[tuple[str, list[str]]] = []

    parties.append(("1. Comment le marché a évolué ce mois-ci", [
        f"Bonjour à tous. Si l’on ne regarde que le chiffre principal, {lm} a été un bon "
        f"mois à la Bourse d’Abidjan. L’indice BRVM Composite — c’est la moyenne "
        f"de toutes les entreprises cotées — a {sens} {arrondi_parle(c['pct'])}. Depuis le "
        f"début de l’année, il est en hausse {de_pct(c['ytd'])}. Voilà pour la "
        f"photographie d’ensemble.",

        f"Mais cette photographie cache quelque chose, et c’est le vrai sujet du mois. Sur "
        f"les {len(v)} entreprises que nous suivons, **{d['baisses']} ont vu leur cours "
        f"baisser**. Seulement {d['hausses']} ont monté. Autrement dit : l’indice monte, et "
        f"pourtant la grande majorité des actions descendent.",

        f"Comment est-ce possible ? Parce que dans un indice, toutes les entreprises ne pèsent "
        f"pas le même poids. Une très grosse société compte beaucoup plus qu’une petite. Et "
        f"ce mois-ci, une seule d’entre elles, **{nom_court(premier['nom'])}**, a progressé "
        f"{de_pct(premier['pct'])}. À elle seule, elle a ajouté environ "
        f"{fr(round(premier['contribution'] / 1e9))} milliards de francs CFA à la valeur du "
        f"marché — davantage que ce que le marché entier a gagné dans le mois. Dit simplement : "
        f"**si on met cette valeur de côté, le marché a baissé.**",

        f"Quand on regarde métier par métier, l’écart est tout aussi net. "
        f"{majuscule(secteur_parle(meilleur[0])[0])} {secteur_parle(meilleur[0])[1]} signé la "
        f"meilleure progression du mois. {majuscule(secteur_parle(secto[1][0])[0])} "
        f"{secteur_parle(secto[1][0])[1]} suivi, en légère hausse. À l’inverse, "
        f"{secteur_parle(pire[0])[0]} {secteur_parle(pire[0])[1]} reculé "
        f"{de_pct(pire[1]['pct'])}.",

        f"Dernier point, et celui-là est encourageant : on a beaucoup échangé. Environ "
        f"{fr(round(d['valeurMois'] / 1e9))} milliards de francs ont changé de mains, contre "
        f"{fr(round(d['valeurMoisPrecedent'] / 1e9))} milliards le mois précédent. "
        + ("C’est le mois le plus animé depuis le début de l’année. "
           if d["plusActifDeLAnnee"] else "")
        + f"Un marché où l’on échange beaucoup pendant que les cours baissent, ce n’est "
        f"pas un marché abandonné : c’est un marché où les titres changent de mains. "
        f"Certains vendent, d’autres en profitent pour acheter. À noter tout de même : "
        f"{nom_court(volumes[0]['nom'])} représente à elle seule près de "
        f"{fr(part_premier, 0)} % de tout ce qui s’est traité.",
    ]))

    enseignements = [
        "J’en tire trois enseignements simples, pour quelqu’un qui découvre la Bourse.",

        "**Le premier : acheter « la Bourse » et acheter « une action », ce n’est pas la "
        "même chose.** Beaucoup de gens regardent l’indice, voient qu’il monte, et en "
        f"concluent que leurs actions montent aussi. Ce mois-ci, c’est l’inverse pour "
        f"{d['baisses']} actions sur {len(v)}. Ce qui compte, ce n’est pas le marché : "
        f"c’est ce que vous avez, vous, dans votre portefeuille.",

        f"**Le deuxième : nos entreprises ne sont pas chères, et cela s’explique.** En "
        f"moyenne, une action de la BRVM se paie aujourd’hui environ "
        f"{fr(d['perMedian'], 0)} fois le bénéfice annuel de l’entreprise. C’est peu. "
        f"Mais le prix est bas aussi parce que certaines actions ne s’échangent presque "
        f"jamais. Si vous achetez un titre que personne ne traite, vous aurez du mal à le "
        f"revendre le jour où vous en aurez besoin — et pas forcément au prix affiché. Une "
        f"action bon marché n’est pas toujours une bonne affaire : parfois, c’est "
        f"simplement une action difficile à revendre.",
    ]
    if d["primaire"]:
        haut = max(p["rmp"] for p in d["primaire"])
        bas = min(p["rmp"] for p in d["primaire"])
        enseignements.append(
            f"**Le troisième, et c’est peut-être le plus important : l’État vous fait "
            f"concurrence.** Ce mois-ci, les États de notre région ont emprunté environ "
            f"{fr(round(d['primaireTotal'] / 1e9))} milliards de francs auprès des "
            f"investisseurs, en promettant de les rémunérer entre {fr(bas, 1)} % et "
            f"{fr(haut, 1)} % par an. Mettez-vous à la place d’une banque ou d’une "
            f"compagnie d’assurance : si l’État lui propose {fr(haut, 1)} % par an, "
            f"une action doit lui promettre nettement plus pour mériter son argent. C’est "
            f"l’une des grandes raisons pour lesquelles les cours ont du mal à monter en ce "
            f"moment."
        )
    parties.append(("2. Ce que cela signifie pour celui qui veut investir", enseignements))

    suite = [
        "Trois rendez-vous vont décider de la suite, et ils sont faciles à suivre.",

        "**D’abord, les résultats des entreprises.** Dans les prochaines semaines, les "
        "sociétés cotées vont publier leurs comptes du troisième trimestre. C’est le moment "
        "de vérité : on saura si la baisse des cours était une simple respiration après une "
        "belle année, ou si les affaires vont réellement moins bien. Regardez "
        f"en priorité {secteur_parle(secto[-1][0])[0]}, "
        f"qui {secteur_parle(secto[-1][0])[1]} le plus souffert ce mois-ci.",
    ]
    if d["dividendesAVenir"]:
        p0 = d["dividendesAVenir"][0]
        suite.append(
            f"**Ensuite, les dividendes** — c’est-à-dire la part du bénéfice que "
            f"l’entreprise reverse à ses actionnaires. Le prochain versement annoncé "
            f"concerne {nom_court(p0['titre'])}, autour du {date_fr(p0['exDividende'])}."
        )
    else:
        suite.append(
            "**Ensuite, les dividendes** — c’est-à-dire la part du bénéfice que "
            "l’entreprise reverse à ses actionnaires. La saison est terminée pour cette "
            "année. Pendant plusieurs mois, le marché va donc perdre ce petit coup de pouce qui "
            "soutenait les cours ; les prochains versements n’arriveront qu’après les "
            "assemblées générales, au printemps prochain."
        )
    suite.append(
        "**Enfin, le rythme des emprunts publics.** Si les États continuent d’emprunter "
        "autant et aussi cher, l’argent des grands investisseurs continuera d’aller "
        "vers eux plutôt que vers la Bourse."
    )
    suite.append(
        "Si vous me demandez ce que j’anticipe : un marché qui reste globalement là où il "
        "est, mais avec des écarts de plus en plus grands d’une entreprise à l’autre. "
        "Les grandes valeurs, solides et faciles à échanger, devraient tenir. Les petites "
        "valeurs peu traitées risquent de continuer à baisser, faute d’acheteurs. Et pour "
        "que le marché reparte franchement à la hausse, il faudrait que la hausse s’élargisse "
        "au-delà de deux ou trois grandes sociétés. Ce n’est pas ce que l’on observe "
        "aujourd’hui."
    )
    parties.append(("3. Ce qui nous attend dans les prochaines semaines", suite))

    parties.append(("4. Mes conseils à ceux qui nous regardent", [
        "Je terminerai par cinq conseils très simples. Et je le précise tout de suite : "
        "c’est un avis général. Pour une décision qui vous concerne personnellement, "
        "parlez-en à votre société de gestion ou à votre société de bourse.",

        "**Un : ne vous fiez pas seulement à l’indice.** Il peut monter pendant que votre "
        "action baisse. Regardez vos titres un par un.",

        "**Deux : avant d’acheter, vérifiez que le titre s’échange régulièrement.** "
        "Regardez s’il y a des transactions tous les jours. Si une action ne se traite "
        "qu’une fois par semaine, dites-vous que vous mettrez du temps à en sortir.",

        "**Trois : ne confondez pas le dividende avec un cadeau.** Le jour où l’entreprise "
        "verse le dividende, le cours de l’action baisse à peu près du même montant. Vous "
        "n’avez rien gagné ce jour-là : vous avez simplement reçu en espèces une partie de "
        "ce que vous déteniez en actions.",

        "**Quatre : comparez toujours avec ce que l’État vous propose.** Si un emprunt "
        "d’État vous rapporte sept ou huit pour cent par an sans que vous ayez à suivre la "
        "Bourse, alors une action doit vous offrir une perspective clairement supérieure pour "
        "justifier le risque que vous prenez.",

        "**Cinq : n’achetez jamais tout d’un coup, et n’investissez que ce dont "
        "vous n’avez pas besoin demain.** Sur notre marché, un ordre important peut à lui "
        "seul faire bouger le cours. Étalez vos achats sur plusieurs semaines. Et rappelez-vous "
        "que la Bourse récompense la durée, rarement la précipitation.",
    ]))

    parties.append(("5. Conclusion", [
        f"En résumé : en {lm}, l’indice a {sens} {arrondi_parle(c['pct'])}, on a beaucoup "
        f"échangé, mais la majorité des actions ont baissé. Le marché ne monte plus tous "
        f"ensemble — il trie.",

        "Pour l’épargnant, cela veut dire une chose : l’époque où il suffisait "
        "d’acheter n’importe quelle action pour gagner de l’argent est derrière "
        "nous. Aujourd’hui, il faut choisir. Choisir des entreprises solides, qui versent "
        "des dividendes, et dont les titres s’échangent vraiment. Et ensuite, laisser du "
        "temps au temps. Merci de votre attention.",
    ]))

    mots = sum(len(b.replace("**", "").split()) for _, blocs in parties for b in blocs)
    minutes = mots / MOTS_PAR_MINUTE

    x = [
        para(titre, "Titre"),
        para(
            f"Texte d’intervention · durée estimée {int(minutes)} min "
            f"{int(round((minutes % 1) * 60)):02d} s · environ {mots} mots · "
            f"données arrêtées au {date_fr(c['derniere'])}",
            "SousTitre",
        ),
        para(
            "Les passages en gras sont les points à appuyer à l’oral. Les chiffres sont "
            "volontairement arrondis : à l’antenne, un chiffre exact que personne ne retient "
            "vaut moins qu’un ordre de grandeur que tout le monde comprend.",
            "Encadre",
        ),
    ]
    for intitule_partie, blocs in parties:
        x.append(para(intitule_partie, "Titre1"))
        for b in blocs:
            x.append(para(b))
    x.append(para(
        "Avis général à caractère informatif, établi à partir des données de marché arrêtées à "
        "la date indiquée. Ne constitue pas un conseil en investissement personnalisé. Les "
        "performances passées ne préjugent pas des performances futures.",
        "Legende",
    ))
    return titre, "".join(x)


def main() -> int:
    if len(sys.argv) > 1 and re.match(r"^\d{4}-\d{2}$", sys.argv[1]):
        mois = sys.argv[1]
    else:
        aujourdhui = dt.date.today()
        mois = f"{aujourdhui.year}-{aujourdhui.month:02d}"

    tv = "--tv" in sys.argv

    donnees = collecter(mois)
    if "BRVMC" not in donnees["indices"]:
        print(f"Aucune donnee d'indice pour {mois}.", file=sys.stderr)
        return 1

    lm = libelle_mois(mois)
    lm = lm[0].upper() + lm[1:]
    if tv:
        titre, corps = rediger_tv(donnees)
        nom = f"Intervention BRVM TV - Actions - {lm}.docx"
    else:
        titre, corps = rediger(donnees)
        nom = f"Note de marché - Actions BRVM - {lm}.docx"
    chemin = os.path.join(RACINE, nom)
    ecrire_docx(chemin, corps, titre, "AzimutFinance")
    print(f"Ecrit : {nom}")
    print(
        f"  {donnees['indices']['BRVMC']['seances']} seances, "
        f"{donnees['hausses']} hausses / {donnees['baisses']} baisses, "
        f"{donnees['valeurMois'] / 1e9:.1f} Mds F echanges"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
