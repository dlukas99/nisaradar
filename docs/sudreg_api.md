# Sudski registar – javni API (v3.0.4): što piše u OpenAPI specifikaciji

Izvor: `https://sudreg-data.gov.hr/api/javni/dokumentacija/open_api` (spremljeno u `docs/sudreg_openapi.json`,
OpenAPI 3.0.1, "Sudski registar api - javni", verzija **v3.0.4**, preuzeto 27.10.2026.).
Ovaj dio dokumenta je **samo iz specifikacije**. Što je potvrđeno na stvarnom odgovoru nalazi se u odjeljku
"Provjera na stvarnom odgovoru" na dnu.

Autentikacija: OAuth2 (client credentials) ili zaglavlje `Authorization`. Svi endpointi su `GET`.

## 1. Zajednički parametri

| Parametar | Tip | Značenje (iz specifikacije) |
|---|---|---|
| `snapshot_id` | integer | Set podataka koji se preuzima; ako se ne zada, vraća se najnoviji. |
| `offset` | integer | 0-based redni broj prvog retka. |
| `limit` | integer | Veličina stranice; zadano 1000. |
| `omit_nulls` | string | Izostavlja li se prazne (null) ključeve; **ako se ne navede, izostavljaju se**. Zato polje koje "nedostaje" u JSON-u znači null. |
| `no_data_error` | string | Vraća li zahtjev bez rezultata grešku (`1`) ili prazan objekt (`0`); zadano je greška. |
| `expand_relations` | string | Samo na nekim endpointima (vidi dolje): vraća povezane vrijednosti umjesto samo ID-jeva. |
| `history_columns` | string | Samo na šifrarnicima (vidi dolje). |
| `Content-Type` (header) | string | Format odgovora `application/json` ili `application/xml`. |

Zaglavlja odgovora (gdje su navedena): `X-Snapshot-Id`, `X-Timestamp`, `X-Total-Count`, `X-Seconds-Elapsed`,
`X-Rows-Returned`, `X-Log-Id`. Greške: 400 (krivi parametri), 500 (neočekivana greška).

## 2. Svi endpointi (39)

### Tablice podataka (parametri: `snapshot_id, offset, limit, no_data_error, omit_nulls`)

| Endpoint | Opis iz specifikacije | Dodatni parametri |
|---|---|---|
| `/subjekti` | Osnovni podaci o subjektima | `tvrtka_naziv`, `only_active` |
| `/sjedista` | Sjedišta i adrese subjekata | |
| `/pretezite_djelatnosti` | Pretežite djelatnosti subjekata | |
| `/pravni_oblici` | Pravni oblici subjekata | `expand_relations` |
| `/predmeti_poslovanja` | Predmeti poslovanja (djelatnosti) subjekata | `expand_relations` |
| `/evidencijske_djelatnosti` | Popis evidencijskih djelatnosti subjekata | |
| `/tvrtke` | Tvrtke (nazivi) subjekata | |
| `/skracene_tvrtke` | Skraćene tvrtke | |
| `/prijevodi_tvrtki` | Prijevodi tvrtki | |
| `/prijevodi_skracenih_tvrtki` | Prijevodi skraćenih tvrtki | |
| `/inozemni_registri` | Podaci o inozemnim registrima (za ino subjekte) | |
| `/email_adrese` | E-mail adrese subjekata | |
| `/temeljni_kapitali` | Temeljni kapitali | |
| `/postupci` | Postupci nad subjektima | |
| `/statusni_postupci` | Statusni postupci (pravni odnosi) | |
| `/partneri_statusnih_postupaka` | Partneri u statusnim postupcima | |
| `/objave_priopcenja` | Načini objave priopćenja | |
| `/gfi` | Predana godišnja financijska izvješća | |
| `/promjene` | Zadnje promjene nad subjektima | |
| `/nazivi_podruznica`, `/skraceni_nazivi_podruznica` | Nazivi podružnica | |
| `/sjedista_podruznica` | Sjedišta podružnica | |
| `/email_adrese_podruznica` | E-mail adrese podružnica | |
| `/djelatnosti_podruznica` | Djelatnosti podružnica | |

