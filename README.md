# NišaRadar

**Nedostaje li vaša djelatnost u vašem gradu ili općini?**

NišaRadar je javni web alat koji za odabranu djelatnost i grad ili općinu pokazuje je li djelatnost
**nedostajuća, u ravnoteži ili zasićena**. Stvarni broj aktivnih trgovačkih društava i zadruga iz Sudskog
registra uspoređuje s brojem koji statistički model očekuje za JLS te veličine, dobne strukture i razvijenosti.
Za svaki rezultat daje i gotov **tržišni odlomak s izvorima** za poslovni plan ili zahtjev za potporu.

- **Prototip:** https://dlukas99.github.io/nisaradar/
- **Natjecanje:** Datathon Portala otvorenih podataka 2026., izazov **C) Gospodarstvo i učinkovito upravljanje**
- **Pilot:** Osječko-baranjska županija. Izračun pokriva **svih 556 gradova i općina u RH**.

## Za koga

- **Osoba koja pokreće posao** (npr. prijava za HZZ potporu za samozapošljavanje, gdje se boduje kriterij
  "nedostajuće djelatnosti"): brz, objektivan i provjerljiv argument te odlomak za poslovni plan.
- **Savjetnik (HZZ, razvojne agencije, JLS):** ponovljiv pokazatelj, karta i tablica cijele županije, izvoz u CSV.

## Što radi

1. Korisnik opiše ideju ("projektiranje solarnih elektrana"), a alat predloži razred NKD 2025. Pretražuje službene
   opise razreda iz DZS publikacije NKD 2025. i uz prijedlog prikaže tekst zbog kojeg je predložen. Zatim korisnik
   odabere grad ili općinu.
2. Alat prikaže semafor (**nedostaje / u ravnoteži / zasićeno**) uz brojke: *stvarno O, očekivano μ, 80 % raspon a–b*.
   Prikaže i graf cijele očekivane razdiobe, oznake pouzdanosti te objašnjenje "kako smo izračunali".
3. Generira tržišni odlomak (deterministički predložak: svaka brojka iz podataka, s izvorom) za kopiranje ili ispis.
4. Savjetnik u pregledu županije vidi kartu i tablicu svih JLS-ova za odabranu djelatnost i izvozi ih u CSV.
5. Stranica "Izvori i ažurnost" uživo čita datume ažuriranja skupova s data.gov.hr (CKAN API).

## Otvoreni podaci

| Skup | Izdavač | Kako ga koristimo |
|---|---|---|
| Sudski registar – javni API | MPUDT | dohvat izravno iz API-ja svake noći (isti `snapshot_id` za sve tablice) |
| Popis stanovništva 2021. po gradovima/općinama | DZS | stanovnici i dobne skupine po JLS-u |
| Indeks razvijenosti JLS (2020.–2022., NN 3/2024) | MRRFEU | indeks i razvojna skupina po JLS-u |
| NKD 2025. s tablicom veza NKD 2007. – NKD 2025. | DZS | nazivi djelatnosti i službeno mapiranje verzija |
| Upravne jedinice – INSPIRE (Registar prostornih jedinica) | DGU | granice JLS-a za kartu |
| data.gov.hr CKAN API | MPUDT | datumi ažuriranja skupova (uživo) |
| OpenStreetMap (Overpass API, ODbL) | OpenStreetMap zajednica | broj lokala na karti po JLS-u i razredu, uključuje obrte i poslovnice |

Izvori se spajaju po **šifri JLS-a** (lokali s OpenStreetMapa po granicama DGU-a). Sudregov `sifra_opcine` je ista DGU šifra kao `nationalCode` u INSPIRE
granicama (poklapa se svih 556). Popis i indeks spajaju se po nazivu i županiji, uz dvije ručno provjerene razlike u
pisanju. Detalji, poveznice i licence su u [DATA_SOURCES.md](DATA_SOURCES.md).

## Rezultati provjere modela

GroupKFold po županijama: model svaki put predviđa jednu županiju koju nije vidio. Detalji su u [docs/evaluacija.md](docs/evaluacija.md).

| | Baseline (nac. stopa × stanovnici) | NišaRadar (NegBin GLM) |
|---|---|---|
| Poissonova devijanca | 2,84 | **1,52** |
| MAE (subjekata po JLS × odjeljak) | 2,25 | **1,58** |
| Pokrivenost 80 % intervala | – | **75,4 %** (cilj 75–85 %) |

