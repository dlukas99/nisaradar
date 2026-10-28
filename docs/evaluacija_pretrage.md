# Evaluacija prijedloga djelatnosti iz teksta (D7)

> Generira `web/scripts/eval_pretraga.ts` (`npm run eval:pretraga`). Testni skupovi: `data/reference/nkd_test_opisi.csv`
> (104 opisa) i `data/reference/nkd_test_opisi_novi.csv` (42 opisa).

Svaki opis je napisan kako bi ga korisnik tipkao ("zelkim biti projektant za solarne panele", s tipfelerom). Za svaki je zadan
točan razred NKD 2025 i, gdje je to opravdano, prihvatljive alternative (npr. "pekara" je 10.71 ili 47.24).

## Kako pretraga radi

Pretraga čita **službene opise razreda iz DZS publikacije NKD 2025** (`pipeline/nkd_opisi.py`): nazive razreda i podrazreda,
stavke "Ovaj podrazred uključuje" i upute iz tuđih "isključuje ..., vidi XX.XX" (npr. "ugradnju solarnih panela, vidi 43.21.0").
Ukupno 6.193 službena opisa za 646 od 651 razreda, uz ručne sinonime za razgovorne riječi ("kafić", "frizer").

- Riječ upita mora postojati u opisu (isti korijen nakon skidanja nastavaka). Približno podudaranje slova koristi se samo za
  riječi kojih nema u rječniku (tipfeleri), pa "solarni" više ne nalazi "stolariju".
- Rijetke riječi vrijede više ("solarn" više od "proizvodnj"); nagrađuje se opis u kojem se riječi upita pojavljuju zajedno.
- Riječ koja označava vrstu posla (projektiranje, ugradnja, proizvodnja, prodaja, popravak...) daje prednost odgovarajućim
  odjeljcima (71, 43, 10–33, 47, 95...).
- Najbolji prijedlog se odabire sam, uz službeni tekst zbog kojeg je predložen. Kad alat ne prepozna većinu riječi opisa
  (pokrivenost < 0,3), kaže da nije siguran i ne odabire ga sam. Pokrivenost ne razlikuje točne od netočnih prijedloga
  (na oba skupa svi točni i svi netočni prvi prijedlozi imaju pokrivenost ≥ 0,3), pa nije prikazana kao mjera sigurnosti.

## Rezultati

| Skup i inačica | Top-1 | Top-3 | Prvi prijedlog u točnom odjeljku | Bez prijedloga |
|---|---|---|---|---|
| Stari skup – samo nazivi i sinonimi | 94,2 % | 99,0 % | 95,2 % | 0 |
| Stari skup – sa službenim opisima | 94,2 % | 100,0 % | 95,2 % | 0 |
| **Novi skup – samo nazivi i sinonimi** | 57,1 % | 73,8 % | 71,4 % | 1 |
| **Novi skup – sa službenim opisima** | 69,0 % | 92,9 % | 81,0 % | 0 |

Korisnik uvijek može odabrati drugi prijedlog ili odjeljak izravno, pa je za UX ključna top-3 točnost.

## Poštena napomena o pristranosti

- **Stari skup** (104 opisa, 28.10.) korišten je za razvoj prve inačice (Fuse.js nad nazivima i sinonimima): sinonimi i pravila
  su dorađivani na njegovim promašajima. Visoka točnost na njemu je zato optimistična. Prvo mjerenje prve inačice, prije dorade,
  bilo je top-1 87,5 % i top-3 89,4 %. Jedna oznaka je ispravljena: krovopokrivački radovi su u NKD 2025 razred 43.41, ne 43.99.
- **Novi skup** (42 opisa) napisan je prije izrade nove pretrage, s drugim zanimanjima. Na njemu je prva inačica imala
  **top-1 42,9 % i top-3 59,5 %**: pretraga po sličnosti slova nije razumjela opise izvan svojih sinonima. To je bio stvarni problem
  koji je primijetio i korisnik ("projektiranje solarnih panela" -> stolarija).
- Promašaji stare pretrage na novom skupu bili su viđeni prije izrade nove, a dva opća pravila ("prodaja" = trgovina na malo,
  "automobil" = motorno vozilo) dodana su nakon prvog mjerenja nove pretrage. Nakon prijave korisnika ("lijepiti pločice keramiku"
  -> proizvodnja keramike) dodana su još opća pravila: pridjevi na -čki svode se na imenicu (keramički -> keramika), množina na -ova,
  glagoli vrste posla (lijepiti, polagati, popravljati, graditi...) i nekoliko sinonima. Ni novi skup zato nije potpuno nepristran.
- **Nepristranu procjenu daje tek test s korisnicima (5.11.)**: njihove opise treba zapisati prije nego što se pretraga na njima
  ispravlja.

## Promašaji na novom skupu (točan razred nije među prva tri)

| Opis | Točno | Prva tri prijedloga |
|---|---|---|
| skladište i logistika za web trgovine | 52.10 | 47.91, 62.10, 68.20 |
| razvoj video igara | 62.10 | 59.11, 74.20, 60.20 |
| održavanje stambenih zgrada | 81.10 | 81.30, 81.21, 81.22 |

## Promašaji na starom skupu

| Opis | Točno | Prva tri prijedloga |
|---|---|---|
| – | | |
