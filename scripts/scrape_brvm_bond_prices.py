#!/usr/bin/env python3
"""
Snapshot quotidien des cours obligataires cotes BRVM -> data/obligations-cotees-prix.csv

Tourne chaque jour ouvre a 15h UTC (cf. .github/workflows/scrape-brvm-bond-prices.yml).
Pour chaque obligation cotee :
  1. clean price = "Cours du jour en valeur" scrape depuis
     https://www.brvm.org/fr/cours-obligations/0 (meme source que lib/brvm/liveBonds.ts).
  2. dirty price = clean + interets courus, calcules avec EXACTEMENT la meme
     formule que le site (lib/listedBondsTypes.ts : buildBondCashflowSchedule +
     priceFromBondSchedule, convention Act/Act ICMA lineaire) :
         accrued        = periodicCoupon * daysSinceLastCoupon / daysInPeriod
         periodicCoupon = nominalValue * couponRate / couponFrequency
  3. volume / transactions : laisses a 0. Le BOC du jour J n'est publie qu'en
     soiree -> ces deux colonnes sont completees par le backfill de
     scripts/scrape_brvm_boc.py (cf. backfill_bond_prices).

Le referentiel (taux, frequence, dates, VN courante) vient de
data/obligations-cotees.csv + data/obligations-cotees-vn-boc.csv, exactement
comme loadListedBonds() cote site.

Dependances : pip install requests
Usage :
    python scripts/scrape_brvm_bond_prices.py                  # date du jour (UTC)
    python scripts/scrape_brvm_bond_prices.py --date 2026-05-14 # date precise
"""

from __future__ import annotations

import argparse
import calendar
import csv
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
BONDS_CSV = DATA_DIR / "obligations-cotees.csv"
VN_BOC_CSV = DATA_DIR / "obligations-cotees-vn-boc.csv"
PRICES_CSV = DATA_DIR / "obligations-cotees-prix.csv"

BRVM_URL = "https://www.brvm.org/fr/cours-obligations/0"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*",
}

# Schema fige du CSV de sortie (cf. ListedBondPriceRow dans lib/dataLoader.ts).
PRICE_COLUMNS = ["isin", "date", "cleanPrice", "dirtyPrice", "volume", "transactions"]

# Convention BRVM : nominal d'origine par titre.
INITIAL_NOMINAL_PER_TITRE = 10_000


# =============================================================================
# HELPERS — parsing nombres / dates (portage de lib/brvm/liveQuotes.ts +
# lib/listedBondsTypes.ts pour garantir des resultats identiques au site)
# =============================================================================

def parse_french_number(raw: str) -> float | None:
    """'10 000' -> 10000.0, '9 795,50' -> 9795.5. None si non parsable.

    Portage de parseFrenchNumber (lib/brvm/liveQuotes.ts)."""
    if not raw:
        return None
    cleaned = (
        raw.replace(" ", " ")
        .replace(" ", " ")
        .replace("&nbsp;", " ")
        .replace("+", "")
        .replace("%", "")
        .strip()
    )
    negative = cleaned.startswith("-")
    stripped = re.sub(r"\s", "", cleaned.lstrip("-")).replace(",", ".")
    if not stripped:
        return None
    try:
        n = float(stripped)
    except ValueError:
        return None
    return -n if negative else n


def strip_tags(html: str) -> str:
    """Portage de stripTags (lib/brvm/liveQuotes.ts)."""
    s = re.sub(r"<[^>]+>", " ", html)
    s = s.replace("&amp;", "&").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", s).strip()


def parse_iso_date(s: str) -> date | None:
    """Accepte YYYY-MM-DD et DD/MM/YYYY (ou DD-MM-YYYY).

    Portage de parseISODate (lib/listedBondsTypes.ts)."""
    if not s or not s.strip():
        return None
    clean = s.strip()
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", clean)
    if m:
        y, mo, d = (int(x) for x in m.groups())
    else:
        m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", clean)
        if not m:
            return None
        d, mo, y = (int(x) for x in m.groups())
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def js_add_months(d: date, delta_months: int) -> date:
    """Reproduit JS Date.setUTCMonth : conserve le quantieme, deborde sur le
    mois suivant si la date n'existe pas (ex 31 jan - 1 mois -> 3 mars)."""
    total = (d.year * 12 + (d.month - 1)) + delta_months
    y, m0 = divmod(total, 12)
    m = m0 + 1
    dim = calendar.monthrange(y, m)[1]
    if d.day <= dim:
        return date(y, m, d.day)
    # Debordement facon JS : on pousse dans le mois suivant.
    return date(y, m, dim) + timedelta(days=d.day - dim)


