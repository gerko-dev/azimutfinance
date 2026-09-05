#!/usr/bin/env python3
"""
Reconstitue l'historique des cours obligataires cotes depuis les Bulletins
Officiels de la Cote (BOC) archives sur bfin.brvm.org.

Pourquoi : data/obligations-cotees-prix.csv ne demarre qu'au 20/04/2026 —
quatre mois. Les BOC remontent a janvier 2015, et leur table
"OBLIGATIONS CLASSIQUES" est exploitable par les regex de production depuis
2018. On se limite ici a 2023, ou le taux de reconnaissance mesure est de
99 a 100 %.

Sortie : data/obligations-cotees-prix-boc.csv — fichier SEPARE, volontairement.
Il se recoupe avec l'existant sur avril-septembre 2026, ce qui permet de
comparer avant toute fusion.

Colonnes :
    code;isin;date;coursPrecedent;coursJour;coursReference;cleanPrice;
    couponCouru;dirtyPrice;volume;valeurTransigee

  coursJour     None si la ligne n'a pas cote ce jour (NC / SP au BOC)
  cleanPrice    coursJour s'il existe, sinon coursReference
  dirtyPrice    cleanPrice + couponCouru — le BOC publie le coupon couru,
                aucune hypothese actuarielle n'est donc necessaire

Trois pieges du format, tous traites (cf. commentaires du parseur) :
  1. le PDF replie les titres longs sur deux lignes ;
  2. les trois cours sont separes par un espace simple, comme le separateur
     de milliers ;
  3. le titre replie decale les colonnes, il faut ancrer a droite.

Dependances :
    pip install requests pypdf

Usage :
    python scripts/backfill_boc_bond_prices.py --from 2023-01-01 --to 2026-09-05
    python scripts/backfill_boc_bond_prices.py --from 2026-09-01 --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import requests

try:
    import pypdf
except ImportError:
    print("Erreur : `pypdf` requis. `pip install pypdf`", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
BONDS_CSV = DATA_DIR / "obligations-cotees.csv"
OUT_CSV = DATA_DIR / "obligations-cotees-prix-boc.csv"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,*/*",
}
URLS = (
    "https://bfin.brvm.org/boc/BOC_JOUR/BOC_{}.pdf",
    "https://bfin.brvm.org/boc/BOC_JOUR/BOC_{}_2.pdf",
)

COLUMNS = [
    "code", "isin", "date",
    "coursPrecedent", "coursJour", "coursReference", "cleanPrice",
    "couponCouru", "dirtyPrice", "volume", "valeurTransigee",
]

# ── parseur ─────────────────────────────────────────────────────────────────

SPACE = "[   ]"
SYMBOL_RE = re.compile(r"\b([A-Z]{2,7}\.(?:O|S)\d{1,3})\b")
TAIL_RE = re.compile(
    rf"{SPACE}(?P<couru>\d{{1,4}}[.,]\d+)"
    rf"{SPACE}+(?P<periodicite>[AST])"
    rf"{SPACE}+(?P<coupon>\d{{1,4}}[.,]\d+)"
    rf"{SPACE}+(?P<prochain>\d{{1,2}}-[^\s-]+-\d{{2,4}})"
    rf"{SPACE}+(?P<amort>IF|AC|ACD)\b"
)
NUM_HEAD_RE = re.compile(r"^\d{1,3}([.,]\d+)?$")
NUM_GROUP_RE = re.compile(r"^\d{3}$")
NUM_LAST_RE = re.compile(r"^\d{3}([.,]\d+)?$")
GLUE_RE = re.compile(r"(\d)[^\S\n]*\n[^\S\n]*(\d)")


def _to_number(groups):
    """['5', '899.50'] -> 5899.5"""
    return float("".join(groups).replace(",", "."))


def _splits(tokens, n):
    """Decoupages de `tokens` en n nombres respectant le groupement par 3.

    Le dernier groupe peut porter une decimale : le BOC cote parfois au
    centime ("5 899.50" le 29/07/2026). Sans cette tolerance le decoupage
    echoue entierement sur ces lignes.
    """
    if n == 0:
        return [[]] if not tokens else []
    out = []
    for take in range(1, len(tokens) + 1):
        head = tokens[:take]
        if not NUM_HEAD_RE.match(head[0]):
            break
        if any(not NUM_GROUP_RE.match(t) for t in head[1:-1]):
            break
        if len(head) > 1 and not NUM_LAST_RE.match(head[-1]):
            break
        if len(head[0]) > 1 and head[0].startswith("0"):
            break
        for rest in _splits(tokens[take:], n - 1):
            out.append([_to_number(head)] + rest)
    return out


def _one(seg):
    c = _splits(seg.split(), 1)
    return c[0][0] if len(c) == 1 else None


def _trailing_number(seg):
    """Dernier nombre valide d'un segment : '2035 10 000' -> 10000.

    Le titre replie par le PDF pollue la colonne du nominal ; on ne retient
    que le suffixe numerique.
    """
    toks = seg.split()
    for start in range(len(toks)):
        c = _splits(toks[start:], 1)
        if len(c) == 1:
            return c[0][0]
    return None


def _plausible(vals, nominal):
    return not nominal or all(0.1 * nominal <= v <= 5 * nominal for v in vals)


def _pick_quote(tokens: list[str], nominal: float) -> list[int] | None:
    """Decoupe "cours x3 + volume + montant" colles en espaces simples.

    L'unicite du decoupage ne suffit pas : "3 150 3 150 3 150 38 119 700"
    admet [38][119 700] ET [38 119][700]. On tranche par le PRIX IMPLICITE,
    montant / volume, qui doit tomber dans la fourchette de la seance :

        119 700 / 38     = 3 150   <- coherent avec les cours du jour
        700 / 38 119     = 0,018   <- absurde

    On ne peut pas exiger montant = volume x cours de cloture : le montant
    reflete le cours moyen pondere de la seance. ORGT.O2 au 10/07/2026 traite
    10 946 titres pour 64 711 400 FCFA, soit 5 912 de moyenne, entre la veille
    (5 850) et la cloture (6 200). D'ou une fourchette large plutot qu'une
    egalite.
    """
    best, best_err = None, None
    for c in _splits(tokens, 5):
        prec, jour, ref, vol, val = c
        if nominal and not (0.1 * nominal <= jour <= 5 * nominal):
            continue
        if vol <= 0:
            # Pas d'echange : montant nul attendu.
            if val == 0:
                return c
            continue
        implicite = val / vol
        lo = min(prec, jour, ref) * 0.8
        hi = max(prec, jour, ref) * 1.25
        if not (lo <= implicite <= hi):
            continue
        err = abs(implicite - jour) / max(jour, 1)
        if best_err is None or err < best_err:
            best, best_err = c, err
    return best



def _as_quote(seg, nominal):
    """Interprete le segment des cotations.

    Renvoie (prec, jour, ref, volume, valeur) ou None.

    Le BOC colle parfois TOUTE la ligne en espaces simples — cours, volume et
    montant compris. Le segment porte alors CINQ nombres et non trois :

        ORGT.O2 ... 5 000   5 950 6 000 6 000 10 60 000   121,12 S ...
                    ^VN     ^prec ^jour ^ref  ^vol ^montant

    Ne tester que le decoupage en 3 fait rater ces lignes — ou pire, pousse a
    prendre l'avant-derniere cellule pour le volume, ce qui donne le NOMINAL
    (5 000 au lieu de 10) et un montant concatene de 19 chiffres. C'est le
    defaut qui a corrompu 43 des 1 156 seances traitees du fichier de prix.
    """
    parts = seg.split()
    if any(p in ("NC", "SP") for p in parts):
        # Pas de transaction : ni volume ni montant sur la ligne.
        i = next(k for k, p in enumerate(parts) if p in ("NC", "SP"))
        a = _one(" ".join(parts[:i]))
        c = _one(" ".join(parts[i + 1 :]))
        return (a, None, c, 0, 0) if a is not None and c is not None else None

    # Cinq nombres d'abord : cours x3 + volume + montant colles. L'invariant
    # montant = volume x cours leve l'ambiguite du decoupage.
    inline = _pick_quote(parts, nominal)
    if inline is not None:
        return (inline[0], inline[1], inline[2], inline[3], inline[4])

    cands = [c for c in _splits(parts, 3) if _plausible(c, nominal)]
    if not cands:
        return None
    if len(cands) > 1 and nominal:
        cands.sort(key=lambda t: sum(abs(v / nominal - 1) for v in t))
    a, b, c = cands[0]
    return (a, b, c, None, None)


def extract_bond_prices(text: str) -> dict[str, dict]:
    """{mnemonique: {...}} depuis la table OBLIGATIONS CLASSIQUES.

    Parcours par BLOCS entre mnemoniques : une lecture ligne a ligne rate les
    lignes dont le titre a ete replie par le PDF (161 sur 206 au 04/09/2026).
    """
    text = text.replace(" ", " ").replace(" ", " ")
    out: dict[str, dict] = {}
    ms = list(SYMBOL_RE.finditer(text))
    for i, m in enumerate(ms):
        sym = m.group(1)
        if sym in out:
            continue
        end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        chunk = GLUE_RE.sub(r"\1 \2", text[m.end() : end]).replace("\n", "   ")
        t = TAIL_RE.search(chunk)
        if not t:
            continue
        cols = [c for c in re.split(r"\s{2,}", chunk[: t.start()].strip()) if c]
        if len(cols) < 3:
            continue

        # Ancrage a DROITE : indexer depuis la gauche echoue des que le titre
        # est replie, il se scinde alors en plusieurs colonnes et decale tout.
        idx = quote = None
        for k in range(len(cols) - 1, 0, -1):
            cand = _as_quote(cols[k], _trailing_number(cols[k - 1]) or 0)
            if cand is not None:
                idx, quote = k, cand
                break
        if quote is None:
            continue

        prec, jour, ref, volume, valeur = quote
        if volume is None:
            # Volume et montant occupent leurs propres colonnes.
            volume = valeur = 0
            after = cols[idx + 1 :]
            if len(after) >= 2:
                volume = _one(after[-2]) or 0
                valeur = _one(after[-1]) or 0
        out[sym] = {
            "coursPrecedent": prec,
            "coursJour": jour,
            "coursReference": ref,
            "volume": volume,
            "valeurTransigee": valeur,
            "couponCouru": float(t.group("couru").replace(",", ".")),
        }
    return out


# ── collecte ────────────────────────────────────────────────────────────────


def fetch_boc(session: requests.Session, d: date) -> bytes | None:
    stamp = d.strftime("%Y%m%d")
    for tpl in URLS:
        try:
            r = session.get(tpl.format(stamp), headers=HEADERS, timeout=60)
        except requests.RequestException:
            continue
        if r.status_code == 200 and r.content[:4] == b"%PDF":
            return r.content
    return None


def load_code_to_isin() -> dict[str, str]:
    m = {}
    with BONDS_CSV.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            c = (r.get("code") or "").strip()
            i = (r.get("isin") or "").strip()
            if c:
                m[c] = "" if i in ("", "NC", "0") else i
    return m


def business_days(a: date, b: date):
    d = a
    while d <= b:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from", dest="dfrom", required=True, help="AAAA-MM-JJ")
    ap.add_argument("--to", dest="dto", help="AAAA-MM-JJ (defaut : aujourd'hui)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--dry-run", action="store_true", help="n'ecrit rien")
    args = ap.parse_args()

    start = date(*map(int, args.dfrom.split("-")))
    end = date(*map(int, args.dto.split("-"))) if args.dto else date.today()
    days = list(business_days(start, end))
    code2isin = load_code_to_isin()

    # Reprise : on ne retelecharge pas les seances deja presentes.
    existing: dict[tuple[str, str], list[str]] = {}
    if OUT_CSV.exists():
        with OUT_CSV.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.reader(f, delimiter=";"):
                if row and row[0] != "code":
                    existing[(row[0], row[2])] = row
        done = {k[1] for k in existing}
        days = [d for d in days if d.isoformat() not in done]
        print(f"{len(existing)} lignes deja presentes, {len(days)} seances a traiter")

    print(f"Backfill BOC : {len(days)} jours ouvres du {start} au {end}")

    session = requests.Session()
    rows: list[list] = []
    stats = {"ok": 0, "absent": 0, "vide": 0, "lignes": 0}

    def work(d: date):
        blob = fetch_boc(session, d)
        if blob is None:
            return d, None
        try:
            rd = pypdf.PdfReader(io.BytesIO(blob))
            text = "\n".join((p.extract_text() or "") for p in rd.pages)
            return d, extract_bond_prices(text)
        except Exception as e:
            print(f"  {d} : parse KO ({type(e).__name__})", file=sys.stderr)
            return d, None

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(work, d): d for d in days}
        for n, fut in enumerate(as_completed(futs), 1):
            d, parsed = fut.result()
            if parsed is None:
                stats["absent"] += 1
            elif not parsed:
                stats["vide"] += 1
            else:
                stats["ok"] += 1
                iso = d.isoformat()
                for code, p in parsed.items():
                    clean = p["coursJour"] if p["coursJour"] is not None else p["coursReference"]
                    dirty = (
                        round(clean + p["couponCouru"], 2)
                        if clean is not None else ""
                    )
                    rows.append([
                        code,
                        code2isin.get(code, ""),
                        iso,
                        p["coursPrecedent"] if p["coursPrecedent"] is not None else "",
                        p["coursJour"] if p["coursJour"] is not None else "",
                        p["coursReference"] if p["coursReference"] is not None else "",
                        clean if clean is not None else "",
                        p["couponCouru"],
                        dirty,
                        p["volume"],
                        p["valeurTransigee"],
                    ])
                    stats["lignes"] += 1
            if n % 50 == 0:
                print(
                    f"  ... {n}/{len(days)} seances | {stats['ok']} BOC lus | "
                    f"{stats['lignes']} lignes"
                )

    print(
        f"\nBOC lus {stats['ok']} | absents {stats['absent']} | "
        f"sans table {stats['vide']} | lignes extraites {stats['lignes']}"
    )
    if args.dry_run:
        print("--dry-run : rien ecrit.")
        return 0
    if not rows:
        print("Aucune ligne — fichier inchange.")
        return 0

    for r in rows:
        existing[(r[0], r[2])] = r
    ordered = sorted(existing.values(), key=lambda r: (r[2], r[0]))
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(COLUMNS)
        w.writerows(ordered)
    print(f"{len(ordered)} lignes -> {OUT_CSV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