### Šifrarnici

| Endpoint | Opis | Parametri uz `snapshot_id, no_data_error, omit_nulls` |
|---|---|---|
| `/nacionalna_klasifikacija_djelatnosti` | **NKD šifrarnik** | `history_columns` |
| `/vrste_pravnih_oblika` | Vrste pravnih oblika | `history_columns` |
| `/sudovi` | Sudovi | `expand_relations`, `history_columns` |
| `/drzave`, `/jezici` | Države, jezici | `history_columns` |
| `/valute` | Valute | `expand_relations`, `history_columns` |
| `/bris_pravni_oblici`, `/bris_registri` | BRIS šifrarnici | `expand_relations`, `history_columns` |
| `/vrste_statusnih_postupaka` | Vrste statusnih postupaka | `history_columns` |
| `/statusi`, `/vrste_gfi_dokumenata`, `/vrste_postupaka` | Ostali šifrarnici | (samo osnovni) |

### Meta i pojedinačni upit

| Endpoint | Opis | Parametri |
|---|---|---|
| `/snapshots` | Popis snimki (snapshotova) | `no_data_error, omit_nulls` |
| `/counts` | Broj aktivnih redaka po tablici | `snapshot_id, no_data_error, omit_nulls` |
| `/detalji_subjekta` | Svi podaci o jednom subjektu. **Ne koristimo za skupni dohvat (6 zahtjeva/min).** | `snapshot_id, expand_relations, no_data_error, omit_nulls, tip_identifikatora, identifikator` |

**Napomena o privatnosti (D9):** u specifikaciji **nema** zasebnih endpointa za osobe (nema `osobe`, `ovlasti_osoba`
ni `subjekt_osoba`). Osobni podaci mogu biti samo unutar `/detalji_subjekta`, koji ne koristimo.

**Napomena o šifrarnicima lokacija:** specifikacija izričito kaže da šifrarnici županija, općina, naselja i ulica
**nisu uključeni u servis** jer su vlasništvo DGU-a. Šifre u `sjedista` odgovaraju DGU šifrarnicima.

## 3. Polja ključnih tablica

Svi tipovi su iz specifikacije. "Obavezno" znači `required` u shemi (NOT NULL).

### `/subjekti`
| Polje | Tip | Značenje |
|---|---|---|
| `mbs` | int32, obavezno | Matični broj subjekta u sudskom registru (**primarni ključ**) |
| `status` | int32, obavezno | 1 = aktivan, 0 = neaktivan/brisan |
| `sud_id_nadlezan`, `sud_id_sluzba` | int64, obavezno | ID nadležnog suda / stalne službe |
| `postupak` | int32, obavezno | Postupak u kojem je subjekt (stečaj, likvidacija, ...) |
| `ino_podruznica` | int32, obavezno | 1 = podružnica inozemnog osnivača |
| `stecajna_masa`, `likvidacijska_masa` | int32, obavezno | Oznake mase |
| `oib` | int64 | OIB (nije uvijek upisan) |
| `mb` | int32 | Matični broj poslovnog subjekta (DZS) |
| `glavna_djelatnost` | int32 (NUMBER(5)) | "Šifra glavne djelatnosti prema NKD šifrarniku" |
| `glavna_podruznica_rbr` | int32 | Redni broj glavne podružnice ino osnivača |
| `datum_osnivanja`, `datum_brisanja` | date-time | Osnivanje / brisanje |
| `mbs_brisanog_subjekta`, `sud_id_brisanja`, `tvrtka_kod_brisanja`, `poslovni_broj_brisanja` | | Podaci o brisanju |

Parametar `only_active`: "ako se ne zada, vraćaju se samo aktivni podaci". Dopuštene vrijednosti nisu navedene u specifikaciji.

