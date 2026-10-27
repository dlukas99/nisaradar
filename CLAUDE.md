# NišaRadar — kontekst projekta (pročitaj prije svakog rada)

> Ova datoteka je "mozak" projekta. Stoji u korijenu repozitorija `github.com/dlukas99/nisaradar`
> i služi i kao upute za Claude Project i kao `CLAUDE.md` za Claude Code.
> Kad se donese nova odluka ili se nešto provjeri, AŽURIRAJ ovu datoteku (odjeljci 6, 9 i 10).

## 1. Što radimo i za koga

Natjecanje **Datathon Portala otvorenih podataka 2026.** (organizator: Ministarstvo pravosuđa, uprave i
digitalne transformacije – MPUDT). Prijavljujemo **izazov C) Gospodarstvo i učinkovito upravljanje**.

**NišaRadar** je javni web alat koji za odabranu djelatnost i općinu/grad pokazuje je li djelatnost
**nedostajuća, u ravnoteži ili zasićena**. Uspoređuje stvarni broj aktivnih poslovnih subjekata
(Sudski registar, API MPUDT-a) s brojem koji model očekuje za JLS takve veličine, strukture i razvijenosti
(DZS Popis 2021., indeks razvijenosti JLS).

- **Persona 1 – Ivana (34), Beli Manastir:** nezaposlena, priprema zahtjev za HZZ potporu za samozapošljavanje.
  HZZ boduje kriterij "nedostajuće djelatnosti" s 0 ili 5 bodova, ali formula nije javna.
  Treba joj brz, objektivan argument i tržišni odlomak za poslovni plan.
- **Persona 2 – Marko, savjetnik HZZ-a u Osijeku:** procjenjuje desetke zahtjeva. Treba ponovljiv pokazatelj
  i pregled cijele županije s izvozom.
- **Dokaz problema:** HZZ je u 2024. imao 5.464 novouključena korisnika potpore za samozapošljavanje
  (prema srednja.hr), a u 2023. njih 5.434. Kriteriji potpore: https://mjere.hzz.hr/mjere/potpore-za-samozaposljavanje-2026/

**Pilot:** Osječko-baranjska županija (42 JLS-a). Izračun se radi za cijelu RH ako ingest prođe.

## 2. Rokovi i pravila natječaja (dokumenti imaju prednost pred ovom datotekom)

- Prijava tima: do **30.10.2026. u 24:00**. Svaki član ispunjava obrazac posebno, s istim nazivom tima i izazovom C.
  Prijava uključuje privolu za javnu objavu videa.
- Predaja rješenja: do **09.11.2026. u 24:00**, samo e-mailom na open.data@mpudt.hr. Ciljamo slanje do 18:00.
  Šalje voditelj tima (mentor), a članovi su u kopiji.
- Tim: 2–4 studenta i 1 mentor (nastavnik s FERIT-a). Rješenje mora biti **izvorno djelo Tima**.
  Postojeći open-source alati i AI alati su dopušteni ako se navedu u dokumentaciji.
- Rješenje se razvija **softverom otvorenog koda**. Zato u samom rješenju **nema zatvorenih LLM API-ja**.
- Predaja mora sadržavati:
  1. javni GitHub repozitorij s licencom;
  2. tehničku i projektnu dokumentaciju (arhitektura i popis skupova podataka s izdavačem i poveznicom);
  3. demo (link na prototip i snimke zaslona);
  4. **video do 3:00** koji prikazuje rješenje u primjeni (cilj je 2:50).
- **Bez videa rješenje se ne ocjenjuje.**
- Poveznice moraju raditi barem do 17.11.2026. Cilj je do 23.11.2026., kad je konferencija u Zagrebu.
- Bodovanje, ukupno najviše 60:

  | Kriterij | Raspon |
  |---|---|
  | Upotreba otvorenih podataka | 1–5 |
  | Povezivanje podataka | 1–5 |
  | Relevantnost | 1–5 |
  | Utjecaj | 1–5 |
  | Inovativnost/AI | 1–5 |
  | **Izvedivost** | **1–10** |
  | Arhitektura i integracija | 1–5 |
  | **UI/UX** | **1–10** |
  | **Video** | **1–10** |

  Kod izjednačenja odlučuju Izvedivost, pa Upotreba otvorenih podataka.
  Nagrada se ne mora dodijeliti ispod 50 bodova.
- **Posljedica za nas:** prioritet je *radni* prototip s dobrim UI-jem i jakim videom.
  Podaci se dohvaćaju *izravno iz API-ja* javnih tijela.

