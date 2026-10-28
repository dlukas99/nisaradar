# Izvori podataka

Svi izvori su otvoreni podaci tijela javne vlasti RH. Datumi dohvata odnose se na izradu prototipa (27.10.2026.).
Sudski registar se dohvaća ponovno svake noći, a ostale referentne tablice jednom (mijenjaju se rijetko).

## 1. Sudski registar – javni API (jezgra)

- **Izdavač:** Ministarstvo pravosuđa, uprave i digitalne transformacije (MPUDT)
- **Poveznica:** https://sudreg-data.gov.hr/api/javni (OpenAPI: https://sudreg-data.gov.hr/api/javni/dokumentacija/open_api)
- **Portal:** https://data.gov.hr/ckan/dataset/sudski-registar
- **Licenca:** Otvorena dozvola RH (NN 67/17), uz obvezno navođenje izvora
- **Dohvat:** svake noći (GitHub Actions); u prototipu snapshot 1349 (stanje 27.10.2026. 19:00)
- **Tablice:** `/subjekti`, `/sjedista`, `/pravni_oblici`, `/pretezite_djelatnosti`; šifrarnici `/nacionalna_klasifikacija_djelatnosti`,
  `/vrste_pravnih_oblika`, `/vrste_postupaka`. Ne koristimo `/detalji_subjekta` ni bilo kakve podatke o osobama.
- **Skripta:** `pipeline/fetch_sudreg.py`

## 2. Popis stanovništva, kućanstava i stanova 2021. – stanovništvo po gradovima/općinama

- **Izdavač:** Državni zavod za statistiku (DZS)
- **Poveznica:** https://podaci.dzs.hr/media/td3jvrbu/popis_2021-stanovnistvo_po_gradovima_opcinama.xlsx (tablica 6, kontingenti stanovništva)
- **Portal:** https://data.gov.hr/ckan/dataset/statistika-u-nizu-popis-stanovnistva-kucanstava-i-stanova-2021
- **Licenca:** Otvorena dozvola RH
- **Dohvat:** 27.10.2026.
- **Koristimo:** ukupno stanovništvo, 0–14, 15–64, 65+ po JLS-u
- **Skripta:** `pipeline/reference.py` → `data/reference/jls.csv`

## 3. Indeks razvijenosti JLS (razdoblje 2020.–2022.)

- **Izdavač:** Ministarstvo regionalnoga razvoja i fondova Europske unije (MRRFEU)
- **Poveznica:** https://razvoj.gov.hr/UserDocsImages/O%20ministarstvu/Regionalni%20razvoj/indeks%20razvijenosti/Vrijednosti%20indeksa%20razvijenosti%20i%20pokazatelja%20za%20izrac%CC%8Cun%20indeksa%20razvijenosti.pdf
- **Pravna osnova:** Zakon o regionalnom razvoju RH, Uredba o indeksu razvijenosti (NN 131/17); razvrstavanje: Odluka NN 3/2024
- **Licenca:** javni dokument tijela javne vlasti (nije objavljen na data.gov.hr)
- **Dohvat:** 27.10.2026.
- **Koristimo:** vrijednost indeksa i razvojnu skupinu (1–8) za svih 556 JLS-ova
- **Skripta:** `pipeline/reference.py` → `data/reference/jls.csv`

## 4. Nacionalna klasifikacija djelatnosti 2025. (NKD 2025.) s tablicom veza NKD 2007. – NKD 2025.

- **Izdavač:** Državni zavod za statistiku (DZS)
- **Poveznica:** https://web.dzs.hr/App/NKD_Browser/assets/docs/NKD_2025_Statisti%c4%8dka_klasifikacija_(publikacija).pdf (peti dio, "Tablice veza")
- **Portal:** https://data.gov.hr/ckan/dataset/https-web-dzs-hr-app-klasus-default-aspx-lang-hr
- **Licenca:** Otvorena dozvola RH
- **Dohvat:** 27.10.2026.
- **Koristimo:** službeno mapiranje razreda NKD 2007 na podrazrede NKD 2025 (1.010 parova, svih 615 razreda NKD 2007)
  i objašnjenja razreda ("Ovaj podrazred uključuje / isključuje ..., vidi") za pretragu djelatnosti iz teksta (6.193 opisa)
- **Skripta:** `pipeline/nkd_korespondencija.py` → `data/reference/nkd_2007_2025.csv`;
  `pipeline/nkd_opisi.py` → `data/reference/nkd2025_opisi.csv`
