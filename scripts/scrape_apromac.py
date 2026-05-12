"""Scrape l'historique des prix du caoutchouc naturel APROMAC.

Source : https://www.eagrici.com/ (page d'accueil).

Le site embarque le tableau JS `PRIX_HISTORIQUES` avec un historique mensuel
de la référence APROMAC depuis janvier 2018 (~102 mois) :

  const PRIX_HISTORIQUES=[
    {annee:2018, prix:[281,282,271,266,...,248]},
    ...
  ];

12 valeurs par année (jan→déc). Pour l'année en cours, les mois futurs sont
`null`, et le mois courant référence `CONFIG.tendance` (constante JS résolue
au scraping).

Note : le site distingue verbalement "tendance marché" et "APROMAC officiel"
dans le tooltip, mais d'après le terrain, la série historique correspond bien
au prix APROMAC mensuel. On la traite donc comme la référence unique.

Sortie : data/apromac.csv au format projet :
  date_iso;mois_label;prix_apromac

Idempotent : merge avec le CSV existant pour préserver les exécutions passées.

Usage:
  python scripts/scrape_apromac.py
"""
from __future__ import annotations

import csv
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_CSV = DATA_DIR / "apromac.csv"
URL = "https://www.eagrici.com/"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)

# Mois français -> numéro
MONTHS_FR = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
}


def fetch_html(url: str) -> str:
    """Récupère le HTML via curl (plus robuste que urllib face à un CDN strict)."""
    cmd = [
        "curl", "-sk", "--fail", "--max-time", "60",
        "-A", UA,
        "-L", url,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        raise RuntimeError(f"curl exit {out.returncode}: {out.stderr.strip()[:200]}")
    return out.stdout


# --- Parser : tableau `PRIX_HISTORIQUES` (historique long APROMAC) ---
HIST_ENTRY_RE = re.compile(r"\{annee:(\d{4}),\s*prix:\[([^\]]+)\]")

# --- CONFIG (bloc JS qui contient les valeurs à jour, plus récentes que
# PRIX_HISTORIQUES dont les derniers slots peuvent encore contenir une tendance) ---
CONFIG_TENDANCE_RE = re.compile(r"tendance:\s*(\d+)")
CONFIG_APROMAC_PRIX_RE = re.compile(r"apromacPrix:\s*(\d+)")
CONFIG_APROMAC_MOIS_RE = re.compile(r"apromacMois:\s*&#39;([A-Za-zéûôÉÛÔ]+)&#39;")
CONFIG_ANNEE_RE = re.compile(r"annee:\s*(\d{4})")
CONFIG_MOIS_RE = re.compile(r"mois:\s*&#39;([A-Za-zéûôÉÛÔ]+)&#39;")

MONTHS_ORDER_FR = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]


def parse_historiques(html: str) -> list[tuple[str, int, int, int, bool]]:
    """Extrait (full_label, year, month_num, value, est_tendance) depuis PRIX_HISTORIQUES.

    Le mois courant est référencé par `CONFIG.tendance` dans le HTML (valeur
    prévisionnelle non confirmée) → est_tendance=True. Tous les autres mois
    sont des prix APROMAC officiels publiés → est_tendance=False.
    Ignore les valeurs `null` (mois futurs sans donnée).
    """
    config_tendance: int | None = None
    cm = CONFIG_TENDANCE_RE.search(html)
    if cm:
        config_tendance = int(cm.group(1))

    out: list[tuple[str, int, int, int, bool]] = []
    for m in HIST_ENTRY_RE.finditer(html):
        year = int(m.group(1))
        values_str = m.group(2)
        tokens = [t.strip() for t in values_str.split(",")]
        for i, tok in enumerate(tokens[:12]):
            if tok == "null":
                continue
            est_tendance = False
            if tok == "CONFIG.tendance":
                if config_tendance is None:
                    continue
                value = config_tendance
                est_tendance = True
            else:
                try:
                    value = int(tok)
                except ValueError:
                    continue
            month_num = i + 1
            full_label = f"{MONTHS_ORDER_FR[i]} {year}"
            out.append((full_label, year, month_num, value, est_tendance))
    return out