def generate_coupon_dates(issue: date, maturity: date, frequency: int) -> list[date]:
    """Portage de generateCouponDates (lib/listedBondsTypes.ts) : recule depuis
    la maturite par pas de 12/frequency mois jusqu'a depasser l'emission."""
    months_per_period = 12 // frequency
    dates: list[date] = []
    current = maturity
    while current > issue:
        dates.insert(0, current)
        current = js_add_months(current, -months_per_period)
    return dates


def compute_current_nominal_per_titre(
    amortization_type: str,
    amortization_mode: str,
    issue: date | None,
    maturity: date | None,
    first_amort: date | None,
    coupon_frequency: int,
    today: date,
) -> float:
    """Portage de computeCurrentNominalPerTitre (lib/listedBondsTypes.ts).
    Fallback quand le code n'a pas de VN dans obligations-cotees-vn-boc.csv."""
    if issue is None or maturity is None:
        return INITIAL_NOMINAL_PER_TITRE
    if amortization_type == "IF":
        return INITIAL_NOMINAL_PER_TITRE
    if amortization_mode == "T":
        return INITIAL_NOMINAL_PER_TITRE

    coupon_dates = generate_coupon_dates(issue, maturity, coupon_frequency)
    if not coupon_dates:
        return INITIAL_NOMINAL_PER_TITRE

    first_amort_date = first_amort if first_amort is not None else coupon_dates[0]
    one_day = timedelta(days=1)
    all_amort_dates = [d for d in coupon_dates if d >= first_amort_date - one_day]
    total_nb = len(all_amort_dates)
    if total_nb == 0:
        return INITIAL_NOMINAL_PER_TITRE
    nb_past = sum(1 for d in all_amort_dates if d <= today)
    remaining = max(0, total_nb - nb_past)
    return (INITIAL_NOMINAL_PER_TITRE * remaining) / total_nb


def accrued_interest(
    nominal_value: float,
    coupon_rate: float,
    coupon_frequency: int,
    issue: date | None,
    maturity: date | None,
    operation_date: date,
) -> float:
    """Interets courus a `operation_date`, formule identique a
    priceFromBondSchedule + buildBondCashflowSchedule (lib/listedBondsTypes.ts) :

        periodicCoupon = nominalValue * couponRate / couponFrequency
        accrued        = periodicCoupon * daysSinceLastCoupon / daysInPeriod

    avec daysSinceLastCoupon / daysInPeriod calcules sur l'echeancier reel
    (convention Act/Act ICMA lineaire)."""
    if issue is None or maturity is None:
        return 0.0
    if operation_date >= maturity:
        return 0.0
    coupon_dates = generate_coupon_dates(issue, maturity, coupon_frequency)
    if not coupon_dates:
        return 0.0

    past = [d for d in coupon_dates if d <= operation_date]
    previous_coupon = past[-1] if past else issue
    future = [d for d in coupon_dates if d > operation_date]
    next_coupon = future[0] if future else maturity

    days_since_last_coupon = (operation_date - previous_coupon).days
    days_in_period = max(1, (next_coupon - previous_coupon).days)

    periodic_coupon = nominal_value * coupon_rate / coupon_frequency
    return periodic_coupon * days_since_last_coupon / days_in_period


# =============================================================================
# REFERENTIEL — lecture de data/obligations-cotees.csv (+ VN BOC)
# =============================================================================

def normalize_amortization_type(value: str) -> str:
    v = (value or "").strip().upper()
    if v == "IF":
        return "IF"
    if v == "ACD":
        return "ACD"
    return "AC"


