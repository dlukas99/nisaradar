# Arhitektura

NišaRadar nema poslužitelja. Sav izračun obavlja noćni Python pipeline na GitHub Actions, a rezultat su statičke
JSON datoteke koje poslužuje GitHub Pages zajedno s React aplikacijom. To znači da nema troška hostinga ni baze
koju treba održavati, a svaka objavljena brojka ima trag u gitu (koji snapshot, koji kod).

```
                ┌──────────────── GitHub Actions: nightly.yml (01:00 UTC) ───────────────┐
 Sudreg API ───►│ fetch_sudreg.py   OAuth2 token → /snapshots → paginirani dohvat 4 tablice│
 (MPUDT)        │                   + 3 šifrarnika, sve s istim snapshot_id; checkpoint     │
                │                   po stranici (nastavak nakon prekida veze)               │
 data/reference►│ build.py          obuhvat (D2, D13) → odjeljak NKD 2025 (D12) →           │
 (DZS, MRRFEU,  │                   matrica 556 JLS × 83 odjeljka, pokrivenost NKD (D11)    │
  DGU, DZS NKD) │ model.py          NegBin GLM po odjeljku → semafor (D5) → evaluacija (D6) │
                │                   → test osjetljivosti na izvor djelatnosti (D14)         │
                │ export.py         web/public/data/*.json, jls.geojson, CKAN datumi       │
                │ commit            data/snapshot/*.parquet + docs/evaluacija.md            │
                └───────────────────────────────┬──────────────────────────────────────────┘
                                                ▼
                ┌──────────────── pages.yml ──────────────────────────────────────────────┐
                │ export.py (iz data/snapshot) → npm ci → vite build → GitHub Pages        │
                └───────────────────────────────┬──────────────────────────────────────────┘
                                                ▼
                 Preglednik: React + TypeScript (Vite), MapLibre GL, Fuse.js
                 čita /data/*.json; datumi izvora uživo iz data.gov.hr CKAN API-ja (JSONP)
```

## Komponente

| Datoteka | Uloga |
|---|---|
| `pipeline/sudreg_client.py` | OAuth2 client credentials, obnova tokena, ponavljanje kod 429/5xx i mrežnih grešaka |
| `pipeline/fetch_sudreg.py` | puni dohvat s checkpointom; provjerava da API vraća traženi `snapshot_id` |
| `pipeline/reference.py` | Popis 2021. (XLSX) + indeks razvijenosti (PDF) → `data/reference/jls.csv`, spojeno na Sudregove šifre |
| `pipeline/nkd_korespondencija.py` | službena DZS tablica veza NKD 2007 → 2025 iz PDF publikacije |
| `pipeline/granice.py` | DGU INSPIRE GML (600 MB, strujno) → pojednostavljeni GeoJSON |
| `pipeline/nkd.py` | nazivi područja, odjeljaka i razreda NKD 2025 |
| `pipeline/build.py` | obuhvat, dodjela odjeljka, matrica, pokrivenost |
| `pipeline/model.py` | model, semafor, evaluacija, `docs/evaluacija.md` |
| `pipeline/export.py` | statički JSON "API" za web |
| `pipeline/run.py` | orkestrator i plan B |
| `web/src/pages/*` | početna, rezultat, pregled županije, izvori |
| `.github/workflows/nightly.yml` | noćni pipeline + commit + deploy |
| `.github/workflows/pages.yml` | build i objava weba |
| `.github/workflows/sudreg_test.yml` | ručni test pristupa API-ju s GitHub runnera |

## Pouzdanost i plan B

- **Isti snapshot:** sve tablice dohvaćaju se s istim `snapshot_id`. Klijent odbija stranicu s drugim `X-Snapshot-Id`.
- **Prekid veze:** svaka stranica (1.000 redaka) sprema se odmah, a ponovno pokretanje nastavlja od zadnje spremljene.
  Puni dohvat traje oko 14 minuta.
- **API ne radi:** `run.py` izvozi zadnji uspješni snapshot iz `data/snapshot/`, a UI prikazuje datum tog snapshota.
- **Provjere kvalitete:** skripte padaju glasno ako ijedan JLS ostane nespojen (Popis, indeks, granice) ili ako
  broj JLS-ova u indeksu nije 556.

## Tajne

`SUDREG_CLIENT_ID` i `SUDREG_CLIENT_SECRET` su u GitHub Secrets. Lokalno su u `.env` (u `.gitignore`).
Klijent ih nikad ne ispisuje. U logu se pojavljuju samo URL i `X-Log-Id`.

## Interoperabilnost

- GeoJSON (RFC 7946, WGS84) za granice; ključ `sifra_opcine` je DGU šifra JLS-a, ista kao u Sudskom registru.
- JSON s dokumentiranom shemom: `docs/openapi.yaml` (statički API `/data/...` i predloženi REST endpoint).
- DCAT-AP opis izvedenog skupa: `docs/dcat-ap.jsonld`, spreman za objavu na data.gov.hr.
- CSV izvoz za savjetnike (UTF-8 s BOM-om i `;` kao separatorom, za hrvatski Excel).

## Integracijski potencijal

- Widget ili API poziv u e-prijavi na mjere.hzz.hr: kriterij "nedostajuća djelatnost" s objašnjivom brojkom.
- Povratna objava izvedenog skupa na data.gov.hr (DCAT-AP opis je spreman).
- Uključivanje u centralni data lake (NPOO C2.3. R2-I2) kao gotov agregat po JLS × djelatnost.
