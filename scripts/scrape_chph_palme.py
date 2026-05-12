"""Scraper + extracteur OCR des prix CHPH palmier à huile (Côte d'Ivoire).

Source : Conseil Hévéa-Palmier à Huile (CHPH), régulateur officiel de la
filière palmier à huile en Côte d'Ivoire. Il publie des "Avis aux planteurs"
trimestriels fixant les prix d'achat :
  - huile de palme brute (FCFA / tonne)
  - régime de palme bord-champ (FCFA / tonne)

Pipeline complet :
  1. Parcourt les pages catégorie "palmier-a-huile" de conseilheveapalmier.ci
  2. Identifie les articles "fixation des prix"
  3. Extrait les URLs des PDFs référencés
  4. Télécharge les nouveaux PDFs dans data/chph-palme/
  5. OCR (Tesseract fr) chaque nouveau PDF
  6. Parse le texte pour extraire :
       - la période ("pour les mois de ... AAAA")
       - le prix huile de palme brute
       - le prix régime de palme bord-champ
  7. Met à jour data/chph-palme.csv (une ligne par mois couvert)

Idempotent : les lignes déjà présentes dans le CSV ne sont pas écrasées,
préservant les corrections manuelles éventuelles.

Mode dégradé : si les deps OCR (pytesseract + pdf2image) sont absentes, le
script télécharge les PDFs et liste ceux non traités sans crasher.

Usage:
  python scripts/scrape_chph_palme.py            # cycle complet
  python scripts/scrape_chph_palme.py --force    # force re-OCR de tous les PDFs
"""
from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "data" / "chph-palme"
CSV_PATH = ROOT / "data" / "chph-palme.csv"
BASE_URL = "https://conseilheveapalmier.ci"
CATEGORY_PATH = "/category/palmier-a-huile/"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
CURL_HEADERS = [
    "-A", UA,
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H", "Accept-Language: fr-FR,fr;q=0.9,en;q=0.8",
]

# Try to import OCR deps. Mode dégradé si absentes.
try:
    from pdf2image import convert_from_path  # type: ignore
    import pytesseract  # type: ignore
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


# =============================================================================
# DOWNLOAD : decouverte des articles + PDFs
# =============================================================================

def fetch_html(url: str) -> str:
    cmd = ["curl", "-sL", "--max-time", "30", "--compressed", *CURL_HEADERS, url]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        raise RuntimeError(f"curl exit {out.returncode}: {out.stderr.strip()[:200]}")
    return out.stdout


ARTICLE_RE = re.compile(
    r'href="(https://conseilheveapalmier\.ci/\d{4}/\d{2}/\d{2}/[^"]*(?:fixation|prix|avis)[^"]*?)"',
    re.IGNORECASE,
)
PDF_RE = re.compile(r'href="(https://conseilheveapalmier\.ci/wp-content/uploads/[^"]+\.pdf)"')


def discover_article_urls() -> set[str]:
    urls: set[str] = set()
    for page_num in range(1, 11):
        path = CATEGORY_PATH if page_num == 1 else f"{CATEGORY_PATH}page/{page_num}/"
        try:
            html = fetch_html(BASE_URL + path)
        except Exception as e:
            print(f"  Page {page_num} : {type(e).__name__} {e}")
            break
        found = set(ARTICLE_RE.findall(html))
        if not found:
            print(f"  Page {page_num} : 0 article fixation -> arret")
            break
        new = found - urls
        print(f"  Page {page_num} : {len(found)} articles ({len(new)} nouveaux)")
        urls.update(found)
        time.sleep(0.3)
    return urls


def extract_pdf_urls(article_url: str) -> list[str]:
    try:
        html = fetch_html(article_url)
    except Exception as e:
        print(f"    ! fetch failed : {type(e).__name__} {e}")
        return []
    return list(dict.fromkeys(PDF_RE.findall(html)))