## 3. Podaci

### 3.1 Sudski registar – jezgra (MPUDT)

**Provjereno** iz službenih uputa v3.0.0:

| Stavka | Vrijednost |
|---|---|
| Bazni URL | `https://sudreg-data.gov.hr/api/javni` (test: `https://sudreg-data-test.gov.hr/api/javni`) |
| Token | `POST https://sudreg-data.gov.hr/api/oauth/token` |
| Autentikacija | HTTP Basic `client_id:client_secret`, tijelo zahtjeva `grant_type=client_credentials` |
| Trajanje tokena | 6 h (`expires_in` = 21600) |
| Zaglavlje | `Authorization: Bearer <token>` |

- Vjerodajnice završavaju s `..` i šalju se **doslovno**.
- Ako dobiješ 401 nakon uspješnog tokena, registracija e-mailom nije potvrđena (link "Potvrdi").
- Paginacija ide parametrima `offset` (0-based) i `limit` (zadano 1000).
  Zaglavlje `X-Total-Count` daje ukupan broj redaka.
  Odgovor bi trebao ostati ispod oko 10 s i 10 MB.
- Snapshot: odgovor sadrži zaglavlje `X-Snapshot-Id`. **Sve tablice dohvati s istim `snapshot_id`** radi konzistentnosti.
- Ostali parametri:
  - `only_active`: ako se izostavi, vraćaju se samo aktivni retci;
  - `omit_nulls`;
  - `expand_relations`: ako se izostavi, vraćaju se samo ID-jevi bez povezanih vrijednosti.
- Ograničenje brzine: `detalji_subjekta` je **6 zahtjeva u minuti**. **Ne koristimo ga za skupni dohvat.**
- Naselja, općine i županije vode se kao parovi (ŠIFRA, NAZIV), a ne kao ID-jevi.

**PROVJERENO 27.10.2026.** (OpenAPI v3.0.4 i stvarni odgovori, snapshot 1349 od 27.10. 19:00; detalji u `docs/sudreg_api.md`):

- Spec ima 39 GET endpointa. Tablica o osobama **nema** (D9 je zadovoljen sam po sebi). `/detalji_subjekta` ne koristimo.
- `/pravni_oblici` je tablica po subjektu (`mbs`, `vrsta_pravnog_oblika_id`), a šifrarnik je `/vrste_pravnih_oblika`.
  NKD šifrarnik je `/nacionalna_klasifikacija_djelatnosti` (6400 redaka; verzije NKD 1994, 2002, 2007, 2025).
- Ključ za spajanje je **`mbs`**. U `subjekti`, `sjedista`, `pretezite_djelatnosti` i `pravni_oblici` je jedinstven
  (jedan redak po subjektu, bez duplikata). `sjedista` i `pravni_oblici` pokrivaju sve aktivne subjekte.
- Aktivnih subjekata je **186.639** (s neaktivnima 391.717). `only_active` = `1` ili `true` ili izostavljeno vraća aktivne,
  `0` ili `false` vraća sve. `/counts` vraća `table_name` s prefiksom `SRC_`, a šifrarnici imaju 0.
- **`sjedista`:** `sifra_zupanije`, `naziv_zupanije`, `sifra_opcine`, `naziv_opcine`, `sifra_naselja`, `naziv_naselja`, ulica...
  - Domaće sjedište prepoznajemo po tome da **`sifra_opcine` postoji** (185.912 retka). Strana sjedišta (727) nemaju `sifra_opcine`,
    a imaju `naselje_van_sifrarnika`.
  - **Ne koristiti `drzava_id` za filtar.** Spec kaže da je NULL za domaća sjedišta, ali u podacima je među domaćima 55 (95.667) ili NULL (90.245).
  - 556 različitih općina/gradova i 21 županija. OBŽ ima `sifra_zupanije` = 14, 42 JLS-a i 7.591 subjekata.
- **Pretežita djelatnost** ima dva izvora u različitim verzijama NKD-a:
  - `pretezite_djelatnosti.nacionalna_klasifikacija_djelatnosti_id` je ID u šifrarniku. 82.654 retka: NKD 2025 (80.251, šifra oblika `69.20.1`),
    NKD 2007 (2.401, oblika `47.11`) i NKD 2002 (2).
  - `subjekti.glavna_djelatnost` je NKD 2007 s 4 znamenke bez točke (100 % se poklapa sa šifrarnikom; 3 znamenke znači vodeća nula). Popunjeno kod 60.560 aktivnih.
