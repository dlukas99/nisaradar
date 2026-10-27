"""Izvoz rezultata u statičke JSON datoteke za web (web/public/data/). Shema je opisana u docs/openapi.yaml.

Datoteke:
  meta.json               snapshot, datumi, izvori, sažetak evaluacije i obuhvata
  jls.json                svi JLS-ovi s demografijom, indeksom razvijenosti i pokrivenošću NKD-a (D11)
  odjeljci.json           NKD 2025 odjeljci: naziv, područje, oznaka obrta (D3), je li modeliran, broj u RH
  razredi.json            NKD 2025 razredi s nazivima i sinonimima (za pretragu iz teksta, D7)
  deficit/<sifra>.json    za jedan JLS: svi odjeljci (stvarno, očekivano, interval, semafor) i broj po razredu
  odjeljak/<odj>.json     za jedan odjeljak: svi JLS-ovi (karta i pregled županije)
  jls.geojson             granice JLS-a (DGU)

Sve su to agregati po JLS × odjeljak/razred; pojedinačni subjekti se ne objavljuju (D9).

Pokretanje: .venv\\Scripts\\python.exe -X utf8 pipeline\\export.py
"""

from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import nkd

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "data" / "reference"
SNAP = ROOT / "data" / "snapshot"
WEB = ROOT / "web" / "public" / "data"

# D3: odjeljci u kojima obično prevladavaju obrti (usklađeno s NKD 2025).
ODJELJCI_OBRTI = {"01", "43", "56", "95", "96"}

# Izvori podataka; `ckan` je id skupa na data.gov.hr (stranica "Izvori i ažurnost" uživo čita datum ažuriranja).
IZVORI = [
    {"naziv": "Sudski registar (javni API)", "izdavac": "Ministarstvo pravosuđa, uprave i digitalne transformacije",
     "url": "https://sudreg-data.gov.hr/api/javni/dokumentacija/open_api", "ckan": "sudski-registar",
     "licenca": "Otvorena dozvola RH", "koristimo": "aktivni subjekti, sjedišta, pravni oblici, pretežite djelatnosti, NKD šifrarnik"},
    {"naziv": "Popis stanovništva, kućanstava i stanova 2021. – stanovništvo po gradovima/općinama",
     "izdavac": "Državni zavod za statistiku",
     "url": "https://podaci.dzs.hr/media/td3jvrbu/popis_2021-stanovnistvo_po_gradovima_opcinama.xlsx",
     "ckan": "statistika-u-nizu-popis-stanovnistva-kucanstava-i-stanova-2021",
     "licenca": "Otvorena dozvola RH", "koristimo": "broj stanovnika i dobne skupine (0–14, 15–64, 65+) po JLS-u"},
    {"naziv": "Indeks razvijenosti JLS (razdoblje 2020.–2022., Odluka NN 3/2024)",
     "izdavac": "Ministarstvo regionalnoga razvoja i fondova Europske unije",
     "url": "https://razvoj.gov.hr/o-ministarstvu/regionalni-razvoj/indeks-razvijenosti/112", "ckan": None,
     "licenca": "javni dokument tijela javne vlasti", "koristimo": "vrijednost indeksa i razvojna skupina po JLS-u"},
    {"naziv": "Nacionalna klasifikacija djelatnosti 2025. (s tablicom veza NKD 2007. – NKD 2025.)",
     "izdavac": "Državni zavod za statistiku",
     "url": "https://web.dzs.hr/App/NKD_Browser/assets/docs/NKD_2025_Statisti%c4%8dka_klasifikacija_(publikacija).pdf",
     "ckan": "https-web-dzs-hr-app-klasus-default-aspx-lang-hr",
     "licenca": "Otvorena dozvola RH", "koristimo": "nazivi djelatnosti i mapiranje NKD 2007 → 2025"},
    {"naziv": "Upravne jedinice – INSPIRE (Registar prostornih jedinica)", "izdavac": "Državna geodetska uprava",
     "url": "https://geoportal.dgu.hr/services/atom/au/xml", "ckan": "upravne-jedinice-inspire",
     "licenca": "Otvorena dozvola RH", "koristimo": "granice gradova i općina"},
]


