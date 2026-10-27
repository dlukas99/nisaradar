# Evaluacija prijedloga djelatnosti iz teksta (D7)

> Generira `web/scripts/eval_pretraga.ts` (oznaka izvođenja: v2, nakon općih izmjena (vidi napomenu)). Testni skup: `data/reference/nkd_test_opisi.csv`.

Testni skup ima 104 ručno označenih opisa ideja, napisanih kako bi ih korisnik tipkao. Za svaki je zadan točan razred NKD 2025
i, gdje je to opravdano, prihvatljive alternative (npr. "pekara" je 10.71 ili 47.24).

| Mjera | Vrijednost |
|---|---|
| Top-1 točnost (prvi prijedlog je točan razred) | **90,4 %** |
| Top-3 točnost (točan razred je među prva tri) | **97,1 %** |
| Prvi prijedlog u točnom odjeljku (razina na kojoj radi model) | **92,3 %** |
| Opisa bez ijednog prijedloga | 0 |

Korisnik uvijek sam bira među prijedlozima, a može odabrati i odjeljak izravno, pa je za UX ključna top-3 točnost.

## Poštena napomena o razvoju

Prvo mjerenje (v1, prije ikakve dorade, izvan uzorka) dalo je **top-1 87,5 %, top-3 89,4 %**. Promašaji su zatim
analizirani i napravljene su tri **opće** izmjene logike pretrage, bez dodavanja sinonima za testne primjere:

1. svaki sinonim se uspoređuje zasebno, bez kazne za duljinu polja (dugi službeni nazivi);
2. lagano skidanje hrvatskih nastavaka ("knjigovodstveni" ≈ "knjigovodstvo");
3. manja težina generičkih riječi ("servis", "ured", "radionica").

Rezultat iznad je nakon tih izmjena, pa je djelomično "u uzorku". Za nepristranu procjenu treba novi skup opisa
od stvarnih korisnika (test 5.11.).

## Promašaji (točan razred nije među prva tri)

| Opis | Točno | Prva tri prijedloga |
|---|---|---|
| bravarska radionica i izrada ograda | 25.11 | 62.10 |
| psihološko savjetovanje | 86.93 | 70.20, 62.20, 69.20 |
| selidbe i prijevoz namještaja | 49.42 | 31.00, 49.41, 49.33 |