- **Filtra po županiji ili općini nema.** `sifra_zupanije` i `sifra_opcine` kao parametri se ignoriraju, pa se povlači sve i filtrira lokalno.
- **Brzina:** `limit` 1000 je siguran. Veći limit (5000, 10000) ponekad prođe, ali prekida vezu (`ConnectionError`, `ChunkedEncodingError`).
  Puni dohvat 4 tablica trajao je **832 s** (`subjekti` 670 s zbog ponovljenih stranica, `sjedista` 78 s, `pravni_oblici` 58 s, `pretezite_djelatnosti` 26 s).
  Server javlja ~0,06 s po stranici, pa je usko grlo prijenos, a ne upit.
- Prolazni 503 ("ORDS ne može do baze") viđen je jednom na spec URL-u; klijent ponavlja zahtjeve s backoffom.
- **Snapshot:** `staleness` 1 je zadnji. Vrijednost `-1` označava istekli snapshot i API ga odbija (HTTP 400, `error_code` 503). ID-jevi nisu poredani po starosti.

OpenAPI dokumentacija je na `https://sudreg-data.gov.hr/api/javni/dokumentacija/open_api`. Pri prvom pokretanju spremi spec u `docs/sudreg_openapi.json`.

Licenca: Otvorena dozvola RH (NN 67/17). Izvor je obavezno navesti.

Opis skupa na Portalu: https://data.gov.hr/ckan/dataset/sudski-registar

**Obrti NISU u Sudskom registru**, vidi odluku D3.

### 3.2 Ostali izvori (svi NEPROVJERENI dok se ne otvore; zadatak dana 1–2)

- **DZS Popis stanovništva 2021.** po JLS-u: ukupno stanovništvo i dobne skupine (0–14, 15–64, 65+).
  Traži na data.gov.hr (CKAN API) i podaci.dzs.hr.
- **Indeks razvijenosti JLS:** Odluka o razvrstavanju JLP(R)S prema stupnju razvijenosti, NN 3/2024.
  Iz nje trebamo vrijednost indeksa i skupinu za svaki JLS.
- **DZS "Statistika u nizu – Registar poslovnih subjekata"** na data.gov.hr služi kao kontrolni zbroj.
- **NKD šifrarnik** (DZS): službeni nazivi razreda i odjeljaka (NKD 2007; provjeriti i NKD 2025).
  Treba nam i tablica korespondencije ako Sudreg koristi drugu verziju.
- **Granice JLS-a** (GeoJSON sa šifrom JLS-a). Prvo traži službeni izvor (DGU / Registar prostornih jedinica).
  Ako nije otvoren, uzmi otvoreni izvedeni skup s navedenom licencom.
- **data.gov.hr CKAN API** (`https://data.gov.hr/ckan/api/3/action/...`): uživo prikazujemo
  "izvor i datum zadnjeg ažuriranja" svakog skupa (`package_show`).

### 3.3 Ključ za spajanje

Ključ je **šifra JLS-a**. **Najveći rizik je usklađenost šifri** između Sudreg-a (`sjedista`) i DZS-a.
Ako se šifre ne slažu, spajaj po normaliziranom nazivu JLS-a i županiji te ručno provjeri sve neuparene.

## 4. Metodološke odluke (donesene; mijenjaju se samo uz obrazloženje u odjeljku 9)

- **D1. Jedinica analize:** JLS × **NKD odjeljak** (2 znamenke).
  Razred (4 znamenke) prikazuje se samo kao informacija o broju subjekata, bez modela, jer su ćelije premale.
- **D2. Obuhvat subjekata:** aktivni subjekti (zadano `only_active`) sa sjedištem u RH.
  - Uključuju se oblici usmjereni tržištu: d.o.o., j.d.o.o., d.d., j.t.d., k.d. i zadruge.
  - Isključuju se ustanove, udruge, podružnice i strani subjekti.
  - **Popis oblika (PROVJERENO 27.10.), filtar po `vrsta_pravnog_oblika_id`, ne po `sifra`** (šifre 11 i 14 se ponavljaju):
    d.o.o. = 5 (133.457), j.d.o.o. = 81 (43.677), zadruga = 9 (1.139), d.d. = 4 (598), j.t.d. = 1 (188), k.d. = 2 (49).
    Ukupno **179.108** aktivnih tržišnih subjekata (179.105 s domaćim sjedištem).
  - Isključeno: ustanova (id 7, 5.376), inozemna podružnica (11), stečajna i likvidacijska masa (121, 142), g.i.u. (3), kreditna unija (13),
    savezi zadruga (12, 64), europski oblici (21, 22, 23), športska/sportska dionička društva (14, 101), dr.o. (10), t.p. (6), z.u. (8).
    Granični slučajevi (t.p., europska društva) su vrlo mali (ukupno ≤ 20 subjekata), pa ne utječu na model.
  - Lokacija subjekta je JLS njegova sjedišta.
