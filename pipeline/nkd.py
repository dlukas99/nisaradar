"""Nazivi NKD 2025 područja, odjeljaka i razreda iz Sudregova šifrarnika (/nacionalna_klasifikacija_djelatnosti).

Šifrarnik je poredan po id-u tako da područje (slovo) dolazi prije svojih odjeljaka, pa se područje
odjeljka određuje kao zadnje viđeno slovo. To provjeravamo prema NACE Rev. 2.1 rasponima (NKD 2025 = NACE 2.1).
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SIFRARNIK = ROOT / "data" / "raw" / "sifrarnici" / "nacionalna_klasifikacija_djelatnosti.json"
REF = ROOT / "data" / "reference"

# NACE Rev. 2.1 područja i prvi odjeljak svakog (za provjeru).
PRVI_ODJELJAK = {"A": 1, "B": 5, "C": 10, "D": 35, "E": 36, "F": 41, "G": 46, "H": 49, "I": 55, "J": 58, "K": 61,
                 "L": 64, "M": 68, "N": 69, "O": 77, "P": 84, "Q": 85, "R": 86, "S": 90, "T": 94, "U": 97, "V": 99}


def _sifrarnik_2025() -> pd.DataFrame:
    n = pd.DataFrame(json.loads(SIFRARNIK.read_text(encoding="utf-8")))
    return n[n.verzija == "NKD 2025"].sort_values("id").reset_index(drop=True)


def _ocisti(s: str) -> str:
    return " ".join(str(s).split())


CACHE_ODJ = REF / "nkd2025_odjeljci.csv"
CACHE_RAZ = REF / "nkd2025_razredi.csv"


def tablice() -> tuple[pd.DataFrame, pd.DataFrame]:
    """(odjeljci, razredi). Odjeljci: odjeljak, naziv, podrucje, podrucje_naziv. Razredi: razred (npr. 47.11), naziv, odjeljak.

    Ako sirovi šifrarnik postoji (nakon dohvata), tablice se računaju iz njega i spremaju u data/reference/;
    inače (npr. kod builda weba bez dohvata) čitaju se spremljene.
    """
    if not SIFRARNIK.exists():
        return (pd.read_csv(CACHE_ODJ, dtype=str), pd.read_csv(CACHE_RAZ, dtype=str))
    o, r = _iz_sifrarnika()
    o.to_csv(CACHE_ODJ, index=False)
    r.to_csv(CACHE_RAZ, index=False)
    return o, r


def _iz_sifrarnika() -> tuple[pd.DataFrame, pd.DataFrame]:
    n = _sifrarnik_2025()
    podrucja = {r.sifra: _ocisti(r.puni_naziv).capitalize() for r in n[n.sifra.str.len() == 1].itertuples()}
    zadnje, red = None, []
    for r in n.itertuples():
        if len(r.sifra) == 1:
            zadnje = r.sifra
        elif len(r.sifra) == 2:
            red.append({"odjeljak": r.sifra, "naziv": _ocisti(r.puni_naziv)})
    # Područje iz NACE raspona (pouzdanije od redoslijeda id-ova); redoslijed služi samo kao provjera.
    granice = sorted(PRVI_ODJELJAK.items(), key=lambda kv: kv[1])
    def podrucje(odj: str) -> str:
        return [p for p, prvi in granice if prvi <= int(odj)][-1]
    o = pd.DataFrame(red).drop_duplicates("odjeljak").sort_values("odjeljak")
    o["podrucje"] = o.odjeljak.map(podrucje)
    o["podrucje_naziv"] = o.podrucje.map(podrucja)
    r = n[n.sifra.str.len() == 5][["sifra", "puni_naziv"]].rename(columns={"sifra": "razred", "puni_naziv": "naziv"})
    r["naziv"] = r.naziv.map(_ocisti)
    r["odjeljak"] = r.razred.str[:2]
    return o.reset_index(drop=True), r.drop_duplicates("razred").sort_values("razred").reset_index(drop=True)


def nazivi_odjeljaka() -> dict[str, str]:
    o, _ = tablice()
    return dict(zip(o.odjeljak, o.naziv))
