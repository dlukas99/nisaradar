"""Granice JLS-a iz službenog izvora: DGU, INSPIRE Upravne jedinice (Registar prostornih jedinica), ATOM preuzimanje.

Licenca: Otvorena dozvola RH. GML 3.2.1 (~600 MB raspakirano) u EPSG:3035 sadrži županije, općine/gradove i naselja.
Čitamo ga strujno (iterparse) jer ne stane udobno u memoriju, zadržavamo samo razinu JLS-a, pojednostavljujemo
geometriju (oko 150 m, dovoljno za kartu županije) i pretvaramo u WGS84 (GeoJSON, RFC 7946).

Ključ: `au:nationalCode` uspoređujemo sa Sudregovim `sifra_opcine`. Skripta ispisuje koliko se poklapa.

Ishod: data/reference/jls.geojson (svojstva: sifra_opcine, naziv).

Pokretanje: .venv\\Scripts\\python.exe -X utf8 pipeline\\granice.py
"""

from __future__ import annotations

import json
import sys
import zipfile

import pandas as pd
from lxml import etree
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, mapping
from shapely.ops import transform

from reference import OUT, RAW_REF, preuzmi

sys.stdout.reconfigure(encoding="utf-8")

AU_URL = "https://geoportal.dgu.hr/services/atom/INSPIRE_Administrative_Units_(AU).zip"
NS = {"au": "http://inspire.ec.europa.eu/schemas/au/4.0", "gml": "http://www.opengis.net/gml/3.2",
      "gn": "http://inspire.ec.europa.eu/schemas/gn/4.0", "xlink": "http://www.w3.org/1999/xlink",
      "gmd": "http://www.isotc211.org/2005/gmd"}
TOLERANCIJA_M = 150


def _prsten(poslist: str) -> list[tuple[float, float]]:
    v = [float(x) for x in poslist.split()]
    # EPSG:3035 u GML-u ima redoslijed osi (northing, easting) = (y, x).
    return [(v[i + 1], v[i]) for i in range(0, len(v), 2)]


def _geometrija(el) -> MultiPolygon:
    poligoni = []
    for poly in el.iterfind(".//gml:Polygon", NS):
        ext = poly.find("gml:exterior//gml:posList", NS)
        ints = [i.text for i in poly.iterfind("gml:interior//gml:posList", NS)]
        poligoni.append(Polygon(_prsten(ext.text), [_prsten(i) for i in ints]))
    return MultiPolygon(poligoni)


def citaj_jedinice(gml) -> list[dict]:
    jedinice = []
    tag = f"{{{NS['au']}}}AdministrativeUnit"
    for _, el in etree.iterparse(gml, tag=tag, huge_tree=True):
        level = el.find("au:nationalLevel", NS).get(f"{{{NS['xlink']}}}title")
        # 3rdOrder = JLS. Naselja (4th) te statistički i popisni krugovi (5th, 6th) nam ne trebaju.
        if level == "3rdOrder":
            kraj = el.find("au:endLifespanVersion", NS)
            jedinice.append({
                "level": level,
                "kod": el.findtext("au:nationalCode", namespaces=NS),
                "naziv": el.findtext(".//gn:text", namespaces=NS),
                "kraj": kraj.text if kraj is not None and kraj.text else None,
                "geom": _geometrija(el),
            })
        el.clear()
        while el.getprevious() is not None:
            del el.getparent()[0]
    return jedinice


def main() -> int:
    zip_put = preuzmi(AU_URL, RAW_REF / "au_zip" / "au.zip")
    with zipfile.ZipFile(zip_put) as z, z.open("AdministrativeUnit.gml") as gml:
        jed = citaj_jedinice(gml)
    df = pd.DataFrame(jed)
    print(f"JLS-ova (3rdOrder) u GML-u: {len(df)}")
    jls_ref = pd.read_csv(OUT / "jls.csv")
    # Razina JLS-a: općine i gradovi (3rdOrder). Isteklih verzija (endLifespanVersion) ne uzimamo.
    o = df[(df.level == "3rdOrder") & df.kraj.isna()].copy()
    o["sifra_opcine"] = o.kod.astype(int)
    spoj = jls_ref[["sifra_opcine", "naziv_opcine"]].merge(o, on="sifra_opcine", how="outer", indicator=True)
    print(spoj._merge.value_counts())
    if (spoj._merge != "both").any():
        print(spoj[spoj._merge != "both"][["sifra_opcine", "naziv_opcine", "naziv"]].to_string())
    razlicit_naziv = spoj[(spoj._merge == "both") & (spoj.naziv_opcine != spoj.naziv)]
    print(f"Isti kod, različit naziv: {len(razlicit_naziv)}")
    print(razlicit_naziv[["sifra_opcine", "naziv_opcine", "naziv"]].head(10).to_string())

    u_wgs = Transformer.from_crs(3035, 4326, always_xy=True).transform
    znacajke = []
    for r in o[o.sifra_opcine.isin(jls_ref.sifra_opcine)].itertuples():
        g = transform(u_wgs, r.geom.simplify(TOLERANCIJA_M, preserve_topology=True))
        geo = json.loads(json.dumps(mapping(g)), parse_float=lambda x: round(float(x), 5))
        znacajke.append({"type": "Feature", "properties": {"sifra_opcine": r.sifra_opcine, "naziv": r.naziv},
                         "geometry": geo})
    fc = {"type": "FeatureCollection", "features": znacajke}
    (OUT / "jls.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Zapisano {len(znacajke)} JLS-ova u {OUT / 'jls.geojson'} "
          f"({(OUT / 'jls.geojson').stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