- **D3. Obrti:** otvoreni podaci o broju obrta po JLS-u i djelatnosti nisu provjereni.
  - **Brojke se ne korigiraju izmišljenim faktorom.**
  - Model radi **zasebno po odjeljku**. Ako je udio obrta u nekom odjeljku približno jednak u svim JLS-ovima, relativni deficit ostaje valjan.
  - Pristranost postoji samo ako se udio obrta razlikuje po regijama. To transparentno pišemo u UI-ju ("Pokrivenost: trgovačka društva i zadruge, bez obrta") i u videu.
  - Odjeljci u kojima obično prevladavaju obrti dobivaju oznaku **"niža pouzdanost"**: 96 (osobne usluge, npr. frizeri), 43, 56, 95, 01. Popis se dorađuje ako nađemo podatke.
  - **Usklađeno s NKD 2025 (PROVJERENO 27.10., D12):** odjeljci 01, 43, 56, 95 i 96 postoje. **Odjeljak 45 ne postoji u NKD 2025** i izbačen je iz popisa.
    Popravak motornih vozila (obrtnička djelatnost) je sada razred 95.31 (motocikli 95.32) u odjeljku 95, koji je već na popisu.
    Trgovina motornim vozilima prešla je u razrede 46.71, 46.72, 47.81 i 47.82 (odjeljci 46 i 47 nisu na popisu).
    Jedini odjeljak NKD 2007 kojeg nema u NKD 2025 je 45, a NKD 2025 nema novih odjeljaka u odnosu na 2007.
  - Ako se nađe otvoreni agregat obrta, uvodi se kao dodatni izvor.
- **D4. Model:** za svaki odjeljak *d* broj subjekata u JLS-u *j* modelira se kao `O_jd ~ NegBin(μ_jd, α_d)`.
  - Struktura: `log μ_jd = log(pop_j) + β_d · x_j`.
  - Značajke: udio 65+, udio 0–14, indeks razvijenosti, grad ili općina te leave-one-out stopa subjekata tog odjeljka u ostatku županije.
  - v1 je GLM (statsmodels), interpretabilan i s prirodnim intervalima. GBM s Poissonovim gubitkom (LightGBM) je izazivač i ulazi samo ako na CV-u pobijedi GLM.
  - **Baseline:** nacionalna stopa po stanovniku × broj stanovnika. Model mora pobijediti baseline, inače to iskreno navodimo.
- **D5. Semafor:** `p = P(Y ≤ O | μ, α)`.
  - **Nedostaje:** `p < 0,10`, tj. stvarno je ispod 10. percentila očekivane distribucije.
  - **Zasićeno:** `P(Y ≥ O) < 0,10`.
  - **Inače:** u ravnoteži.
  - UI uvijek prikazuje "stvarno O, očekivano μ (80 % interval a–b)" i tekst, nikad samo boju.
- **D6. Evaluacija:**
  - GroupKFold po županijama (21 grupa).
  - Metrike: Poissonova devijanca i MAE prema baselineu, pokrivenost 80 % intervala (cilj 0,75–0,85), PIT histogram.
  - Rezultati idu u `docs/evaluacija.md` i u video.
- **D7. NKD prijedlog iz teksta:**
  - v1: fuzzy pretraga (Fuse.js) nad službenim nazivima NKD razreda i ručnim sinonimima.
  - v2, ako stigne: `multilingual-e5-small` (MIT licenca) u pregledniku preko transformers.js, s unaprijed izračunatim embeddinzima NKD naziva.
  - Evaluacija: top-1 i top-3 točnost na oko 100 ručno označenih opisa ideja.
- **D8. Tržišni odlomak:** deterministički predložak. Svaka brojka dolazi iz podataka i ima izvor. **Bez LLM-a u v1.**
- **D9. Privatnost:** nikad ne dohvaćaj tablice o osobama (`osobe`, `ovlasti_osoba`, `subjekt_osoba`, članovi uprave).
  Javno objavljujemo samo agregate po JLS-u × odjeljku. Za pojedinačne subjekte dajemo samo poveznicu na službeni Sudski registar.