### `/sjedista` (prirodni ključ `mbs`, podređena tablici `subjekti`)
| Polje | Tip | Značenje |
|---|---|---|
| `mbs` | int32, obavezno | veza na `subjekti.mbs` |
| `drzava_id` | int64 | ID države; **za domaća sjedišta je NULL** |
| `sifra_zupanije`, `naziv_zupanije` | int32, string | Županija (DGU šifra) |
| `sifra_opcine`, `naziv_opcine` | int32, string | **Općina/grad** (DGU šifra) |
| `sifra_naselja`, `naziv_naselja` | int64, string | Naselje |
| `naselje_van_sifrarnika` | string | Strano naselje (inozemne adrese) |
| `sifra_ulice`, `ulica`, `kucni_broj`, `kucni_podbroj`, `postanski_broj` | | Adresa |

Upozorenje iz specifikacije: kod starijih unosa adresa je često cijela upisana u polje `ulica` ili strano naselje.

### `/pretezite_djelatnosti` (prirodni ključ `mbs`, podređena tablici `subjekti`)
| Polje | Tip | Značenje |
|---|---|---|
| `mbs` | int32, obavezno | veza na `subjekti.mbs` |
| `nacionalna_klasifikacija_djelatnosti_id` | int64, obavezno | **ID** (ne šifra) iz `/nacionalna_klasifikacija_djelatnosti.id` |

Djelatnost određuje DZS Obavijesti o razvrstavanju.

### `/pravni_oblici` (prirodni ključ `mbs`, podređena tablici `subjekti`)
| Polje | Tip | Značenje |
|---|---|---|
| `mbs` | int32, obavezno | veza na `subjekti.mbs` |
| `vrsta_pravnog_oblika_id` | int64, obavezno | ID iz `/vrste_pravnih_oblika.id` |

S `expand_relations` umjesto ID-ja vraća se ugniježđeni objekt `vrsta_pravnog_oblika`.

### `/vrste_pravnih_oblika` (šifrarnik pravnih oblika)
`id` (int64, PK), `sifra` (int32), `naziv` (string), `kratica` (string), `vrijedi_od`, `vrijedi_do`, `status`.

### `/nacionalna_klasifikacija_djelatnosti` (NKD šifrarnik)
`id` (int64, PK), `sifra` (string, do 7 znakova), `puni_naziv` (string), `verzija` (string, "NKD 2002, NKD 2007, ..."),
`vrijedi_od`, `vrijedi_do`, `status`.
Opis iz specifikacije: ista šifra u različitim verzijama u pravilu **ne** predstavlja istu djelatnost; od 1.1.2025.
uvodi se nova verzija s **pet znamenki** umjesto četiri.

### `/snapshots`
`id` (int64), `timestamp`, `available_until`, `staleness` (1 = zadnja, 2 = predzadnja, ...), `description`.

### `/counts`
`table_name` (string), `count_aktivni` (int64). Zaglavlja: `X-Snapshot-Id`, `X-Timestamp`.

## 4. Provjera na stvarnom odgovoru (27.10.2026., snapshot 1349)

Dobiveno `pipeline/smoke_test.py` (uzorci i probe) i jednokratnim punim dohvatom 4 tablica (`limit=1000`, 832 s).
Brojke su za jedan snapshot i mijenjat će se svaki radni dan.