def _broj(x, znamenki=2):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return None
    return round(float(x), znamenki)


def pisi(put: Path, obj) -> None:
    put.parent.mkdir(parents=True, exist_ok=True)
    put.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def ucitaj_sinonime() -> dict[str, str]:
    p = REF / "sinonimi.csv"
    if not p.exists():
        return {}
    s = pd.read_csv(p, dtype=str).fillna("")
    return s.groupby("razred").sinonimi.apply(lambda x: ", ".join(x)).to_dict()


def main() -> int:
    jls = pd.read_csv(REF / "jls.csv")
    pok = pd.read_parquet(SNAP / "jls_pokrivenost.parquet")
    pred = pd.read_parquet(SNAP / "predikcije.parquet")
    raz = pd.read_parquet(SNAP / "razredi.parquet")
    ev = json.loads((SNAP / "evaluacija.json").read_text(encoding="utf-8"))
    bm = json.loads((SNAP / "build_meta.json").read_text(encoding="utf-8"))
    sm = json.loads((SNAP / "sudreg_meta.json").read_text(encoding="utf-8"))
    odj_t, raz_t = nkd.tablice()

    if WEB.exists():
        shutil.rmtree(WEB)
    WEB.mkdir(parents=True)

    # --- jls.json
    j = jls.merge(pok, on="sifra_opcine", how="left")
    pisi(WEB / "jls.json", [{
        "sifra": int(r.sifra_opcine), "naziv": r.naziv_opcine, "zupanija": r.naziv_zupanije,
        "sifra_zupanije": int(r.sifra_zupanije), "grad": bool(r.grad), "stanovnika": int(r.stanovnika),
        "udio_0_14": _broj(r.udio_0_14, 4), "udio_65": _broj(r.udio_65, 4),
        "indeks_razvijenosti": _broj(r.indeks_razvijenosti, 3), "skupina_razvijenosti": int(r.skupina_razvijenosti),
        "subjekata": int(r.subjekata), "udio_bez_sifre": _broj(r.udio_bez_sifre, 4),
        "niza_pouzdanost_nkd": bool(r.niza_pouzdanost_nkd),
    } for r in j.itertuples()])

    # --- odjeljci.json
    rh = pred.groupby("odjeljak").agg(broj=("broj", "sum"), status=("status", "first"), alpha=("alpha", "first"))
    po_odj = pd.read_parquet(SNAP / "evaluacija_po_odjeljku.parquet").set_index("odjeljak")
    odj_out = []
    for r in odj_t.itertuples():
        if r.odjeljak not in rh.index:
            continue  # odjeljak bez ijednog subjekta u obuhvatu (npr. 97, 98, 99)
        e = po_odj.loc[r.odjeljak] if r.odjeljak in po_odj.index else None
        odj_out.append({
            "odjeljak": r.odjeljak, "naziv": r.naziv, "podrucje": r.podrucje, "podrucje_naziv": r.podrucje_naziv,
            "obrti": r.odjeljak in ODJELJCI_OBRTI, "modeliran": rh.loc[r.odjeljak, "status"] != "premalo",
            "broj_rh": int(rh.loc[r.odjeljak, "broj"]), "alpha": _broj(rh.loc[r.odjeljak, "alpha"], 4),
            "devijanca_glm": _broj(e.devijanca_glm, 3) if e is not None else None,
            "devijanca_baseline": _broj(e.devijanca_baseline, 3) if e is not None else None,
        })
    pisi(WEB / "odjeljci.json", odj_out)

    # --- razredi.json (za pretragu; broj subjekata u RH po razredu iz pretežite djelatnosti)
    sin = ucitaj_sinonime()
    raz_rh = raz.groupby("razred").broj.sum()
    poznati = {o["odjeljak"] for o in odj_out}
    pisi(WEB / "razredi.json", [{
        "razred": r.razred, "naziv": r.naziv, "odjeljak": r.odjeljak, "sinonimi": sin.get(r.razred, ""),
        "broj_rh": int(raz_rh.get(r.razred, 0)),
    } for r in raz_t.itertuples() if r.odjeljak in poznati])

    # --- deficit/<jls>.json
    raz_po_jls = {s: dict(zip(g.razred, g.broj.astype(int))) for s, g in raz.groupby("sifra_opcine")}
    for s, g in pred.groupby("sifra_opcine"):
        pisi(WEB / "deficit" / f"{s}.json", {
            "sifra": int(s),
            "odjeljci": [{
                "odjeljak": r.odjeljak, "broj": int(r.broj), "ocekivano": _broj(r.mu),
                "interval": None if pd.isna(r.lo) else [int(r.lo), int(r.hi)],
                "p_manje": _broj(r.p_manje, 4), "p_vise": _broj(r.p_vise, 4),
                "status": r.status, "status_uzi": None if pd.isna(r.status_pretezita) else r.status_pretezita,
            } for r in g.itertuples()],
            "razredi": {k: int(v) for k, v in raz_po_jls.get(s, {}).items()},
        })

    # --- odjeljak/<odj>.json
    for o, g in pred.groupby("odjeljak"):
        pisi(WEB / "odjeljak" / f"{o}.json", {
            "odjeljak": o,
            "jls": [{
                "sifra": int(r.sifra_opcine), "broj": int(r.broj), "ocekivano": _broj(r.mu),
                "interval": None if pd.isna(r.lo) else [int(r.lo), int(r.hi)],
                "p_manje": _broj(r.p_manje, 4), "status": r.status,
                "status_uzi": None if pd.isna(r.status_pretezita) else r.status_pretezita,
            } for r in g.itertuples()],
        })

    shutil.copy(REF / "jls.geojson", WEB / "jls.geojson")

    # --- meta.json
    pisi(WEB / "meta.json", {
        "naziv": "NišaRadar – indeks deficita djelatnosti po JLS-u",
        "snapshot_id": sm["snapshot_id"], "snapshot_vrijeme": sm.get("snapshot_timestamp"),
        "dohvaceno": sm.get("dohvaceno"), "generirano": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "obuhvat": {
            "subjekata_u_obuhvatu": bm["subjekata_u_obuhvatu"], "subjekata_s_odjeljkom": bm["subjekata_s_odjeljkom"],
            "izvor_odjeljka": bm["izvor_odjeljka"], "slaganje_izvora": _broj(bm["slaganje_odjeljaka"], 4),
            "prag_bez_sifre": _broj(bm["prag_bez_sifre"], 4), "jls": len(jls), "odjeljaka": len(odj_out),
            "odjeljaka_modelirano": int(sum(o["modeliran"] for o in odj_out)),
        },
        "evaluacija": {k: (_broj(v, 4) if isinstance(v, float) else v) for k, v in ev.items()
                       if k in ("devijanca_glm", "devijanca_baseline", "devijanca_gbm", "mae_glm", "mae_baseline",
                                "pokrivenost_80_pit", "odjeljaka_glm_bolji_od_baselinea", "odjeljaka")},
        "osjetljivost": {k: _broj(v, 4) if isinstance(v, float) else v for k, v in ev["osjetljivost"].items()},
        "pragovi": {"nedostaje": 0.10, "zasiceno": 0.10, "interval": 0.80},
        "odjeljci_obrti": sorted(ODJELJCI_OBRTI),
        "izvori": IZVORI,
    })
    velicina = sum(f.stat().st_size for f in WEB.rglob("*") if f.is_file())
    print(f"Izvezeno u {WEB}: {sum(1 for _ in WEB.rglob('*.json'))} JSON datoteka, {velicina / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