def full_to_iso(full: str) -> str:
    """'Mai 2025' -> '2025-05-01' (premier du mois, convention pour données mensuelles)."""
    parts = full.strip().split()
    if len(parts) != 2:
        return ""
    mois_str, annee_str = parts
    mnum = MONTHS_FR.get(mois_str.lower())
    if not mnum:
        return ""
    try:
        return f"{int(annee_str):04d}-{mnum:02d}-01"
    except ValueError:
        return ""


def load_existing(path: Path) -> dict[str, tuple[str, int, bool]]:
    """Charge le CSV existant. Retourne {date_iso: (mois_label, prix_apromac, confirme)}.

    Tolérant aux anciens formats (colonne `prix_marche`, ou pas de `confirme`).
    """
    out: dict[str, tuple[str, int, bool]] = {}
    if not path.exists():
        return out
    with open(path, "r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f, delimiter=";")
        for row in r:
            iso = row.get("date_iso") or ""
            if not iso:
                continue
            raw = (row.get("prix_apromac") or row.get("prix_marche") or "").strip()
            if not raw:
                continue
            try:
                price = int(raw)
            except ValueError:
                continue
            confirme_raw = (row.get("confirme") or "1").strip()
            confirme = confirme_raw not in ("0", "false", "False", "no", "No")
            out[iso] = (row.get("mois_label") or "", price, confirme)
    return out


def main() -> int:
    print(f"Fetch {URL}")
    html = fetch_html(URL)
    print(f"  {len(html):,} chars")

    hist_entries = parse_historiques(html)
    if not hist_entries:
        print("ERREUR : aucune donnée détectée. Le format du site a peut-être changé.")
        return 2
    n_confirmed = sum(1 for e in hist_entries if not e[4])
    n_tendency = sum(1 for e in hist_entries if e[4])
    print(f"  {n_confirmed} mois APROMAC confirmés + {n_tendency} tendance (PRIX_HISTORIQUES)")

    # Override depuis CONFIG : valeur officielle la plus récente (apromacPrix
    # pour apromacMois N) — PRIX_HISTORIQUES peut encore avoir l'ancienne
    # tendance à cette position.
    config_override: tuple[int, int, int] | None = None  # (year, month_num, prix)
    m_prix = CONFIG_APROMAC_PRIX_RE.search(html)
    m_mois = CONFIG_APROMAC_MOIS_RE.search(html)
    m_annee = CONFIG_ANNEE_RE.search(html)
    if m_prix and m_mois and m_annee:
        mois_str = m_mois.group(1).lower()
        mnum = MONTHS_FR.get(mois_str)
        if mnum:
            config_override = (int(m_annee.group(1)), mnum, int(m_prix.group(1)))
            print(f"  CONFIG override : {mois_str.capitalize()} {m_annee.group(1)} = {m_prix.group(1)} FCFA/kg")

    # Charger l'existant pour préserver les exécutions précédentes
    existing = load_existing(OUT_CSV)
    print(f"  {len(existing)} mois déjà dans le CSV")

    merged: dict[str, tuple[str, int, bool]] = dict(existing)
    for full, year, month_num, price, est_tendance in hist_entries:
        iso = f"{year:04d}-{month_num:02d}-01"
        merged[iso] = (full, price, not est_tendance)

    # Appliquer l'override CONFIG.apromacPrix (toujours confirmé)
    if config_override is not None:
        ov_year, ov_month, ov_prix = config_override
        ov_iso = f"{ov_year:04d}-{ov_month:02d}-01"
        ov_full = f"{MONTHS_ORDER_FR[ov_month - 1]} {ov_year}"
        merged[ov_iso] = (ov_full, ov_prix, True)

    new_rows = sum(1 for iso in merged if iso not in existing)
    updated_rows = sum(
        1 for iso, val in merged.items()
        if iso in existing and existing[iso] != val
    )

    sorted_isos = sorted(merged.keys())

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        w.writerow(["date_iso", "mois_label", "prix_apromac", "confirme"])
        for iso in sorted_isos:
            label, price, confirme = merged[iso]
            w.writerow([iso, label, price, "1" if confirme else "0"])

    today = date.today().isoformat()
    print(f"Écrit {OUT_CSV.relative_to(ROOT)} : {len(sorted_isos)} mois "
          f"({new_rows} nouveaux, {updated_rows} maj) — {today}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