| Pitanje | Rezultat |
|---|---|
| Aktivni subjekti | 186.639 (s neaktivnima 391.717). `only_active` = `1`/`true`/izostavljeno: aktivni; `0`/`false`: svi. |
| Ključ spajanja | `mbs`. Jedinstven u `subjekti`, `sjedista`, `pretezite_djelatnosti` i `pravni_oblici` (nema duplikata). |
| Pokrivenost po tablici | `sjedista` i `pravni_oblici` imaju 186.639 redaka, `pretezite_djelatnosti` 82.654. |
| Domaće sjedište | `sifra_opcine` postoji (185.912). 727 stranih sjedišta nema `sifra_opcine`, ali ima `naselje_van_sifrarnika`. |
| `drzava_id` | **Razlikuje se od specifikacije:** domaća sjedišta imaju `drzava_id` = 55 (95.667) ili NULL (90.245). Ne koristiti kao filtar. |
| JLS | 556 različitih `sifra_opcine` (par šifra, naziv je jedinstven), 21 županija. OBŽ: `sifra_zupanije` 14, 42 JLS, 7.591 subjekata. |
| Verzije NKD-a u `pretezite_djelatnosti` | NKD 2025: 80.251 (šifra tipa `69.20.1`), NKD 2007: 2.401, NKD 2002: 2. |
| `subjekti.glavna_djelatnost` | NKD 2007 s 4 znamenke bez točke (100 % od 60.560 se nalazi u NKD 2007 šifrarniku), 3 znamenke = vodeća nula. |
| Filtar po lokaciji | **Nema.** `sifra_zupanije` i `sifra_opcine` kao query parametri se ignoriraju (`X-Total-Count` ostaje isti). |
| Veličina stranice | 1000 pouzdano. 5000 i 10000 su kod nas ponekad prošli, a ponekad prekinuli vezu (`ConnectionError`, `ChunkedEncodingError`). |
| Trajanje punog dohvata (4 tablice) | 832 s. Server mjeri ~0,06 s po stranici, pa je usko grlo prijenos. |
| Snapshotovi | `staleness` 1 je zadnji. Vrijednost -1 je istekli snapshot i API ga odbija (HTTP 400, `error_code` 503). |

### Pravni oblici (aktivni subjekti)

Filtrirati po `vrsta_pravnog_oblika_id`, ne po `sifra` (šifre 11 i 14 imaju po dva retka u šifrarniku).

| id | kratica | broj | D2 |
|---|---|---|---|
| 5 | d.o.o. | 133.457 | uključeno |
| 81 | j.d.o.o. | 43.677 | uključeno |
| 9 | z. (zadruga) | 1.139 | uključeno |
| 4 | d.d. | 598 | uključeno |
| 1 | j.t.d. | 188 | uključeno |
| 2 | k.d. | 49 | uključeno |
| 7 | u. (ustanova) | 5.376 | isključeno |
| 121, 142 | s.m., l.m. (stečajna, likvidacijska masa) | 985, 304 | isključeno |
| 11 | i.p. (inozemna podružnica) | 724 | isključeno |
| ostalo | dr.o., g.i.u., k.u., s.d.d., š.d.d., s.c.e., e.g.i.u., t.p., z.u., s.z., z.s., s.e. | 142 ukupno | isključeno |

Tržišni oblici ukupno: **179.108**.

### Pokrivenost NKD-a (tržišni subjekti sa domaćim sjedištem)

| | RH (179.105) | OBŽ (7.199) |
|---|---|---|
| ima `pretezite_djelatnosti` | 46,0 % | 48,9 % |
| ima `glavna_djelatnost` | 32,5 % | 31,7 % |
| ima barem jedno | 75,8 % | 78,8 % |
| nema nijednu NKD šifru | 43.371 (24,2 %) | 1.524 (21,2 %) |

Ako subjekt ima oba izvora (4.771 slučaj), odjeljak (prve 2 znamenke) je isti u samo 68,0 % slučajeva. To je vjerojatno artefakt jer su
uspoređeni odjeljci dviju različitih verzija (NKD 2025 prema NKD 2007). Slaganje treba ponovno izmjeriti nakon mapiranja na istu verziju (D12).
Brojke iz `pipeline/analiza_nkd.py` nakon D13: 174.304 subjekta u analizi, 76,0 % ima šifru, OBŽ 78,8 %.
Udio subjekata bez NKD-a najveći je za godine osnivanja 2019. (43 %) i 2020. (17,5 %); 2.804 ih nema datum osnivanja.

### Što je ostalo neprovjereno
- Jesu li `sifra_opcine` iz Sudrega (DGU šifre) jednake šiframa u DZS-u i indeksu razvijenosti.
- Značenje `drzava_id` = 55.
- Može li se `predmeti_poslovanja` upotrijebiti kao fallback za subjekte bez NKD-a.
- Uzrok različitog odjeljka u 32 % slučajeva s oba izvora i tablica korespondencije NKD 2007 ↔ 2025.