def load_boc_nominal_values() -> dict[str, float]:
    """code -> valeur nominale courante (data/obligations-cotees-vn-boc.csv)."""
    out: dict[str, float] = {}
    if not VN_BOC_CSV.exists():
        return out
    with VN_BOC_CSV.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            code = (row.get("code") or "").strip()
            vn = parse_french_number(row.get("valeurNominale") or "")
            if code and vn and vn > 0:
                out[code] = vn
    return out


def load_referential(today: date) -> dict[str, dict]:
    """Construit le referentiel par code mnemonique, en repliquant
    loadListedBonds() (lib/dataLoader.ts) : VN preferentiellement issue du BOC,
    sinon calcul auto ; couponRate en decimal."""
    if not BONDS_CSV.exists():
        print(f"Erreur : {BONDS_CSV} introuvable.", file=sys.stderr)
        return {}

    boc_vn = load_boc_nominal_values()
    ref: dict[str, dict] = {}
    with BONDS_CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            isin = (row.get("isin") or "").strip()
            code = (row.get("code") or "").strip()
            if not isin or not code:
                continue

            issue = parse_iso_date(row.get("issueDate") or "")
            maturity = parse_iso_date(row.get("maturityDate") or "")
            # Le header CSV s'appelle "firstCouponDate" mais la valeur est la
            # 1ere date d'amortissement (cf. commentaire dans loadListedBonds).
            first_amort = parse_iso_date(row.get("firstCouponDate") or "")
            amortization_type = normalize_amortization_type(
                row.get("amortizationType") or ""
            )
            amortization_mode = (
                "T" if (row.get("Titre/Nominal") or "").strip().upper() == "T" else "N"
            )
            freq_raw = parse_french_number(row.get("couponFrequency") or "")
            coupon_frequency = int(freq_raw) if freq_raw in (1, 2, 4) else 1
            rate_raw = parse_french_number(row.get("couponRate") or "")
            coupon_rate = (rate_raw / 100.0) if rate_raw is not None else 0.0

            nominal_value = boc_vn.get(code)
            if nominal_value is None:
                nominal_value = compute_current_nominal_per_titre(
                    amortization_type,
                    amortization_mode,
                    issue,
                    maturity,
                    first_amort,
                    coupon_frequency,
                    today,
                )

            ref[code.upper()] = {
                "isin": isin,
                "couponRate": coupon_rate,
                "couponFrequency": coupon_frequency,
                "issueDate": issue,
                "maturityDate": maturity,
                "nominalValue": nominal_value,
            }
    return ref


# =============================================================================
# SCRAPING — page brvm.org/fr/cours-obligations (portage de lib/brvm/liveBonds.ts)
# =============================================================================

def fetch_brvm_bond_quotes() -> dict[str, float]:
    """code mnemonique -> cours du jour (clean price). Vide si echec/parsing KO.

    Mirroir de parseBondsTable (lib/brvm/liveBonds.ts) : on isole la table qui
    contient "Code obligation" + "Coupon Couru", puis on lit la 5e cellule
    (index 4 = "Cours du jour en valeur") de chaque ligne du tbody."""
    last_err = ""
    html = ""
    for attempt in range(1, 4):
        try:
            r = requests.get(BRVM_URL, headers=HEADERS, timeout=30, verify=False)
            if r.status_code == 200 and r.text:
                html = r.text
                break
            last_err = f"HTTP {r.status_code}"
        except requests.RequestException as e:
            last_err = str(e)
        print(f"  essai {attempt} echoue ({last_err})", file=sys.stderr)
    if not html:
        print(f"Erreur : page BRVM inaccessible ({last_err}).", file=sys.stderr)
        return {}

    tables = re.findall(r"<table[^>]*>[\s\S]*?</table>", html, re.IGNORECASE)
    main_table = None
    for t in tables:
        if re.search(r"Code obligation", t, re.IGNORECASE) and re.search(
            r"Coupon Couru", t, re.IGNORECASE
        ):
            main_table = t
            break
    if main_table is None:
        print("Erreur : table des obligations introuvable dans le HTML.", file=sys.stderr)
        return {}

    tbody = re.search(r"<tbody[^>]*>([\s\S]*?)</tbody>", main_table, re.IGNORECASE)
    if not tbody:
        print("Erreur : <tbody> introuvable dans la table BRVM.", file=sys.stderr)
        return {}

    quotes: dict[str, float] = {}
    for row_html in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", tbody.group(1), re.IGNORECASE):
        cells = [
            strip_tags(c)
            for c in re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_html, re.IGNORECASE)
        ]
        if len(cells) < 7:
            continue
        code = cells[0].strip().upper()
        clean_price = parse_french_number(cells[4])
        if not code or clean_price is None or clean_price <= 0:
            continue
        quotes[code] = clean_price
    return quotes