- **D10. Licenca koda:** EUPL-1.2. Podaci se navode u `DATA_SOURCES.md` s izdavačem, poveznicom, licencom i datumom dohvata.
- **D11. Subjekti bez NKD-a (27.10., mentor-revizor):** isključuju se iz modela, ali se broje.
  - UI prikazuje "X % subjekata u ovoj općini nema šifru djelatnosti".
  - Udio bez šifre računa se po JLS-u: nazivnik su tržišni subjekti sa sjedištem u JLS-u, a brojnik oni bez pretežite i bez glavne djelatnosti.
  - JLS-ovi s udjelom više od 2 SD iznad prosjeka dobivaju oznaku **"niža pouzdanost"**. Pretpostavka implementacije (potvrditi):
    neponderirani prosjek i SD preko svih JLS-ova u RH.
  - Djelatnost se **ne pogađa** iz naziva tvrtke.
  - Mjerenje: `pipeline/analiza_nkd.py`.
- **D12. Verzija NKD-a (27.10., mentor-revizor):** analiza je u **NKD 2025 na razini odjeljka** (2 znamenke).
  - Prvi izvor je pretežita djelatnost (`pretezite_djelatnosti`, verzija 2025). Ako je pretežita u NKD 2007, mapira se na 2025.
  - Zamjenski izvor je `subjekti.glavna_djelatnost` (NKD 2007), mapirana na 2025 preko **službene DZS tablice korespondencije** NKD 2007 ↔ NKD 2025.
    Tablica još nije pronađena. Ako ne postoji otvoreno, javiti Domagoju.
  - Kad razred iz 2007 vodi u više odjeljaka 2025, uzima se najčešći, empirijski iz subjekata koji imaju obje šifre.
  - Onih **68 % slaganja** (27.10.) vjerojatno je artefakt jer su uspoređeni odjeljci dviju različitih verzija.
    Nakon mapiranja slaganje se ponovno mjeri na istoj verziji. **Ako je ispod 85 %, STATI i javiti prije nastavka.**
- **D13. Postupci (27.10., mentor-revizor):** isključuju se samo postupci koji znače gašenje subjekta. Polje je `subjekti.postupak`.
  - Šifrarnik `/vrste_postupaka` (PROVJERENO 27.10.): 1 Bez postupka, **2 Stečaj**, **3 Likvidacija**, 4 Pokrenuta predstečajna nagodba,
    5 Odobrena predstečajna nagodba, 6 Otvoren predstečaj, 7 Potvrđen predstečajni sporazum.
  - **Isključuje se `postupak` ∈ {2, 3}.** Zadržavaju se 1 i 4–7 (predstečajna nagodba i predstečaj su restrukturiranje, subjekt posluje).
  - Brisanje: aktivni subjekti (`status` = 1) nisu brisani, pa nema dodatnog filtra (kod aktivnih nema ni polja `datum_brisanja`).
  - Učinak (tržišni oblici, snapshot 1349): isključeno **4.801** (2.511 stečaj i 2.290 likvidacija), zadržano **174.307** od 179.108.
    Skup vrijednosti u `subjekti.postupak` (1–7) odgovara šifrarniku.

## 5. Arhitektura (MVP bez poslužitelja)

```
GitHub Actions (noćni cron 02:00) ──> pipeline/ (Python)
   1. sudreg: token -> /snapshots -> paginirani dohvat (/subjekti, /sjedista, /pretezite_djelatnosti, /pravni_oblici) s istim snapshot_id
   2. dzs/indeks/nkd/granice: lokalne referentne datoteke u data/reference/ (dohvaćene jednom, s izvorom)
   3. build: spajanje -> matrica JLS × odjeljak -> model -> deficit, intervali, semafor
   4. export: web/public/data/*.json + jls.geojson + meta.json (snapshot_id, datumi, izvori)
        └──> GitHub Pages: web/ (Vite + React + TypeScript + MapLibre GL), statička aplikacija
```

