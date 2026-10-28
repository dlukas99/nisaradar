# Metodologija

Odluke su numerirane (D1–D16) i vode se u `CLAUDE.md`. Ovdje je sažetak za čitatelja.

## 1. Obuhvat (D2, D13)

- Aktivni subjekti Sudskog registra (`only_active`) sa sjedištem u RH. Domaće sjedište prepoznajemo po postojanju
  `sifra_opcine` (polje `drzava_id` nije pouzdano).
- Tržišni pravni oblici (filtar po `vrsta_pravnog_oblika_id`): d.o.o. (5), j.d.o.o. (81), zadruga (9), d.d. (4),
  j.t.d. (1), k.d. (2). Ustanove, udruge, podružnice i strani subjekti su isključeni.
- Isključeni su subjekti u stečaju (postupak 2) ili likvidaciji (3). Predstečajni postupci ostaju jer subjekt posluje.
- Ishod (snapshot 1349): **174.304** subjekta. Lokacija subjekta je JLS njegova sjedišta.

## 2. Djelatnost (D1, D11, D12, D14)

- Jedinica analize je **JLS × odjeljak NKD 2025.** (2 znamenke). Razred (4 znamenke) prikazuje se samo informativno.
- Redoslijed izvora:
  1. pretežita djelatnost u NKD 2025;
  2. pretežita djelatnost u NKD 2007, mapirana na 2025;
  3. `subjekti.glavna_djelatnost` (NKD 2007), mapirana na 2025.
- Mapiranje 2007 → 2025 radi se po službenoj DZS tablici veza. Kad razred 2007 vodi u više odjeljaka 2025 (50 razreda),
  uzima se odjeljak koji je najčešći među subjektima s obje šifre.
- Subjekti bez ikakve šifre (24,0 %) isključuju se iz modela, ali se broje. Udio bez šifre po JLS-u prikazuje se u UI-ju.
  JLS-ovi s udjelom većim od prosjek + 2 SD (37,7 %) dobivaju oznaku "niža pouzdanost" (19 JLS-ova, nijedan u OBŽ-u).
- **Slaganje izvora (D14):** kod subjekata koji imaju i pretežitu (2025) i glavnu djelatnost, odjeljak se nakon mapiranja
  poklapa u 73,3 % slučajeva. Razlika nije artefakt mapiranja: i bez mapiranja (oba izvora u NKD 2007) poklapanje je samo 26 %.
  Izvori dakle mjere različite stvari. Zato:
  - glavni model koristi oba izvora (pokrivenost 76 %);
  - model se ponavlja **samo na pretežitoj djelatnosti** i za svaku ćeliju prikazuje je li nalaz potvrđen;
  - semafor je isti u 95,7 % ćelija. "Nedostaje" se na užem izvoru potvrđuje u 38 %, a "zasićeno" u 64 % slučajeva.

## 3. Model (D4)

Za svaki odjeljak *d* s barem 50 subjekata u RH (71 od 83 odjeljka) zasebno:

```
O_jd ~ NegBin(μ_jd, α_d)          (NB2: Var = μ + α μ²)
log μ_jd = log(stanovnika_j) + β_d0 + β_d · x_j
```

Značajke `x_j` (standardizirane):

- udio stanovnika 65+ i udio 0–14 (Popis 2021.);
- indeks razvijenosti (2024.);
- grad (1) ili općina (0);
- log-stopa subjekata istog odjeljka na 10.000 stanovnika **u ostatku županije** (leave-one-out, bez samog JLS-a;
  za Grad Zagreb nacionalna stopa bez Zagreba). Hvata regionalne razlike (npr. turizam na obali) bez curenja
  informacije o samom JLS-u.

Procjena: `statsmodels` NegativeBinomial (MLE, BFGS). Ako procjena ne konvergira, koristi se Poissonov GLM (α ≈ 0).

## 4. Semafor (D5)

Za stvarni broj O i prediktivnu razdiobu NegBin(μ, α):

- **Nedostaje:** `P(Y ≤ O) < 0,10`
- **Zasićeno:** `P(Y ≥ O) < 0,10`
- **U ravnoteži:** inače
- Odjeljci s manje od 50 subjekata u RH: **premalo podataka** (bez semafora)

UI uvijek prikazuje "stvarno O, očekivano μ (80 % raspon a–b)", gdje su a i b 10. i 90. percentil, uz tekst i ikonu.
Boja nikad ne nosi značenje sama.

Za diskretne brojeve je pravilo konzervativno. Kad je očekivanje malo (npr. μ = 1), ni 0 subjekata nije neobično, pa
"nedostaje" ne može izaći. To je namjerno: deficit tvrdimo samo kad je statistički uvjerljiv. Ishod je 0,7 % ćelija
"nedostaje", 4,9 % "zasićeno" i 94,4 % "u ravnoteži".

### Uži pogled po razredu (D15)

Kad korisnik odabere razred (4 znamenke), glavni zaključak je za razred. Očekivanje razreda u JLS-u je očekivanje odjeljka
pomnoženo s udjelom razreda u odjeljku u RH. Ako je broj u odjeljku NegBin(μ, α), a svaki subjekt neovisno pripada razredu s
vjerojatnošću s, broj u razredu je NegBin(sμ, α) s istim α. Zato raspon i semafor za razred idu istim pravilom (D5).

