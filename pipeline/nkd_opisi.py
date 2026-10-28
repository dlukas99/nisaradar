"""Službena objašnjenja razreda NKD 2025. za pretragu djelatnosti iz teksta (D7).

Izvor: ista DZS publikacija kao tablica veza (nkd_korespondencija.py), dio s objašnjenjima. Za svaki podrazred
publikacija navodi "Ovaj podrazred uključuje: - ..." (konkretne djelatnosti, npr. "tehničko projektiranje") i
"Ovaj podrazred isključuje: - ..., vidi 43.21.0". Upute "vidi" su zlata vrijedne: tvrdnja "ugradnju solarnih panela,
vidi 43.21.0" znači da ugradnja solarnih panela pripada razredu 43.21. Zato tekst iz "isključuje" pripisujemo
razredu na koji upućuje, a ne razredu u kojem stoji.

Ishod: data/reference/nkd2025_opisi.csv (stupci razred, izvor, tekst), gdje je izvor:
  podrazred   naziv podrazreda (npr. 71.12.1 "Geodetska izmjera ..."), ako se razlikuje od naziva razreda
  ukljucuje   stavka iz "Ovaj podrazred (također) uključuje"
  uputa       stavka iz tuđeg "isključuje" koja upućuje na ovaj razred ("vidi XX.XX[.X]")

Pokretanje: .venv\\Scripts\\python.exe -X utf8 pipeline\\nkd_opisi.py
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

import requests

# Namjerno bez pandasa (i bez uvoza reference.py / nkd_korespondencija.py koji ga uvoze): skripta je čisto
# parsiranje teksta, pa radi i gdje pandas nije dostupan.
ROOT = Path(__file__).resolve().parent.parent
RAW_REF = ROOT / "data" / "raw" / "ref"
OUT = ROOT / "data" / "reference"
PUBLIKACIJA_URL = ("https://web.dzs.hr/App/NKD_Browser/assets/docs/"
                   "NKD_2025_Statisti%c4%8dka_klasifikacija_(publikacija).pdf")

sys.stdout.reconfigure(encoding="utf-8")

# Zaglavlje razine: "32 Ostala ...", "32.1 Proizvodnja ...", "32.12 Proizvodnja ...", "32.12.0 Proizvodnja ...".
# Naziv počinje velikim slovom; tako se ne miješa s nastavkom retka koji počinje šifrom ("28.21.0 - proizvodnju").
ZAGLAVLJE = re.compile(r"^(\d{2}(?:\.\d{1,2}(?:\.\d)?)?) ([A-ZČĆŠŽĐ].*)$")
SIFRA_U_UPUTI = re.compile(r"\b(\d{2}\.\d{2})(?:\.\d)?\b")
UPUTA = re.compile(r"^(.*?)[,;]?\s+vidi\s+(.+)$")


def _kljuc(sifra: str) -> str:
    # Redoslijed po znamenkama, ne po razinama: "47.8" (skupina) dolazi iza "47.79.0", a "47.81" iza "47.8".
    # (Kao torka brojeva bilo bi (47, 8) < (47, 79, 0), pa bi se zaglavlje skupine pogrešno odbacilo.)
    return sifra.replace(".", "")


def _ocisti(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip(" -•;,.:")


def preuzmi(url: str, cilj: Path) -> Path:
    if not cilj.exists():
        cilj.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(url, timeout=180)
        r.raise_for_status()
        cilj.write_bytes(r.content)
    return cilj


def parsiraj(stranice: list[str]) -> list[tuple[str, str, str]]:
    # Objašnjenja počinju na stranici s prvim "Ovaj podrazred uključuje" (ranije stranice su popis strukture)
    # i završavaju prije tablica veza.
    pocetak = next(i for i, t in enumerate(stranice) if "Ovaj podrazred uključuje" in t)
    kraj = next(i for i, t in enumerate(stranice) if "NKD 2007. NKD 2025." in t.splitlines()[:2])
    linije = []
    for t in stranice[max(0, pocetak - 1):kraj]:
        # Zadnji redak stranice je broj stranice.
        linije += [l for l in t.splitlines() if not re.fullmatch(r"\d{1,3}", l.strip())]

    zapisi: list[tuple[str, str, str]] = []
    razine: dict[int, str] = {}      # duljina šifre -> naziv (za usporedbu naziva podrazreda s razredom)
    trenutna = ""
    sifra = ""
    nacin = None                      # "naziv" | "ukljucuje" | "iskljucuje" | None (ignoriramo)
    stavka: list[str] = []
    roditelj = ""                     # zadnja "- " stavka; podstavke "•" je nastavljaju ("postavljanje" + "satelitskih antena")

    def zatvori_stavku():
        nonlocal stavka, roditelj
        if not stavka:
            return
        tekst = _ocisti(" ".join(stavka))
        if stavka[0].startswith("•"):
            tekst = _ocisti(re.sub(r"\s*(kao što su|kao što je|npr\.?|uključujući)\s*:?$", "", roditelj) + " " + tekst)
        else:
            roditelj = tekst
        stavka = []
        if not tekst or len(sifra) < 7:
            return                    # samo stavke na razini podrazreda (prozni opisi skupina su preopćeniti)
        if nacin == "ukljucuje":
            zapisi.append((sifra[:5], "ukljucuje", tekst))
        elif nacin == "iskljucuje":
            m = UPUTA.match(tekst)
            if m:
                fraza = _ocisti(m[1])
                for cilj in dict.fromkeys(SIFRA_U_UPUTI.findall(m[2])):
                    if cilj != sifra[:5] and fraza:
                        zapisi.append((cilj, "uputa", fraza))

    for line in linije:
        s = line.strip()
        m = ZAGLAVLJE.match(s)
        if m and _kljuc(m[1]) > trenutna:
            zatvori_stavku()
            if nacin == "naziv" and len(sifra) == 7:
                naziv = _ocisti(razine.get(7, ""))
                if naziv and naziv.lower() != _ocisti(razine.get(5, "")).lower():
                    zapisi.append((sifra[:5], "podrazred", naziv))
            sifra, trenutna, nacin = m[1], _kljuc(m[1]), "naziv"
            razine[len(sifra)] = m[2]
            continue
        if s.startswith(("Ovaj ", "Ova ")) and re.search(r"(uključuje|isključuje)", s.split(":")[0]):
            zatvori_stavku()
            if nacin == "naziv" and len(sifra) == 7:
                naziv = _ocisti(razine.get(7, ""))
                if naziv and naziv.lower() != _ocisti(razine.get(5, "")).lower():
                    zapisi.append((sifra[:5], "podrazred", naziv))
            nacin = "iskljucuje" if "isključuje" in s.split(":")[0] else "ukljucuje"
            # Obično slijedi popis ("uključuje:"), a ponekad rečenica u istom retku ("uključuje pružanje ...").
            ostatak = s.split(":", 1)[1] if ":" in s else re.split(r"uključuje|isključuje", s, maxsplit=1)[1]
            if ostatak.strip():
                stavka = [ostatak]
            continue
        if s.startswith("PRAVILO PRIMJENE"):
            zatvori_stavku()
            nacin = None
            continue
        if nacin == "naziv":
            razine[len(sifra)] += " " + s     # naziv u dva retka
            continue
        if s.startswith(("- ", "• ", "-", "•")):
            zatvori_stavku()
            stavka = [s]
        elif stavka:
            stavka.append(s)
    zatvori_stavku()

    return list(dict.fromkeys(zapisi))      # bez duplikata, redoslijed zadržan


def zapisi_json(cilj: Path) -> None:
    """data/reference/nkd2025_opisi.csv -> {razred: [[izvor, tekst], ...]} za pretragu u pregledniku (export.py)."""
    import json

    kratko = {"podrazred": "p", "ukljucuje": "u", "uputa": "r"}
    out: dict[str, list[list[str]]] = {}
    with open(OUT / "nkd2025_opisi.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out.setdefault(r["razred"], []).append([kratko[r["izvor"]], r["tekst"]])
    cilj.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    import pdfplumber

    pdf = preuzmi(PUBLIKACIJA_URL, RAW_REF / "nkd" / "nkd2025_publikacija.pdf")
    with pdfplumber.open(pdf) as p:
        stranice = [pg.extract_text() or "" for pg in p.pages]
    zapisi = parsiraj(stranice)

    # Kontrola: svaka šifra mora postojati u šifrarniku NKD 2025 (inače je parser krivo pročitao redak).
    with open(OUT / "nkd2025_razredi.csv", encoding="utf-8") as f:
        razredi = {r["razred"] for r in csv.DictReader(f)}
    nepoznati = sorted({z[0] for z in zapisi if z[0] not in razredi})
    if nepoznati:
        print(f"UPOZORENJE: zapisi s nepoznatim razredom (izbačeni): {nepoznati[:20]}")
    zapisi = sorted((z for z in zapisi if z[0] in razredi), key=lambda z: (z[0], z[1]))
    with open(OUT / "nkd2025_opisi.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["razred", "izvor", "tekst"])
        w.writerows(zapisi)

    print(f"{len(zapisi)} zapisa, {len({z[0] for z in zapisi})}/{len(razredi)} razreda ima barem jedan opis")
    for izvor in ("podrazred", "ukljucuje", "uputa"):
        print(f"  {izvor}: {sum(z[1] == izvor for z in zapisi)}")
    bez = sorted(razredi - {z[0] for z in zapisi})
    print("Razredi bez opisa:", bez[:40], "..." if len(bez) > 40 else "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
