"""Referentne tablice po JLS-u: DZS Popis 2021. i indeks razvijenosti (2024.), spojene na Sudregove šifre općina.

Ishod: data/reference/jls.csv, jedan redak po JLS-u (556), ključ je `sifra_opcine` iz Sudrega (DGU šifra).

Zašto spajanje po nazivu: ni DZS-ova tablica Popisa ni PDF s indeksom razvijenosti nemaju šifru JLS-a,
samo naziv i županiju. Zato spajamo po (normalizirana županija, normalizirani naziv JLS-a), a
nekoliko razlika u pisanju naziva rješavamo ručnom tablicom RUCNO (svaka je provjerena i obrazložena).
Skripta pada ako ijedan JLS ostane neuparen, da se greška ne provuče tiho u model.

Izvorne datoteke (preuzimaju se automatski u data/raw/ref/, nisu u gitu):
  - DZS: Popis 2021., Stanovništvo po gradovima/općinama, tablica 6 (kontingenti stanovništva)
  - MRRFEU: Vrijednosti indeksa razvijenosti i pokazatelja za izračun indeksa razvijenosti (razdoblje 2020.-2022.)

Pokretanje: .venv\\Scripts\\python.exe -X utf8 pipeline\\reference.py
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd
import requests

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
RAW_REF = ROOT / "data" / "raw" / "ref"
OUT = ROOT / "data" / "reference"
SJEDISTA = ROOT / "data" / "raw" / "full" / "sjedista.parquet"

POPIS_URL = "https://podaci.dzs.hr/media/td3jvrbu/popis_2021-stanovnistvo_po_gradovima_opcinama.xlsx"
# Naziv datoteke na poslužitelju sadrži "č" zapisan kao c + kombinirajuća kvačica (c%CC%8C); s običnim "č" je 404.
INDEKS_URL = ("https://razvoj.gov.hr/UserDocsImages/O%20ministarstvu/Regionalni%20razvoj/indeks%20razvijenosti/"
              "Vrijednosti%20indeksa%20razvijenosti%20i%20pokazatelja%20za%20izrac%CC%8Cun%20indeksa%20razvijenosti.pdf")


def preuzmi(url: str, cilj: Path) -> Path:
    if not cilj.exists():
        cilj.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(url, timeout=180)
        r.raise_for_status()
        cilj.write_bytes(r.content)
    return cilj


def norm(s: str) -> str:
    """Naziv za usporedbu: mala slova, bez dijakritika, bez dvojezičnog dijela i interpunkcije."""
    s = str(s).strip()
    # Dvojezični nazivi u Istri ("Poreč – Parenzo", "Bale-Valle"): zadržavamo hrvatski dio.
    s = re.split(r"\s+[–-]\s+|\s*–\s*", s)[0]
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("đ", "d")
    s = re.sub(r"\b(grad|opcina|zupanija)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return RUCNO.get(s, s)


# Ručno provjerene razlike u pisanju (normalizirani naziv -> normalizirani naziv kako ga piše Sudreg).
RUCNO = {
    "murterkornati": "murter",        # DZS i indeks "Murter-Kornati", Sudreg "Murter - Kornati" (dvojezično pravilo ga skrati)
    "svetanedjelja": "svetanedelja",  # indeks "Sveta Nedjelja" (Zagrebačka), DZS i Sudreg "Sveta Nedelja"
}


# ------------------------------------------------------------------ Popis 2021.

def ucitaj_popis() -> pd.DataFrame:
    xlsx = preuzmi(POPIS_URL, RAW_REF / "popis_2021_jls.xlsx")
    d = pd.read_excel(xlsx, "6.", header=None, skiprows=8)
    # Stupci tablice 6 (provjereno na zaglavlju, redak 8 u Excelu).
    d = d.rename(columns={0: "zupanija", 1: "vrsta", 4: "naziv", 5: "spol", 7: "ukupno",
                          9: "pop_0_14", 14: "pop_15_64", 16: "pop_65"})
    # Samo zbroj oba spola i samo gradovi/općine (bez redaka RH, županija i gradskih četvrti Zagreba).
    d = d[(d.spol == "sv.") & d.vrsta.isin(["Grad", "Općina"]) & d.naziv.notna()].copy()
    # Grad Zagreb je i županija i JLS: u tablici je kao redak županije, pa ga dodajemo zasebno.
    z = pd.read_excel(xlsx, "6.", header=None, skiprows=8)
    z = z[(z[0] == "Grad Zagreb") & (z[5] == "sv.") & z[4].isna()].iloc[:1]
    z = z.rename(columns={0: "zupanija", 7: "ukupno", 9: "pop_0_14", 14: "pop_15_64", 16: "pop_65"})
    z["vrsta"], z["naziv"] = "Grad", "Zagreb"
    d = pd.concat([d, z], ignore_index=True)
    d = d[["zupanija", "naziv", "vrsta", "ukupno", "pop_0_14", "pop_15_64", "pop_65"]]
    for c in ["ukupno", "pop_0_14", "pop_15_64", "pop_65"]:
        d[c] = pd.to_numeric(d[c]).astype(int)
    return d


# ------------------------------------------------------ Indeks razvijenosti 2024.

def ucitaj_indeks(zupanije: list[str]) -> pd.DataFrame:
    import pdfplumber  # uvozimo ovdje jer treba samo kod izgradnje referentnih tablica

    pdf = preuzmi(INDEKS_URL, RAW_REF / "indeks" / "vrijednosti.pdf")
    # Najdulji nazivi prvi, da "Grad Zagreb" ne pojede "Zagrebačka" i sl.
    zup_re = "|".join(re.escape(z) for z in sorted(zupanije, key=len, reverse=True))
    redak = re.compile(rf"^(\d+) (.+?) ({zup_re}) ([1-8]) (\d+,\d+) ")
    lokalno, redovi = False, []
    with pdfplumber.open(pdf) as p:
        for page in p.pages:
            tekst = page.extract_text() or ""
            if "na lokalnoj razini" in tekst:
                lokalno = True  # stranice prije su županijska razina
            if not lokalno:
                continue
            for line in tekst.splitlines():
                m = redak.match(line)
                if m:
                    redovi.append({"rang": int(m[1]), "naziv": m[2], "zupanija": m[3],
                                   "skupina": int(m[4]), "indeks": float(m[5].replace(",", "."))})
    d = pd.DataFrame(redovi).drop_duplicates("rang")
    if len(d) != 556:
        raise SystemExit(f"Indeks razvijenosti: očekivano 556 JLS-ova, pročitano {len(d)}")
    return d


# ---------------------------------------------------------------- Sudreg općine

def ucitaj_sudreg_opcine() -> pd.DataFrame:
    sj = pd.read_parquet(SJEDISTA, columns=["sifra_zupanije", "naziv_zupanije", "sifra_opcine", "naziv_opcine"])
    sj = sj[sj.sifra_opcine.notna()]
    o = (sj.groupby(["sifra_opcine", "naziv_opcine", "sifra_zupanije", "naziv_zupanije"]).size()
         .rename("n").reset_index().sort_values("n", ascending=False).drop_duplicates("sifra_opcine"))
    for c in ["sifra_opcine", "sifra_zupanije"]:
        o[c] = o[c].astype(int)
    return o.drop(columns="n")


def main() -> int:
    so = ucitaj_sudreg_opcine()
    popis = ucitaj_popis()
    indeks = ucitaj_indeks(sorted(set(popis.zupanija)))
    print(f"Sudreg općina: {len(so)} | Popis JLS: {len(popis)} | Indeks JLS: {len(indeks)}")

    for d, zc, nc in ((so, "naziv_zupanije", "naziv_opcine"), (popis, "zupanija", "naziv"), (indeks, "zupanija", "naziv")):
        d["k_zup"] = d[zc].map(norm)
        d["k_naz"] = d[nc].map(norm)
    kljuc = ["k_zup", "k_naz"]
    for naziv, d in (("Popis", popis), ("Indeks", indeks)):
        dup = d[d.duplicated(kljuc, keep=False)]
        if len(dup):
            raise SystemExit(f"{naziv}: dvosmislen ključ za spajanje:\n{dup}")
        neupareni = so.merge(d[kljuc], on=kljuc, how="outer", indicator=True).query("_merge != 'both'")
        if len(neupareni):
            raise SystemExit(f"{naziv}: neupareni JLS-ovi (dopuni RUCNO):\n{neupareni.to_string()}")

    j = (so.merge(popis.drop(columns=["zupanija", "naziv"]), on=kljuc)
         .merge(indeks[kljuc + ["indeks", "skupina"]], on=kljuc)
         .drop(columns=kljuc))
    j["grad"] = (j.vrsta == "Grad").astype(int)
    j["udio_0_14"] = j.pop_0_14 / j.ukupno
    j["udio_65"] = j.pop_65 / j.ukupno
    j = j.rename(columns={"ukupno": "stanovnika", "skupina": "skupina_razvijenosti",
                          "indeks": "indeks_razvijenosti"}).drop(columns="vrsta")
    j["naziv_zupanije"] = j.naziv_zupanije.str.replace(" županija", "", regex=False)
    j = j.sort_values(["sifra_zupanije", "naziv_opcine"])
    OUT.mkdir(parents=True, exist_ok=True)
    j.to_csv(OUT / "jls.csv", index=False, float_format="%.6g")
    print(f"Zapisano {len(j)} JLS-ova u {OUT / 'jls.csv'} | stanovnika ukupno {j.stanovnika.sum():,} "
          f"| gradova {j.grad.sum()} | OBŽ {int((j.sifra_zupanije == 14).sum())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