- **Tajne:** `SUDREG_CLIENT_ID` i `SUDREG_CLIENT_SECRET` stoje u GitHub Secrets. Lokalno su u `.env`, koji je u `.gitignore`. **Tajne nikad ne idu u kod, logove ni chat.**
- **Plan B ako API ne radi:** zadnji uspješni snapshot (Parquet) ostaje u `data/snapshot/`. UI prikazuje "podaci od dd.mm.yyyy.".
- **Interoperabilnost:**
  - GeoJSON (RFC 7946);
  - JSON s dokumentiranom shemom;
  - `docs/openapi.yaml` opisuje statički "API" (`/data/deficit/{jls}.json`) i budući REST endpoint `/v1/deficit?jls=&nkd=`;
  - DCAT-AP opis izvedenog skupa "Indeks deficita djelatnosti po JLS-u", spreman za objavu na data.gov.hr.
- **Integracijski potencijal:** widget ili API za mjere.hzz.hr, povratna objava skupa na data.gov.hr i uključivanje u centralni data lake (NPOO C2.3. R2-I2).
- **Opcionalno, ako ostane vremena:** FastAPI na besplatnom hostingu. Nije dio MVP-a.

### Struktura repozitorija

```
CLAUDE.md  README.md  LICENSE (EUPL-1.2)  DATA_SOURCES.md  .env.example  .gitignore
pipeline/  sudreg_client.py  fetch_sudreg.py  reference.py  build.py  model.py  export.py  requirements.txt
data/reference/   (male referentne tablice, u gitu)    data/raw/ (gitignore)    data/snapshot/ (Parquet zadnjeg snapshota)
web/       (Vite app; public/data/ generira pipeline)
docs/      arhitektura.md  metodologija.md  evaluacija.md  openapi.yaml  sudreg_openapi.json  video_scenarij.md
.github/workflows/  nightly.yml (pipeline + commit podataka)  pages.yml (build i deploy weba)
```

## 6. Opseg MVP-a do 9.11.

**MORA:**
- [ ] ingest iz Sudreg-a (API, isti snapshot)
- [ ] spajanje s DZS-om i indeksom razvijenosti
- [ ] model i evaluacija
- [ ] semafor s intervalom
- [ ] početni ekran: opis ideje → NKD prijedlog + izbor općine
- [ ] ekran rezultata s objašnjenjem "kako smo izračunali"
- [ ] karta županije po deficitu za odabrani odjeljak
- [ ] tržišni odlomak (kopiraj/ispis)
- [ ] stranica "Izvori i ažurnost" (uživo iz CKAN-a)
- [ ] noćni GitHub Actions i deploy na Pages
- [ ] dokumentacija i video

**DALJNJI RAZVOJ** (spomenuti u videu, ne raditi):
- obrti iz službenog agregata
- turizam (eVisitor) za sezonske djelatnosti
- GFI prihodi za procjenu veličine tržišta
- preživljavanje poduzeća
- REST API i integracija s HZZ-om i e-Građanima

## 7. Plan po danima (S1 = podaci/ML, S2 = backend/integracije, S3 = frontend/video; ako sve radi Domagoj s Claudeom, redoslijed ostaje)

| Datum | Cilj dana |
|---|---|
| 27.10. (uto) | registracija na sudreg-data.gov.hr; repo; ova datoteka |
| 28.10. (sri) | sudreg klijent i prvi poziv (`/snapshots`, `/counts`, OpenAPI spec); DZS i indeks razvijenosti u `data/reference/`; upit Organizatoru |
| 29.10. (čet) | puni ingest za OBŽ, zatim RH; spajanje šifri JLS-a; **GO/NO-GO navečer** |
| 30.10. (pet) | **sve prijave predane do 18:00**; EDA; kontrolni zbroj prema DZS-u (±10 %) |
| 31.10. (sub) | model v1 i CV; kostur weba i karta |
| 01.11. (ned, Svi sveti) | odmor ili lagano |
| 02.11. (pon) | semafor i intervali; ekran rezultata; nightly workflow |
| 03.11. (uto) | NKD prijedlog; tržišni odlomak; stranica izvora |
| 04.11. (sri) | **sve radi s kraja na kraj** i deploy; oznake pouzdanosti |
| 05.11. (čet) | test s 3–5 stvarnih korisnika; ispravci UX-a; pristupačnost (WCAG AA, tekst uz boju) |
| 06.11. (pet) | **feature freeze**; snimke zaslona; `evaluacija.md` |
| 07.11. (sub) | dokumentacija (arhitektura, metodologija, `DATA_SOURCES`, `openapi`, DCAT-AP) |
| 08.11. (ned) | snimanje i montaža videa (≤ 2:55) |
| 09.11. (pon) | provjera svih poveznica; oznaka `v1.0-datathon`; **slanje do 18:00** |

