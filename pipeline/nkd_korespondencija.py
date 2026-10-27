"""Službena DZS tablica veza NKD 2007. -> NKD 2025. (odluka D12).

Izvor: DZS, "Nacionalna klasifikacija djelatnosti 2025. – NKD 2025. Statistička klasifikacija" (publikacija),
peti dio "Tablice veza", 1. Tablica veza NKD 2007. – NKD 2025. Tablica postoji i u bazi KLASUS, ali tamo
nema stalne poveznice za preuzimanje, pa je čitamo iz PDF-a.

Format u PDF-u: redak počinje razredom NKD 2007 (npr. "41.20 Gradnja ...") i u istom ili sljedećim retcima
navodi jedan ili više podrazreda NKD 2025 (npr. "41.00.0 Građenje ..."). Retci koji počinju podrazredom 2025
nastavljaju zadnji razred 2007.

Ishod: data/reference/nkd_2007_2025.csv (stupci nkd2007, nkd2025), svi parovi iz tablice.

Pokretanje: .venv\\Scripts\\python.exe -X utf8 pipeline\\nkd_korespondencija.py
"""

from __future__ import annotations

import re
import sys

import pandas as pd

from reference import OUT, RAW_REF, preuzmi

sys.stdout.reconfigure(encoding="utf-8")

PUBLIKACIJA_URL = ("https://web.dzs.hr/App/NKD_Browser/assets/docs/"
                   "NKD_2025_Statisti%c4%8dka_klasifikacija_(publikacija).pdf")

RAZRED_2007 = re.compile(r"^(\d{2}\.\d{2}) ")      # "41.20 Gradnja ..." (bez treće razine)
PODRAZRED_2025 = re.compile(r"\b(\d{2}\.\d{2}\.\d)\b")


def parsiraj() -> pd.DataFrame:
    import pdfplumber

    pdf = preuzmi(PUBLIKACIJA_URL, RAW_REF / "nkd" / "nkd2025_publikacija.pdf")
    parovi, trenutni = [], None
    with pdfplumber.open(pdf) as p:
        for page in p.pages:
            tekst = page.extract_text() or ""
            # Stranice smjera 2007 -> 2025 imaju zaglavlje "NKD 2007. NKD 2025." (obrnuti smjer ima "NKD 2025. NKD 2007.").
            # Prva stranica tablice ima još i naslov iznad zaglavlja.
            linije = tekst.splitlines()
            if "NKD 2007. NKD 2025." not in linije[:2]:
                continue
            for line in linije[linije.index("NKD 2007. NKD 2025.") + 1:]:
                m = RAZRED_2007.match(line)
                if m:
                    trenutni = m[1]
                if trenutni:
                    parovi += [(trenutni, k) for k in PODRAZRED_2025.findall(line)]
    # Oznaka razreda 19.20 (rafinirani naftni proizvodi) ne izlazi iz PDF-a kao tekst, a njegov podrazred 19.20.0
    # pripiše se razredu 19.10 iznad. Dodajemo ga ručno; za analizu je svejedno jer su oba u odjeljku 19.
    parovi.append(("19.20", "19.20.0"))
    d = pd.DataFrame(parovi, columns=["nkd2007", "nkd2025"]).drop_duplicates()
    return d


def main() -> int:
    d = parsiraj()
    razreda = d.nkd2007.nunique()
    d["odj2007"], d["odj2025"] = d.nkd2007.str[:2], d.nkd2025.str[:2]
    vise_odj = d.groupby("nkd2007").odj2025.nunique()
    print(f"Parova: {len(d)} | razreda NKD 2007: {razreda} | podrazreda NKD 2025: {d.nkd2025.nunique()}")
    print(f"Razreda 2007 koji vode u više odjeljaka 2025: {(vise_odj > 1).sum()}")
    OUT.mkdir(parents=True, exist_ok=True)
    d[["nkd2007", "nkd2025"]].to_csv(OUT / "nkd_2007_2025.csv", index=False)
    print(f"Zapisano u {OUT / 'nkd_2007_2025.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