- Razred se dodjeljuje istim redoslijedom izvora kao odjeljak, a NKD 2007 se mapira na razred 2025 unutar istog odjeljka.
- Računa se samo za razrede s barem 50 subjekata u RH (256 razreda).
- Pretpostavka je da je udio razreda svugdje sličan. Provjera na svim JLS-ovima: stvarni broj je u 80 % rasponu u 79,8 % slučajeva.

## 5. Evaluacija (D6)

- GroupKFold po županijama (21 grupa): model nikad ne vidi JLS-ove županije koju predviđa.
- Usporedba s baselineom (nacionalna stopa po stanovniku × stanovnici) i izazivačem (jedan HistGradientBoosting
  za sve odjeljke, Poissonov gubitak).
- Metrike: Poissonova devijanca, MAE, pokrivenost 80 % intervala (randomizirani PIT) i PIT histogram.
- Rezultati: [evaluacija.md](evaluacija.md). Devijanca je 1,52 prema 2,84 za baseline, a pokrivenost 75,4 %.

## 6. Prijedlog djelatnosti iz teksta (D7)

Pretraga nad **službenim opisima razreda iz DZS publikacije NKD 2025** (`pipeline/nkd_opisi.py`, 6.193 opisa za 646 od 651
razreda): nazivi razreda i podrazreda, stavke "Ovaj podrazred uključuje" i upute iz tuđih "isključuje ..., vidi XX.XX"
(npr. "ugradnju solarnih panela, vidi 43.21.0" pripisuje se razredu 43.21). Uz to idu ručni sinonimi za razgovorne riječi
(`data/reference/sinonimi.csv`, oko 100 razreda).

- Tekst se normalizira (bez dijakritika), uklanjaju se riječi bez značenja ("želim otvoriti mali ...") i skidaju česti
  hrvatski nastavci ("knjigovodstveni" ≈ "knjigovodstvo").
- Riječ upita mora postojati u opisu (isti korijen). Približno podudaranje slova (najviše 1–2 slova razlike) koristi se samo
  za riječi kojih nema u rječniku opisa, tj. za tipfelere. Prva inačica (Fuse.js, sličnost slova) je zato predlagala
  "stolariju" za "solarne panele".
- Rijetke riječi vrijede više (IDF). Bodovi su pola zbroj najboljih podudaranja po riječi, a pola najbolji pojedinačni opis,
  pa se nagrađuju riječi koje se u službenom opisu pojavljuju zajedno.
- Riječ koja označava vrstu posla (projektiranje, ugradnja, proizvodnja, prodaja, popravak, najam, prijevoz, uzgoj...) daje
  prednost odgovarajućim odjeljcima. Generičke riječi ("servis", "ured", "salon") imaju manju težinu.
- Najbolji prijedlog se odabire sam, a uz svaki prijedlog prikazuje se službeni tekst zbog kojeg je predložen. Ako alat ne
  prepozna većinu riječi opisa (pokrivenost < 0,3), kaže da nije siguran i ne odabire ništa sam. Pokrivenost nije mjera
  točnosti: na testnim skupovima jednako je visoka kod točnih i netočnih prijedloga.
- Evaluacija na 42 nova opisa (napisana prije izrade ove pretrage): top-1 69,0 %, top-3 92,9 %; prva inačica 42,9 % i 59,5 %.
  Detalji i napomena o pristranosti su u [evaluacija_pretrage.md](evaluacija_pretrage.md).

## 7. Tržišni odlomak (D8)

Deterministički predložak (`web/src/lib/odlomak.ts`), bez LLM-a. Sadrži broj subjekata, stanovnike, očekivanje
i raspon, zaključak, stope na 10.000 stanovnika (JLS, županija, RH), broj u razredu, ograde (obrti, pouzdanost) i izvore.

## 8. Ograničenja i drugi pogled: OpenStreetMap (D16)

Sudski registar broji tvrtke u mjestu sjedišta. Ne vidi obrte ni poslovnice tvrtki sa sjedištem drugdje (trgovački lanci, banke,
benzinske postaje). Primjer: Općina Čaglin ima 12 tvrtki, nijednu u trgovini, a na karti OpenStreetMap ucrtane su 4 trgovine.
U cijeloj RH registar u razredu 47.11 (dućani i supermarketi) ima 731 tvrtku, a karta 4.779 takvih lokala.

Zato rezultat prikazuje i broj lokala iste vrste na karti OpenStreetMap (ODbL). Karta bilježi lokale bez obzira na pravni
oblik, ali je nepotpuna i neravnomjerno ucrtana, pa nije ulaz u model nego informacija uz njega.

- Obrti nisu u Sudskom registru (D3). Ako je udio obrta po regijama sličan, relativni deficit ostaje valjan.
  Za odjeljke u kojima prevladavaju obrti (01, 43, 56, 95, 96) prikazuje se oznaka "niža pouzdanost".
- Interval zanemaruje nesigurnost procjene koeficijenata.
- Model mjeri neobičnost broja subjekata s obzirom na usporedive JLS-ove, a ne izravnu potražnju ni veličinu tržišta.
- Sjedište nije nužno mjesto poslovanja (npr. tvrtke sa sjedištem u Zagrebu i poslovnicama drugdje).
