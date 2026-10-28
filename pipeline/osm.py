"""Lokali s OpenStreetMap karte po JLS-u i razredu NKD 2025. (D16).

Zašto: Sudski registar broji tvrtke u gradu SJEDIŠTA. Ne vidi obrte (nisu u njemu) ni poslovnice lanaca (Konzum,
Studenac... imaju sjedište drugdje). OpenStreetMap bilježi stvarne lokale na terenu bez obzira na pravni oblik, pa je
koristan drugi, neovisan pogled: "na karti je u Čaglinu ucrtano 4 trgovine". Karta nije potpuna (ovisi o volonterima),
zato je samo informacija uz model, a ne ulaz u model.

Izvor: OpenStreetMap preko Overpass API-ja, licenca ODbL 1.0 (© OpenStreetMap contributors). Naš zbirni skup
(broj lokala po JLS × razred) je izvedena baza i dijeli se pod ODbL.

Mapiranje OSM oznaka na razrede: data/reference/osm_nkd.csv (ručno, šifre provjerene prema NKD 2025).
Ishod: data/reference/osm_jls_razred.csv (sifra_opcine, razred, broj) i data/reference/osm_meta.json.

Pokretanje (jednom, ili povremeno ručno; ne svake noći, da ne opterećujemo javni Overpass):
    .venv\\Scripts\\python.exe -X utf8 pipeline\\osm.py
"""

from __future__ import annotations

import csv
import io
import json
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "data" / "reference"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
KLJUCEVI = ["shop", "amenity", "craft", "tourism", "office", "healthcare"]


def ucitaj_mapiranje() -> dict[tuple[str, str], str]:
    with open(REF / "osm_nkd.csv", encoding="utf-8") as f:
        return {(r["kljuc"], r["vrijednost"]): r["razred"] for r in csv.DictReader(f)}


def upit(mapa: dict[tuple[str, str], str]) -> str:
    # Samo oznake koje znamo mapirati; centar za površine (out center) da svaki objekt ima jednu točku.
    dijelovi = []
    for k in KLJUCEVI:
        vrijednosti = sorted({v for (kk, v) in mapa if kk == k})
        if vrijednosti:
            dijelovi.append(f'nwr["{k}"~"^({"|".join(vrijednosti)})$"](area.hr);')
    stupci = ",".join(["::type", "::id", "::lat", "::lon", *KLJUCEVI])
    return (f"[out:csv({stupci};true;\"\\t\")][timeout:600];\n"
            'area["ISO3166-1"="HR"]["admin_level"="2"]->.hr;\n'
            f"({' '.join(dijelovi)});\nout center;")


def dohvati(q: str) -> str:
    for pokusaj in range(4):
        for url in OVERPASS:
            try:
                r = requests.post(url, data={"data": q}, timeout=900,
                                  headers={"User-Agent": "NisaRadar (Datathon 2026; github.com/dlukas99/nisaradar)"})
                if r.status_code == 200 and r.text.startswith("@type"):
                    return r.text
                print(f"  {url}: HTTP {r.status_code}, pokušavam dalje")
            except requests.RequestException as e:
                print(f"  {url}: {type(e).__name__}, pokušavam dalje")
        time.sleep(30 * (pokusaj + 1))
    raise RuntimeError("Overpass API nije odgovorio")


def main() -> int:
    mapa = ucitaj_mapiranje()
    print("Dohvaćam lokale iz OpenStreetMapa (Overpass API, cijela RH)...")
    tekst = dohvati(upit(mapa))
    redovi = list(csv.DictReader(io.StringIO(tekst), delimiter="\t"))
    print(f"  {len(redovi):,} objekata")

    # Granice JLS-a (DGU, WGS84) i prostorni indeks za "u kojem je JLS-u točka".
    gj = json.loads((REF / "jls.geojson").read_text(encoding="utf-8"))
    poligoni = [shape(f["geometry"]) for f in gj["features"]]
    sifre = [int(f["properties"]["sifra_opcine"]) for f in gj["features"]]
    stablo = STRtree(poligoni)

    broj: Counter[tuple[int, str]] = Counter()
    izvan, bez_koord = 0, 0
    for r in redovi:
        if not r["@lat"] or not r["@lon"]:
            bez_koord += 1
            continue
        tocka = Point(float(r["@lon"]), float(r["@lat"]))
        jls = next((sifre[i] for i in stablo.query(tocka) if poligoni[i].covers(tocka)), None)
        if jls is None:
            # Granice su pojednostavljene na ~150 m, pa lokali na samoj obali "padnu u more": dodjeljujemo ih
            # najbližem JLS-u ako je bliže od ~1 km (0,01° geografske širine).
            i = stablo.query_nearest(tocka, max_distance=0.01)
            if len(i) == 0:
                izvan += 1
                continue
            jls = sifre[int(i[0])]
        # Jedan objekt može imati više oznaka (npr. shop=bakery i craft=bakery): broji se jednom po razredu.
        razredi = {mapa[(k, r[k])] for k in KLJUCEVI if (k, r.get(k, "")) in mapa}
        for raz in razredi:
            broj[(jls, raz)] += 1

    with open(REF / "osm_jls_razred.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sifra_opcine", "razred", "broj"])
        for (jls, raz), n in sorted(broj.items()):
            w.writerow([jls, raz, n])
    po_razredu = defaultdict(int)
    for (_, raz), n in broj.items():
        po_razredu[raz] += n
    meta = {
        "izvor": "OpenStreetMap (Overpass API)",
        "licenca": "ODbL 1.0, © OpenStreetMap contributors",
        "dohvaceno": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "objekata": len(redovi), "izvan_jls": izvan, "bez_koordinata": bez_koord,
        "razreda": len(po_razredu),
    }
    (REF / "osm_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  izvan granica JLS-a: {izvan}, bez koordinata: {bez_koord}")
    print("  najčešći razredi:", sorted(po_razredu.items(), key=lambda x: -x[1])[:12])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