**GO/NO-GO (29.10.):** GO ako Sudreg vraća za OBŽ šifru općine sjedišta i NKD pretežite djelatnosti, i ako se šifre JLS-a mogu spojiti s DZS-om.
Inače prelazimo na plan B, "Zdravlje Portala" (asistent kvalitete metapodataka data.gov.hr preko CKAN API-ja), u istom izazovu C.

## 8. Pravila rada za Claude

1. Radi u **malim, provjerljivim koracima**. Nakon svakog koraka pokreni kod ili test i pokaži rezultat. Commitaj često, s jasnim porukama na hrvatskom.
2. **Prvo neka radi, zatim neka je lijepo.** Ne dodaji ništa izvan odjeljka 6 bez dogovora.
3. **Ne izmišljaj:** endpointe, nazive polja, URL-ove, brojke. Provjeri na stvarnom odgovoru. Što nije provjereno, označi s NEPROVJERENO u ovoj datoteci.
4. Kod piši čitljivo, s kratkim komentarima na hrvatskom koji objašnjavaju *zašto*. Domagoj će kod učiti naknadno. Uz veće module dodaj kratak "kako ovo radi" u `docs/`.
5. Tajne nikad ne ispisuj ni ne commitaj. Prije svakog commita provjeri `git diff`.
6. Svaku novu odluku ili činjenicu o podacima zapiši u odjeljak 9 ili 10.
7. Python 3.11+, `requests`, `pandas`, `pyarrow`, `duckdb`, `statsmodels`, `scikit-learn`. Web: Vite, React, TS, MapLibre GL, Fuse.js. Sve open-source; licence navedi u `DATA_SOURCES.md` i README-u.
8. Komuniciraj s Domagojem na hrvatskom, kratko i konkretno. Kad nešto mora napraviti on (registracije, tajne, prijave), reci točno korak po korak.

## 9. Dnevnik odluka i provjera

- 27.10.: odabrana ideja NišaRadar za izazov C; licenca EUPL-1.2; arhitektura bez poslužitelja; odluke D1–D10.
- 27.10. (provjera Sudreg API-ja, snapshot 1349): token i svi dohvati rade. Sjedište ima šifru i naziv općine i županije, a pretežita
  djelatnost NKD šifru preko ID-ja u šifrarniku. Ključ je `mbs`. Sudreg dio uvjeta GO/NO-GO je **ispunjen**, ali **spajanje šifri JLS-a sa DZS-om
  još nije provjereno**, pa je ukupna odluka uvjetno GO do 29.10.
  - Pokrivenost NKD-a među tržišnim subjektima: pretežita 46,0 %, `glavna_djelatnost` 32,5 %, barem jedno 75,8 %, bez ikakve NKD šifre 43.371 (24,2 %).
    U OBŽ-u: barem jedno 78,8 %, bez NKD-a 1.524 (21,2 %).
  - Kad subjekt ima oba izvora, odjeljak se poklapa u samo 68,0 % slučajeva (NKD 2025 prema NKD 2007). **Vjerojatni artefakt**: uspoređeni su odjeljci
    dviju različitih verzija (vidi D12).
  - Puni dohvat 4 tablica trajao je 832 s (procjena iz smoke testa od 2,2 min bila je prenisko).
  - Spec je u dva slučaja netočan prema podacima: `drzava_id` za domaća sjedišta i `staleness` -1 (vidi 3.1).
- 27.10. (navečer, pregled s mentorom-revizorom): doneseni D11 (subjekti bez NKD-a), D12 (NKD 2025 na razini odjeljka, mapiranje 2007 → 2025) i D13 (isključuju se
  stečaj i likvidacija). D3 usklađen s NKD 2025: odjeljak 45 ne postoji, popravak motornih vozila je u 95.
  - `pipeline/analiza_nkd.py` ponovio mjerenje: 174.304 tržišna subjekta u analizi (D2 + D13), 76,0 % ima šifru (OBŽ 78,8 %), bez šifre 41.877 (24,0 %).
    Udio bez šifre po JLS-u: prosjek 21,4 %, SD 8,2 %, prag 37,7 %. Oznaku "niža pouzdanost" dobiva 19 od 556 JLS-ova (nijedan u OBŽ-u), većinom vrlo male općine
    (15 JLS-ova ima manje od 10 subjekata). Beli Manastir ima 28,6 % (42/147), ispod praga.

## 10. Otvorena pitanja / NEPROVJERENO