- Nazivi odjeljaka i razreda NKD 2025 uzimaju se iz Sudregova šifrarnika → `data/reference/nkd2025_*.csv`

## 5. Upravne jedinice – INSPIRE (Registar prostornih jedinica)

- **Izdavač:** Državna geodetska uprava (DGU)
- **Poveznica:** https://geoportal.dgu.hr/services/atom/au/xml → `INSPIRE_Administrative_Units_(AU).zip` (GML 3.2.1, EPSG:3035)
- **Portal:** https://data.gov.hr/ckan/dataset/upravne-jedinice-inspire
- **Licenca:** Otvorena dozvola RH
- **Dohvat:** 27.10.2026.
- **Koristimo:** granice 556 JLS-ova (razina 3rdOrder), pojednostavljene na ~150 m i pretvorene u WGS84 GeoJSON
- **Skripta:** `pipeline/granice.py` → `data/reference/jls.geojson`

## 6. data.gov.hr CKAN API

- **Izdavač:** MPUDT (Portal otvorenih podataka)
- **Poveznica:** https://data.gov.hr/ckan/api/3/action/package_show
- **Koristimo:** `metadata_modified` svakog skupa, uživo na stranici "Izvori i ažurnost" (JSONP) i pri svakom noćnom izvođenju

## 7. OpenStreetMap – lokali (D16)

- **Izdavač:** OpenStreetMap zajednica (preko Overpass API-ja)
- **Poveznica:** https://www.openstreetmap.org/copyright
- **Licenca:** Open Database License (ODbL) 1.0, © OpenStreetMap contributors. Naš zbirni skup
  `data/reference/osm_jls_razred.csv` (broj lokala po JLS × razred NKD 2025) je izvedena baza i dijeli se pod ODbL.
- **Dohvat:** 28.10.2026. (`data/reference/osm_meta.json`)
- **Koristimo:** trgovine, ugostiteljstvo, usluge i obrtničke radionice (oznake `shop`, `amenity`, `craft`, `tourism`, `office`,
  `healthcare`), raspoređene u JLS po granicama DGU-a. Prikazuje se kao informacija uz model (uključuje obrte i poslovnice), ne kao ulaz u model.
- **Skripta:** `pipeline/osm.py`; mapiranje oznaka na razrede `data/reference/osm_nkd.csv` (ručno, šifre provjerene prema NKD 2025)

## Ručno izrađeni podaci

- `data/reference/sinonimi.csv`: sinonimi za pretragu ideja (npr. "frizer" → 96.21), izradio tim. Šifre su provjerene prema NKD 2025.

## Izvedeni skup (naš izlaz)

"Indeks deficita djelatnosti po JLS-u" je agregat po JLS × NKD 2025 odjeljak (stvarni broj, očekivani broj, 80 % interval,
semafor). Opis je u `docs/dcat-ap.jsonld` i spreman je za objavu na data.gov.hr. Licenca izvedenog skupa je Otvorena
dozvola RH, uz navođenje izvora iz ove datoteke.

## Open-source softver

| Paket | Licenca | Namjena |
|---|---|---|
| requests | Apache-2.0 | HTTP klijent (Sudreg, CKAN) |
| python-dotenv | BSD-3-Clause | čitanje `.env` lokalno |
| pandas | BSD-3-Clause | obrada tablica |
| pyarrow | Apache-2.0 | Parquet |
| numpy, scipy | BSD-3-Clause | numerika, NegBin razdioba |
| statsmodels | BSD-3-Clause | NegBin GLM |
| scikit-learn | BSD-3-Clause | GroupKFold, GBM izazivač |
| openpyxl | MIT | čitanje DZS XLSX |
| pdfplumber | MIT | čitanje PDF-a (indeks, tablica veza, opisi razreda NKD) |
| lxml | BSD-3-Clause | strujno čitanje GML-a |
| shapely | BSD-3-Clause | pojednostavljenje geometrije |
| pyproj | MIT | EPSG:3035 → WGS84 |
| React, React DOM | MIT | korisničko sučelje |
| Vite | MIT | build weba |
| TypeScript | Apache-2.0 | tipovi |
| MapLibre GL JS | BSD-3-Clause | karta |
| Inter, Bricolage Grotesque (Fontsource, lokalno) | OFL-1.1 | fontovi sučelja |

AI alati: pri razvoju je korišten AI asistent za programiranje Claude Code (Anthropic). Rješenje u radu ne koristi
zatvorene AI usluge.