# =============================================================================
# ECRITURE — upsert dans data/obligations-cotees-prix.csv
# =============================================================================

def _fmt_price(n: float) -> str:
    """Prix : 2 decimales max, zeros de fin supprimes (10000 plutot que 10000.00)."""
    return f"{n:.2f}".rstrip("0").rstrip(".")


def load_existing_prices() -> dict[tuple[str, str], list[str]]:
    """Lit le CSV existant en dictionnaire (isin, date) -> ligne. Dedoublonne
    au passage (le CSV historique contenait des lignes en double)."""
    rows: dict[tuple[str, str], list[str]] = {}
    if not PRICES_CSV.exists():
        return rows
    with PRICES_CSV.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        header = next(reader, None)
        for row in reader:
            if len(row) < 6 or not row[0].strip():
                continue
            rows[(row[0].strip(), row[1].strip())] = row[:6]
    return rows


def write_prices(rows: dict[tuple[str, str], list[str]]) -> None:
    PRICES_CSV.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(rows.values(), key=lambda r: (r[1], r[0]))
    with PRICES_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(PRICE_COLUMNS)
        w.writerows(ordered)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument(
        "--date",
        help="Date du snapshot YYYY-MM-DD (defaut : aujourd'hui UTC).",
    )
    args = ap.parse_args()

    requests.packages.urllib3.disable_warnings()  # type: ignore[attr-defined]

    if args.date:
        snapshot_date = parse_iso_date(args.date)
        if snapshot_date is None:
            print(f"Date invalide : {args.date}", file=sys.stderr)
            return 1
    else:
        snapshot_date = datetime.now(timezone.utc).date()
    date_iso = snapshot_date.isoformat()

    ref = load_referential(snapshot_date)
    if not ref:
        print("Erreur : referentiel obligations vide — abandon.", file=sys.stderr)
        return 1
    print(f"Referentiel : {len(ref)} obligations cotees.", file=sys.stderr)

    quotes = fetch_brvm_bond_quotes()
    if not quotes:
        print(
            "Erreur : aucun cours scrape depuis la BRVM — CSV inchange.",
            file=sys.stderr,
        )
        return 1
    print(f"BRVM : {len(quotes)} cours du jour recuperes.", file=sys.stderr)

    rows = load_existing_prices()
    written = 0
    skipped_unknown = 0
    for code, clean_price in quotes.items():
        bond = ref.get(code)
        if bond is None:
            skipped_unknown += 1
            continue
        accrued = accrued_interest(
            bond["nominalValue"],
            bond["couponRate"],
            bond["couponFrequency"],
            bond["issueDate"],
            bond["maturityDate"],
            snapshot_date,
        )
        dirty_price = clean_price + accrued
        isin = bond["isin"]
        # volume / transactions laisses a 0 : completes le soir par le backfill
        # de scripts/scrape_brvm_boc.py depuis le BOC du jour.
        rows[(isin, date_iso)] = [
            isin,
            date_iso,
            _fmt_price(clean_price),
            f"{dirty_price:.2f}",
            "0",
            "0",
        ]
        written += 1

    if written == 0:
        print(
            "Aucune obligation appariee au referentiel — CSV inchange.",
            file=sys.stderr,
        )
        return 1

    write_prices(rows)
    print(
        f"\n{written} cours ecrits pour le {date_iso} dans "
        f"{PRICES_CSV.relative_to(ROOT)}"
        + (
            f" ({skipped_unknown} codes BRVM hors referentiel ignores)"
            if skipped_unknown
            else ""
        ),
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