- [x] Točna polja v3 tablica `/sjedista` i `/pretezite_djelatnosti` (zatvoreno 27.10., vidi 3.1)
- [x] Pravni oblici: popis i šifre za filtar D2 (zatvoreno 27.10., vidi D2)
- [x] **24 % tržišnih subjekata nema NKD šifru** (RH 43.371, OBŽ 1.524): odlučeno u D11 (isključeni iz modela, broje se, oznaka po JLS-u). Najveći udio bez NKD-a ima godina osnivanja 2019. (43 %) i 2020. (17,5 %); 2.804 ih nema datum osnivanja.
- [x] **Dvije verzije NKD-a:** odlučeno u D12 (NKD 2025, odjeljak, mapiranje 2007 → 2025). Otvoreno ispod: korespondencija i ponovno mjerenje slaganja.
- [ ] Pronaći **službenu DZS tablicu korespondencije NKD 2007 ↔ NKD 2025**. Ako ne postoji otvoreno, javiti Domagoju (D12).
- [ ] Nakon mapiranja ponovno izmjeriti slaganje odjeljaka na istoj verziji (prag 85 %, ispod toga stati; D12). Dosadašnjih 68 % uspoređivalo je različite verzije.
- [ ] Potvrditi pretpostavku iz D11 (neponderirani prosjek i SD po JLS-ovima) i popis odjeljaka "niža pouzdanost" u NKD 2025 (D3) nakon mapiranja.
- [ ] Šifre u `pretezite_djelatnosti` s NKD 2002 (2 retka) nemaju pravilo mapiranja u D12.
      Ako oba postoje, odjeljak se poklapa u samo 68 % slučajeva. Ne znamo je li to promjena koda ili stvarna promjena djelatnosti.
- [x] Subjekti u postupku: odlučeno u D13 (isključuju se stečaj i likvidacija, 4.801 tržišni subjekt).
- [ ] Značenje `drzava_id` = 55 kod domaćih sjedišta (vjerojatno Hrvatska, provjeriti u `/drzave`).
- [ ] **Spajanje šifre općine iz Sudrega (DGU šifra, npr. Osijek 3123, Virovitica 4910) s DZS-om i indeksom razvijenosti.** To je preostali uvjet GO/NO-GO.
- [ ] Robusnost dohvata: veza se prekida pri većim stranicama. `fetch_sudreg.py` treba spremati stranice postupno (checkpoint) i moći nastaviti nakon prekida veze, uz isti `snapshot_id`.
- [ ] Izvor i format Popisa 2021. po JLS-u s dobnim skupinama
- [ ] Indeks razvijenosti (NN 3/2024) u strojno čitljivom obliku
- [ ] Otvorene granice JLS-a (GeoJSON) i licenca
- [ ] Postoji li otvoreni agregat obrta po JLS-u / NKD-u
- [ ] Upit na open.data@mpudt.hr: kako se računa 60 bodova kad je ukupno "zbroj bodova članova Povjerenstva"; tko je voditelj tima
- [ ] Administracija: mentor potvrđen? drugi student? svi prijavljeni do 30.10.?

## 11. Sljedeći korak (ažurirano 27.10. navečer)

1. **DZS Popis 2021. + indeks razvijenosti + provjera šifri JLS-a = zadnji uvjet GO/NO-GO.**
   Sudregov `sifra_opcine` (DGU šifra; 556 JLS-ova, OBŽ 42) usporediti sa šiframa u DZS-u i u NN 3/2024.
   Neuparene ručno provjeriti (vidi 3.3). Podaci idu u `data/reference/`.
2. **DZS korespondencija NKD 2007 ↔ NKD 2025 i mapiranje po D12.**
   Pronaći službenu tablicu (ako nije otvorena, javiti Domagoju). Mapirati `glavna_djelatnost` i NKD 2007 iz pretežite na odjeljak 2025.
   Ponovno izmjeriti slaganje odjeljaka na istoj verziji. **Ispod 85 % stati i javiti prije nastavka.**
3. **RANI TEST: minimalni GitHub Actions workflow** koji samo dohvati token i `/snapshots` iz Sudreg-a sa GitHub Secrets (bez dohvata podataka),
   da vidimo propušta li API IP adrese GitHub runnera. Preduvjet: Domagoj dodaje secrets `SUDREG_CLIENT_ID` i `SUDREG_CLIENT_SECRET`
   (GitHub repozitorij → Settings → Secrets and variables → Actions → New repository secret).
4. `fetch_sudreg.py` s checkpointom po stranicama (nastavak nakon prekida veze, isti `snapshot_id`), vidi odjeljak 10.