def download_pdf(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["curl", "-sL", "--max-time", "60", "--compressed", *CURL_HEADERS, url, "-o", str(dest)]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0 or not dest.exists() or dest.stat().st_size < 1000:
        if dest.exists():
            dest.unlink()
        print(f"    ! download failed : {url}")
        return False
    return True


# =============================================================================
# OCR + PARSING DES PRIX
# =============================================================================

MONTHS_FR_MAP = {
    "janvier": 1, "janv": 1,
    "février": 2, "fevrier": 2, "fév": 2, "fev": 2,
    "mars": 3,
    "avril": 4, "avr": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7, "juil": 7,
    "août": 8, "aout": 8,
    "septembre": 9, "sept": 9,
    "octobre": 10, "oct": 10,
    "novembre": 11, "nov": 11,
    "décembre": 12, "decembre": 12, "déc": 12, "dec": 12,
}

MONTHS_ORDER_FR = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

# Le bloc "Objet" est suivi de "pour le[s] mois d[e'] ... AAAA"
PERIOD_RE = re.compile(
    r"pour\s+le[s]?\s+mois\s+d[''e]?\s*([^.\n]{3,150}?\d{4})",
    re.IGNORECASE,
)

HUILE_PRICE_RE = re.compile(
    r"huile\s+de\s+palme\s+brute\s*[:\-]?\s*([0-9][0-9\s.]{3,15})\s*(?:f|francs)",
    re.IGNORECASE,
)
REGIME_PRICE_RE = re.compile(
    r"r[eé]gime\s+de\s+palme\s+bord[\s\-]+champ\s*[:\-]?\s*([0-9][0-9\s.]{3,15})\s*(?:f|francs)",
    re.IGNORECASE,
)


def ocr_pdf(path: Path) -> str:
    """Renvoie le texte OCR concaténé de toutes les pages d'un PDF."""
    if not OCR_AVAILABLE:
        return ""
    try:
        images = convert_from_path(str(path), dpi=250)
    except Exception as e:
        print(f"    ! pdf2image: {type(e).__name__} {e}")
        return ""
    parts: list[str] = []
    for img in images:
        try:
            parts.append(pytesseract.image_to_string(img, lang="fra"))
        except Exception as e:
            print(f"    ! tesseract: {type(e).__name__} {e}")
    return "\n".join(parts)


def parse_period(text: str) -> tuple[int, list[int]] | None:
    """Extrait (annee, [num_mois]) depuis le texte OCR."""
    m = PERIOD_RE.search(text)
    if not m:
        return None
    fragment = m.group(1).lower()
    year_m = re.search(r"\b(20\d{2})\b", fragment)
    if not year_m:
        return None
    year = int(year_m.group(1))
    months: list[int] = []
    # Tolérance OCR : chercher tous les mots et matcher contre MONTHS_FR_MAP
    for word in re.findall(r"[a-zéèêûôîàç]+", fragment):
        n = MONTHS_FR_MAP.get(word)
        if n is not None and n not in months:
            months.append(n)
    if not months:
        return None
    return year, months


def parse_price(text: str, pattern: re.Pattern[str]) -> int | None:
    """Extrait un prix entier en FCFA."""
    m = pattern.search(text)
    if not m:
        return None
    digits = "".join(c for c in m.group(1) if c.isdigit())
    if not digits:
        return None
    try:
        value = int(digits)
    except ValueError:
        return None
    # Plausibilité : prix CHPH typiques 50 000 → 1 000 000 FCFA/tonne
    if value < 30000 or value > 2000000:
        return None
    return value


# =============================================================================
# CSV : load + write
# =============================================================================

CSV_HEADER = [
    "date_iso",
    "mois_label",
    "huile_palme_brute_fcfa_tonne",
    "regime_palme_bord_champ_fcfa_tonne",
    "periode_source",
    "source_pdf",
]


def load_csv() -> tuple[dict[str, dict[str, str]], set[str]]:
    """Charge le CSV existant. Retourne (lignes_par_date, set_des_pdfs_traites)."""
    rows: dict[str, dict[str, str]] = {}
    pdfs_done: set[str] = set()
    if not CSV_PATH.exists():
        return rows, pdfs_done
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f, delimiter=";")
        for row in r:
            iso = (row.get("date_iso") or "").strip()
            if not iso:
                continue
            rows[iso] = {k: (row.get(k) or "").strip() for k in CSV_HEADER}
            src = rows[iso].get("source_pdf", "")
            if src:
                pdfs_done.add(src)
    return rows, pdfs_done


def write_csv(rows: dict[str, dict[str, str]]) -> None:
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    sorted_isos = sorted(rows.keys())
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        w.writerow(CSV_HEADER)
        for iso in sorted_isos:
            r = rows[iso]
            w.writerow([r.get(k, "") for k in CSV_HEADER])


