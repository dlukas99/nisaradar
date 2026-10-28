# Evaluacija modela

> Generira `pipeline/model.py` (ne uređivati ručno). Odluke D4, D5, D6 i D14 u `CLAUDE.md`.

## Postav

- Jedinica: JLS × NKD 2025 odjeljak; modelirano **71** odjeljaka (s barem 50 subjekata u RH).
- Unakrsna provjera: **GroupKFold po županijama (21 grupa)**. Model nikad ne vidi JLS-ove županije koju predviđa
  (osim značajke "stopa u ostatku županije", koja koristi susjede, ali nikad sam JLS).
- Baseline: nacionalna stopa po stanovniku (iz skupa za učenje) × broj stanovnika.
- Izazivač: jedan HistGradientBoosting za sve odjeljke (odjeljak kao kategorijska značajka), Poissonov gubitak, težina = stanovnici.

## Ukupni rezultati (sve ćelije JLS × odjeljak)

| Metrika | Baseline | GLM NegBin (v1) | GBM izazivač |
|---|---|---|---|
| Poissonova devijanca (niže je bolje) | 2.842 | **1.526** | 1.625 |
| MAE (subjekata po ćeliji) | 2.252 | **1.580** | 1.586 |

- GLM je bolji od baselinea (po devijanci) u **63 od 71** odjeljaka.
- GBM je bolji od GLM-a u 32 od 71 odjeljaka. GBM ukupno ne pobjeđuje GLM, pa po D4 ostaje GLM (interpretabilan, s prirodnim intervalima).
- **Pokrivenost 80 % intervala (randomizirani PIT): 0.754** (cilj 0,75–0,85).
  Doslovna pokrivenost cjelobrojnog intervala [10., 90. percentil] je 0.936. Viša je jer kod malih
  očekivanja (npr. μ = 0,3 daje interval 0–1) cjelobrojni interval nužno pokriva puno više od 80 %.
- Semafor (D5) koristi p = P(Y ≤ O), što je za diskretne brojeve konzervativno: "nedostaje" se pojavljuje rjeđe od 10 %.
  To je namjerno. U velikoj većini ćelija očekivanje je toliko malo da ni 0 subjekata nije neobično, pa se deficit tamo ne može tvrditi.
- Osječko-baranjska (pilot): devijanca baseline 2.050, GLM 1.056;
  MAE baseline 1.660, GLM 0.947; pokrivenost 80 % (PIT) 0.793.

### PIT histogram (randomizirani, 10 razreda; idealno 0,100 u svakom)

| 0,0–0,1 | 0,1–0,2 | 0,2–0,3 | 0,3–0,4 | 0,4–0,5 | 0,5–0,6 | 0,6–0,7 | 0,7–0,8 | 0,8–0,9 | 0,9–1,0 |
|---|---|---|---|---|---|---|---|---|---|
| 0.141 | 0.071 | 0.083 | 0.073 | 0.083 | 0.120 | 0.118 | 0.103 | 0.104 | 0.105 |

Rubni razredi (0,0–0,1 i 0,9–1,0) su upravo udjeli ćelija koje semafor označava kao "nedostaje" i "zasićeno".
Ako je model dobro kalibriran, svaki je oko 10 %.

## Test osjetljivosti na izvor djelatnosti (D14)

Glavni model koristi pretežitu djelatnost, a gdje je nema `subjekti.glavna_djelatnost` (NKD 2007 mapiran na 2025).
Ta dva izvora slažu se u 73.3% subjekata koji imaju oba. Zato smo model ponovili
**samo na pretežitoj djelatnosti** (81,194 subjekata umjesto 132,425).

- Semafor je isti u **95.8%** ćelija JLS × odjeljak.
- Od ćelija koje glavni model označava kao "nedostaje", 38.3% je "nedostaje" i u modelu samo na pretežitoj.
- Od ćelija koje glavni model označava kao "zasićeno", 63.8% je "zasićeno" i u modelu samo na pretežitoj.
- Suprotan ishod (nedostaje ↔ zasićeno): 0 ćelija.

## Odjeljci s najmanjim i najvećim dobitkom prema baselineu

| Odjeljak | Devijanca baseline | GLM | GBM | Pokrivenost 80 % |
|---|---|---|---|---|
| 39 Djelatnosti sanacije okoliša i ostale djelatn | 0.27 | 0.31 | 0.27 | 0.97 |
| 24 Proizvodnja metala | 0.35 | 0.38 | 0.36 | 0.97 |
| 11 Proizvodnja pića | 1.53 | 1.60 | 1.41 | 0.94 |
| 23 Proizvodnja ostalih nemetalnih mineralnih pro | 1.18 | 1.22 | 1.14 | 0.93 |
| 88 Djelatnosti socijalne skrbi bez smještaja | 0.32 | 0.33 | 0.32 | 0.97 |
| … | | | | |
| 46 Trgovina na veliko | 13.02 | 4.09 | 5.91 | 0.88 |
| 47 Trgovina na malo | 6.80 | 2.04 | 3.40 | 0.88 |
| 62 Računalno programiranje, savjetovanje i djela | 12.36 | 3.00 | 5.58 | 0.92 |
| 73 Djelatnosti promidžbe, istraživanje tržišta i | 5.00 | 0.96 | 2.38 | 0.93 |
| 70 Upravljačke djelatnosti i savjetovanje u vezi | 15.80 | 2.71 | 5.74 | 0.90 |

## Ograničenja

- Obuhvat su trgovačka društva i zadruge, **bez obrta** (D3). Odjeljci u kojima prevladavaju obrti imaju oznaku "niža pouzdanost".
- Interval zanemaruje nesigurnost procjene koeficijenata, pa je za male odjeljke nešto preuzak.
- Model opisuje gdje je broj subjekata neobičan za JLS takve veličine i strukture. To nije izravna mjera potražnje.