Model je bolji od baselinea u 63 od 71 modeliranih odjeljaka. Izazivač (gradient boosting) nije bio bolji.

Prijedlog djelatnosti iz teksta: na 42 nova opisa ideja, napisana prije izrade sadašnje pretrage, točan razred je među
prva tri prijedloga u 92,9 % slučajeva (top-1 69,0 %; prva inačica imala je 59,5 % i 42,9 %). Detalji i napomena o
pristranosti su u [docs/evaluacija_pretrage.md](docs/evaluacija_pretrage.md).

## Arhitektura

Rješenje nema poslužitelja: GitHub Actions svake noći pokreće Python pipeline, a GitHub Pages poslužuje statičku
React aplikaciju i JSON datoteke. Opis je u [docs/arhitektura.md](docs/arhitektura.md), metoda u
[docs/metodologija.md](docs/metodologija.md), a shema statičkog API-ja u [docs/openapi.yaml](docs/openapi.yaml).

```
GitHub Actions (noćno) -> pipeline/run.py
   fetch_sudreg.py  -> Sudreg API (OAuth2, paginacija, isti snapshot, checkpoint)
   build.py         -> obuhvat, NKD 2025 odjeljak, matrica JLS × odjeljak
   model.py         -> NegBin GLM po odjeljku, semafor, evaluacija
   export.py        -> web/public/data/*.json + jls.geojson
GitHub Pages <- web/ (Vite + React + TypeScript + MapLibre GL)
```

## Pokretanje lokalno

Potrebno: Python 3.11+, Node 20+ i vjerodajnice za [Sudski registar – otvoreni podaci](https://sudreg-data.gov.hr).

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r pipeline\requirements.txt
copy .env.example .env          # upiši SUDREG_CLIENT_ID i SUDREG_CLIENT_SECRET (.env nikad ne ide u git)

# cijeli pipeline (~15 min zbog dohvata iz API-ja); --bez-dohvata za ponovni izračun nad postojećim podacima
.\.venv\Scripts\python.exe -X utf8 pipeline\run.py

cd web
npm ci
npm run dev                     # http://localhost:5173
```

Referentne tablice (`data/reference/`) su u gitu. Ponovno se grade skriptama `pipeline/reference.py` (Popis i indeks),
`pipeline/nkd_korespondencija.py` (tablica veza NKD) i `pipeline/granice.py` (granice JLS-a).

## Ograničenja

- **Obrti nisu u modelu**: nisu u Sudskom registru, a otvoreni agregat po djelatnosti i JLS-u ne postoji (Obrtni registar nema
  otvoreni skup ni API). Model zato uspoređuje tvrtke s tvrtkama. Odjeljci u kojima prevladavaju obrti (01, 43, 56, 95, 96)
  imaju oznaku "niža pouzdanost".
- **Tvrtke se broje u mjestu sjedišta**, pa se poslovnice lanaca ne vide. Kao drugi pogled rezultat prikazuje broj lokala na
  karti OpenStreetMap, koja bilježi i obrte i poslovnice, ali nije potpuna.
- Oko 24 % tržišnih subjekata nema nijednu šifru djelatnosti, pa nisu u izračunu. JLS-ovi s neuobičajeno velikim udjelom
  takvih subjekata imaju oznaku "niža pouzdanost".
- Dva izvora djelatnosti u Sudskom registru (pretežita i glavna) slažu se u 73 % slučajeva. Zato svaki nalaz
  provjeravamo i modelom samo na pretežitoj djelatnosti i u UI-ju pokazujemo je li potvrđen.

## Privatnost

Ne dohvaćaju se nikakvi osobni podaci (tablice o osobama ne postoje u javnom API-ju, a `/detalji_subjekta` se ne koristi).
Objavljuju se samo agregati po JLS-u × djelatnosti.

## Alati i licence

Kod: [EUPL-1.2](LICENSE). Korišteni open-source alati: Python (requests, python-dotenv, pandas, pyarrow, numpy, scipy,
statsmodels, scikit-learn, openpyxl, pdfplumber, shapely, pyproj, lxml), web (React, Vite, TypeScript, MapLibre GL JS).
Licence su navedene u [DATA_SOURCES.md](DATA_SOURCES.md).

Pri razvoju je korišten AI asistent za programiranje (Claude Code, Anthropic). Samo rješenje ne koristi zatvorene AI
usluge: model je statistički (statsmodels), a tekstovi nastaju iz determinističkih predložaka.