def expand_period_to_iso(year: int, months: list[int], pdf_name: str) -> list[dict[str, str]]:
    """Construit les lignes CSV pour chaque mois couvert par une fixation."""
    period_label = " ".join(MONTHS_ORDER_FR[m - 1] for m in months) + f" {year}"
    if len(months) > 1:
        joiner = "-"
        period_label = joiner.join(MONTHS_ORDER_FR[m - 1] for m in months) + f" {year}"
    out: list[dict[str, str]] = []
    for m in months:
        iso = f"{year:04d}-{m:02d}-01"
        out.append({
            "date_iso": iso,
            "mois_label": f"{MONTHS_ORDER_FR[m - 1]} {year}",
            "periode_source": period_label,
            "source_pdf": pdf_name,
        })
    return out


# =============================================================================
# MAIN
# =============================================================================

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true",
                    help="Re-OCR tous les PDFs, écrase les valeurs existantes")
    args = ap.parse_args()

    print(f"Discover articles dans {BASE_URL}{CATEGORY_PATH}")
    article_urls = discover_article_urls()
    print(f"  {len(article_urls)} articles trouves au total\n")

    print("Extraction des PDFs par article :")
    all_pdf_urls: set[str] = set()
    for url in sorted(article_urls):
        title = url.rstrip("/").rsplit("/", 1)[-1][:60]
        pdfs = extract_pdf_urls(url)
        print(f"  {title}... : {len(pdfs)} PDFs")
        all_pdf_urls.update(pdfs)
        time.sleep(0.3)

    print(f"\n{len(all_pdf_urls)} PDFs uniques referenc-es\n")

    print(f"Telechargement vers {PDF_DIR.relative_to(ROOT)}/ :")
    new_downloads: list[str] = []
    for url in sorted(all_pdf_urls):
        fname = url.rsplit("/", 1)[-1]
        dest = PDF_DIR / fname
        if download_pdf(url, dest):
            new_downloads.append(fname)
            print(f"  + {fname}")
        time.sleep(0.3)

    print()
    if not OCR_AVAILABLE:
        print("OCR indisponible (pdf2image/pytesseract non installes)")
        print("Mode degrade : seul le telechargement a ete fait.")
        if new_downloads:
            print(f"\n{len(new_downloads)} nouveau(x) PDF(s) telecharges :")
            for n in new_downloads:
                print(f"  - {n}")
            print("\nA FAIRE : ouvrir les PDFs et completer data/chph-palme.csv manuellement.")
        return 0

    # OCR + extraction
    print("OCR + extraction des prix :")
    rows, pdfs_done = load_csv()
    print(f"  {len(rows)} lignes deja en CSV, {len(pdfs_done)} PDFs deja traites")

    pdfs_to_process = sorted(p for p in PDF_DIR.glob("*.pdf"))
    new_lines = 0
    updated_lines = 0
    failures = 0

    for pdf_path in pdfs_to_process:
        fname = pdf_path.name
        if not args.force and fname in pdfs_done:
            continue

        print(f"  OCR {fname}...")
        text = ocr_pdf(pdf_path)
        if not text:
            print(f"    ! OCR vide")
            failures += 1
            continue

        period = parse_period(text)
        if period is None:
            print(f"    ! periode non detectee")
            failures += 1
            continue
        year, months = period

        huile = parse_price(text, HUILE_PRICE_RE)
        regime = parse_price(text, REGIME_PRICE_RE)
        if huile is None or regime is None:
            print(f"    ! prix manquant (huile={huile} regime={regime})")
            failures += 1
            continue

        period_label = "-".join(MONTHS_ORDER_FR[m - 1] for m in months) + f" {year}"
        print(f"    OK {period_label} : huile={huile} regime={regime}")

        for line in expand_period_to_iso(year, months, fname):
            iso = line["date_iso"]
            if iso in rows and not args.force:
                # Préserve l'existant (corrections manuelles, autres sources)
                continue
            line["huile_palme_brute_fcfa_tonne"] = str(huile)
            line["regime_palme_bord_champ_fcfa_tonne"] = str(regime)
            if iso in rows:
                updated_lines += 1
            else:
                new_lines += 1
            rows[iso] = line

    if new_lines or updated_lines:
        write_csv(rows)
        print(f"\nCSV mis a jour : {new_lines} nouvelle(s), {updated_lines} maj")
    else:
        print("\nCSV deja a jour.")

    if failures:
        print(f"\n! {failures} PDF(s) non extraits (verifier manuellement)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
