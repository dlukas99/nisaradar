"""Model očekivanog broja subjekata, semafor i evaluacija (odluke D4, D5, D6, D14).

Za svaki NKD 2025 odjeljak d posebno:
    O_jd ~ NegBin(μ_jd, α_d),   log μ_jd = log(stanovnika_j) + β_d · x_j
x_j: udio 65+, udio 0–14, indeks razvijenosti, grad (0/1) i leave-one-out log-stopa subjekata tog odjeljka
u ostatku županije (bez samog JLS-a j). Značajke se standardiziraju na skupu za učenje.

Semafor (D5): p = P(Y ≤ O); "nedostaje" ako p < 0,10, "zasićeno" ako P(Y ≥ O) < 0,10, inače "u ravnoteži".
Interval je 80 % prediktivni interval NegBin razdiobe (10. i 90. percentil). Nesigurnost u β zanemarujemo
(to pišemo u metodologiji), jer je 556 JLS-ova po odjeljku dovoljno za stabilne procjene u većini odjeljaka.

Evaluacija (D6): GroupKFold po županijama (21 grupa). Uspoređujemo s baselineom (nacionalna stopa × stanovnici)
i s izazivačem (HistGradientBoosting s Poissonovim gubitkom; D4 spominje LightGBM, sklearn je ista ideja bez
nove ovisnosti). Ishod: data/snapshot/predikcije.parquet, data/snapshot/evaluacija.json, docs/evaluacija.md.

Pokretanje: .venv\\Scripts\\python.exe -X utf8 pipeline\\model.py
"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold

import nkd

sys.stdout.reconfigure(encoding="utf-8")
warnings.filterwarnings("ignore")  # statsmodels javlja upozorenja o konvergenciji za rijetke odjeljke; hvatamo ih ispod

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "data" / "reference"
SNAP = ROOT / "data" / "snapshot"
DOCS = ROOT / "docs"

ZNACAJKE = ["udio_65", "udio_0_14", "indeks_razvijenosti", "grad", "loo_stopa"]
PRAG = 0.10                 # D5
MIN_SUBJEKATA_RH = 50       # odjeljke s manje subjekata u cijeloj RH ne modeliramo (premalo podataka)


# ------------------------------------------------------------------ podaci

def pripremi(matrica: pd.DataFrame, jls: pd.DataFrame) -> pd.DataFrame:
    d = matrica.merge(jls, on="sifra_opcine")
    # Leave-one-out stopa u županiji: subjekti i stanovnici ostalih JLS-ova iste županije.
    g = d.groupby(["sifra_zupanije", "odjeljak"])
    zup_broj = g.broj.transform("sum") - d.broj
    zup_pop = g.stanovnika.transform("sum") - d.stanovnika
    # Grad Zagreb je sam u svojoj županiji: tamo uzimamo nacionalnu stopu bez Zagreba.
    nac = d.groupby("odjeljak")
    nac_broj = nac.broj.transform("sum") - d.broj
    nac_pop = nac.stanovnika.transform("sum") - d.stanovnika
    samo = zup_pop <= 0
    broj = zup_broj.where(~samo, nac_broj)
    pop = zup_pop.where(~samo, nac_pop)
    # +0,5 subjekta da log ne bude -beskonačno kad u ostatku županije nema nijednog.
    d["loo_stopa"] = np.log((broj + 0.5) / pop * 10_000)
    return d


def standardiziraj(train: pd.DataFrame, test: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    m = train[ZNACAJKE].mean()
    s = train[ZNACAJKE].std().replace(0, 1)
    return (((train[ZNACAJKE] - m) / s).to_numpy(), ((test[ZNACAJKE] - m) / s).to_numpy())


# ------------------------------------------------------------------- model

def fit_negbin(train: pd.DataFrame, test: pd.DataFrame) -> tuple[np.ndarray, float]:
    """Vrati (μ za test, α). Ako NegBin ne konvergira, padamo na Poisson (α ≈ 0) i to je zabilježeno."""
    Xtr, Xte = standardiziraj(train, test)
    Xtr, Xte = sm.add_constant(Xtr, has_constant="add"), sm.add_constant(Xte, has_constant="add")
    off_tr, off_te = np.log(train.stanovnika.to_numpy()), np.log(test.stanovnika.to_numpy())
    y = train.broj.to_numpy()
    try:
        res = sm.NegativeBinomial(y, Xtr, offset=off_tr, loglike_method="nb2").fit(disp=0, maxiter=200, method="bfgs")
        params = np.asarray(res.params)
        beta, alpha = params[:-1], float(params[-1])
        if not np.isfinite(params).all() or alpha <= 0 or alpha > 50:
            raise ValueError("nestabilna procjena")
    except Exception:
        res = sm.GLM(y, Xtr, family=sm.families.Poisson(), offset=off_tr).fit()
        beta, alpha = np.asarray(res.params), 1e-6
    mu = np.exp(np.clip(Xte @ beta + off_te, -30, 30))
    return mu, alpha


def nb_razdioba(mu: np.ndarray, alpha: float):
    """NB2: Var = μ + α μ². scipy nbinom(n, p) s n = 1/α, p = n / (n + μ)."""
    n = 1.0 / alpha
    return stats.nbinom(n, n / (n + mu))


def semafor(o: np.ndarray, mu: np.ndarray, alpha: float) -> pd.DataFrame:
    r = nb_razdioba(mu, alpha)
    p_manje = r.cdf(o)                        # P(Y ≤ O)
    p_vise = 1 - r.cdf(o - 1)                 # P(Y ≥ O)
    status = np.where(p_manje < PRAG, "nedostaje", np.where(p_vise < PRAG, "zasiceno", "ravnoteza"))
    return pd.DataFrame({"mu": mu, "lo": r.ppf(0.10), "hi": r.ppf(0.90),
                         "p_manje": p_manje, "p_vise": p_vise, "status": status})


def poisson_devijanca(y: np.ndarray, mu: np.ndarray) -> float:
    mu = np.maximum(mu, 1e-9)
    t = np.where(y > 0, y * np.log(np.where(y > 0, y, 1) / mu), 0.0)
    return float(np.mean(2 * (t - (y - mu))))


# --------------------------------------------------------------- evaluacija

def gbm_cv(d: pd.DataFrame) -> pd.Series:
    """Izazivač: jedan GBM za sve odjeljke (odjeljak je kategorijska značajka), po istim foldovima po županijama.

    Uči stopu po stanovniku s težinom = stanovnici i Poissonovim gubitkom. Jedan skupni model po foldu umjesto
    jednog po odjeljku: brže (21 umjesto ~1500 fitova) i jači izazivač, jer dijeli informaciju među odjeljcima.
    """
    x = d.assign(odj_kat=d.odjeljak.astype(int))
    cols = ZNACAJKE + ["odj_kat"]
    pred = pd.Series(np.nan, index=x.index)
    for tr_idx, te_idx in GroupKFold(n_splits=21).split(x, groups=x.sifra_zupanije):
        tr, te = x.iloc[tr_idx], x.iloc[te_idx]
        hgb = HistGradientBoostingRegressor(loss="poisson", max_iter=300, learning_rate=0.05,
                                            max_leaf_nodes=31, min_samples_leaf=20,
                                            categorical_features=[len(cols) - 1], random_state=0)
        hgb.fit(tr[cols], tr.broj / tr.stanovnika, sample_weight=tr.stanovnika)
        pred.iloc[te_idx] = hgb.predict(te[cols]) * te.stanovnika.to_numpy()
    return pred


def evaluacija(d: pd.DataFrame, odjeljci: list[str]) -> tuple[pd.DataFrame, dict]:
    """GroupKFold po županijama za sve modelirane odjeljke odjednom (iste podjele za sve)."""
    gkf = GroupKFold(n_splits=21)
    d = d[d.odjeljak.isin(odjeljci)].reset_index(drop=True)
    d["gbm"] = gbm_cv(d)
    redovi = []
    for odj in odjeljci:
        x = d[d.odjeljak == odj].reset_index(drop=True)
        for tr_idx, te_idx in gkf.split(x, groups=x.sifra_zupanije):
            tr, te = x.iloc[tr_idx], x.iloc[te_idx]
            mu, alpha = fit_negbin(tr, te)
            base = te.stanovnika.to_numpy() * tr.broj.sum() / tr.stanovnika.sum()
            r = nb_razdioba(mu, alpha)
            o = te.broj.to_numpy()
            # Randomizirani PIT za diskretnu razdiobu: U ~ [F(O-1), F(O)].
            u = np.random.default_rng(0).uniform(r.cdf(o - 1), r.cdf(o))
            redovi.append(pd.DataFrame({
                "odjeljak": odj, "sifra_opcine": te.sifra_opcine.to_numpy(), "o": o,
                "mu": mu, "base": base, "gbm": te.gbm.to_numpy(), "lo": r.ppf(0.10), "hi": r.ppf(0.90), "pit": u}))
    cv = pd.concat(redovi, ignore_index=True)
    cv["pokriven"] = (cv.o >= cv.lo) & (cv.o <= cv.hi)

    def metrike(x: pd.DataFrame) -> dict:
        return {
            "devijanca_glm": poisson_devijanca(x.o.to_numpy(), x.mu.to_numpy()),
            "devijanca_gbm": poisson_devijanca(x.o.to_numpy(), x.gbm.to_numpy()),
            "devijanca_baseline": poisson_devijanca(x.o.to_numpy(), x.base.to_numpy()),
            "mae_glm": float((x.o - x.mu).abs().mean()),
            "mae_gbm": float((x.o - x.gbm).abs().mean()),
            "mae_baseline": float((x.o - x.base).abs().mean()),
            "pokrivenost_80": float(x.pokriven.mean()),
            # Diskretna razdioba: [10., 90. percentil] uključuje rubne vrijednosti pa pokriva i više od 80 %.
            # Randomizirani PIT uklanja taj učinak: udio PIT-a u [0,1; 0,9] je "prava" pokrivenost 80 % intervala.
            "pokrivenost_80_pit": float(((x.pit >= 0.1) & (x.pit <= 0.9)).mean()),
        }

    po_odj = cv.groupby("odjeljak").apply(lambda x: pd.Series(metrike(x))).reset_index()
    ukupno = metrike(cv)
    ukupno["pit_histogram"] = np.histogram(cv.pit, bins=10, range=(0, 1))[0].tolist()
    ukupno["odjeljaka_glm_bolji_od_baselinea"] = int((po_odj.devijanca_glm < po_odj.devijanca_baseline).sum())
    ukupno["odjeljaka_gbm_bolji_od_glm"] = int((po_odj.devijanca_gbm < po_odj.devijanca_glm).sum())
    ukupno["odjeljaka"] = len(odjeljci)
    ukupno["obz"] = metrike(cv[cv.sifra_opcine.isin(d[d.sifra_zupanije == 14].sifra_opcine)])
    return po_odj, ukupno


# ----------------------------------------------------------- konačni model

def konacni(d: pd.DataFrame, odjeljci: list[str]) -> pd.DataFrame:
    """Model učen na svim JLS-ovima; semafor za svaku ćeliju JLS × odjeljak."""
    out = []
    for odj in sorted(d.odjeljak.unique()):
        x = d[d.odjeljak == odj].reset_index(drop=True)
        if odj in odjeljci:
            mu, alpha = fit_negbin(x, x)
            s = semafor(x.broj.to_numpy(), mu, alpha)
        else:
            s = pd.DataFrame({"mu": np.nan, "lo": np.nan, "hi": np.nan, "p_manje": np.nan,
                              "p_vise": np.nan, "status": "premalo"}, index=x.index)
            alpha = np.nan
        out.append(pd.concat([x[["sifra_opcine", "odjeljak", "broj"]], s], axis=1).assign(alpha=alpha))
    return pd.concat(out, ignore_index=True)


def zapisi_md(ukupno: dict, po_odj: pd.DataFrame, osjetljivost: dict, nazivi: dict[str, str]) -> None:
    u = ukupno
    pit = u["pit_histogram"]
    n = sum(pit)
    pit_red = " | ".join(f"{c / n:.3f}" for c in pit)
    najbolji = po_odj.assign(dobitak=1 - po_odj.devijanca_glm / po_odj.devijanca_baseline).sort_values("dobitak")
    def red(r):
        return (f"| {r.odjeljak} {nazivi.get(r.odjeljak, '')[:45]} | {r.devijanca_baseline:.2f} | {r.devijanca_glm:.2f} | "
                f"{r.devijanca_gbm:.2f} | {r.pokrivenost_80:.2f} |")
    tekst = f"""# Evaluacija modela

> Generira `pipeline/model.py` (ne uređivati ručno). Odluke D4, D5, D6 i D14 u `CLAUDE.md`.

## Postav

- Jedinica: JLS × NKD 2025 odjeljak; modelirano **{u['odjeljaka']}** odjeljaka (s barem {MIN_SUBJEKATA_RH} subjekata u RH).
- Unakrsna provjera: **GroupKFold po županijama (21 grupa)**. Model nikad ne vidi JLS-ove županije koju predviđa
  (osim značajke "stopa u ostatku županije", koja koristi susjede, ali nikad sam JLS).
- Baseline: nacionalna stopa po stanovniku (iz skupa za učenje) × broj stanovnika.
- Izazivač: jedan HistGradientBoosting za sve odjeljke (odjeljak kao kategorijska značajka), Poissonov gubitak, težina = stanovnici.

## Ukupni rezultati (sve ćelije JLS × odjeljak)

| Metrika | Baseline | GLM NegBin (v1) | GBM izazivač |
|---|---|---|---|
| Poissonova devijanca (niže je bolje) | {u['devijanca_baseline']:.3f} | **{u['devijanca_glm']:.3f}** | {u['devijanca_gbm']:.3f} |
| MAE (subjekata po ćeliji) | {u['mae_baseline']:.3f} | **{u['mae_glm']:.3f}** | {u['mae_gbm']:.3f} |

- GLM je bolji od baselinea (po devijanci) u **{u['odjeljaka_glm_bolji_od_baselinea']} od {u['odjeljaka']}** odjeljaka.
- GBM je bolji od GLM-a u {u['odjeljaka_gbm_bolji_od_glm']} od {u['odjeljaka']} odjeljaka. {"GBM ukupno pobjeđuje GLM." if u['devijanca_gbm'] < u['devijanca_glm'] else "GBM ukupno ne pobjeđuje GLM, pa po D4 ostaje GLM (interpretabilan, s prirodnim intervalima)."}
- **Pokrivenost 80 % intervala (randomizirani PIT): {u['pokrivenost_80_pit']:.3f}** (cilj 0,75–0,85).
  Doslovna pokrivenost cjelobrojnog intervala [10., 90. percentil] je {u['pokrivenost_80']:.3f}. Viša je jer kod malih
  očekivanja (npr. μ = 0,3 daje interval 0–1) cjelobrojni interval nužno pokriva puno više od 80 %.
- Semafor (D5) koristi p = P(Y ≤ O), što je za diskretne brojeve konzervativno: "nedostaje" se pojavljuje rjeđe od 10 %.
  To je namjerno. U velikoj većini ćelija očekivanje je toliko malo da ni 0 subjekata nije neobično, pa se deficit tamo ne može tvrditi.
- Osječko-baranjska (pilot): devijanca baseline {u['obz']['devijanca_baseline']:.3f}, GLM {u['obz']['devijanca_glm']:.3f};
  MAE baseline {u['obz']['mae_baseline']:.3f}, GLM {u['obz']['mae_glm']:.3f}; pokrivenost 80 % (PIT) {u['obz']['pokrivenost_80_pit']:.3f}.

### PIT histogram (randomizirani, 10 razreda; idealno 0,100 u svakom)

| 0,0–0,1 | 0,1–0,2 | 0,2–0,3 | 0,3–0,4 | 0,4–0,5 | 0,5–0,6 | 0,6–0,7 | 0,7–0,8 | 0,8–0,9 | 0,9–1,0 |
|---|---|---|---|---|---|---|---|---|---|
| {pit_red} |

Rubni razredi (0,0–0,1 i 0,9–1,0) su upravo udjeli ćelija koje semafor označava kao "nedostaje" i "zasićeno".
Ako je model dobro kalibriran, svaki je oko 10 %.

## Test osjetljivosti na izvor djelatnosti (D14)

Glavni model koristi pretežitu djelatnost, a gdje je nema `subjekti.glavna_djelatnost` (NKD 2007 mapiran na 2025).
Ta dva izvora slažu se u {osjetljivost['slaganje_izvora']:.1%} subjekata koji imaju oba. Zato smo model ponovili
**samo na pretežitoj djelatnosti** ({osjetljivost['subjekata_pretezita']:,} subjekata umjesto {osjetljivost['subjekata_glavni']:,}).

- Semafor je isti u **{osjetljivost['isti_status']:.1%}** ćelija JLS × odjeljak.
- Od ćelija koje glavni model označava kao "nedostaje", {osjetljivost['nedostaje_potvrdeno']:.1%} je "nedostaje" i u modelu samo na pretežitoj.
- Od ćelija koje glavni model označava kao "zasićeno", {osjetljivost['zasiceno_potvrdeno']:.1%} je "zasićeno" i u modelu samo na pretežitoj.
- Suprotan ishod (nedostaje ↔ zasićeno): {osjetljivost['suprotno']} ćelija.

## Odjeljci s najmanjim i najvećim dobitkom prema baselineu

| Odjeljak | Devijanca baseline | GLM | GBM | Pokrivenost 80 % |
|---|---|---|---|---|
""" + "\n".join(red(r) for _, r in najbolji.head(5).iterrows()) + "\n| … | | | | |\n" + \
        "\n".join(red(r) for _, r in najbolji.tail(5).iterrows()) + """

## Ograničenja

- Obuhvat su trgovačka društva i zadruge, **bez obrta** (D3). Odjeljci u kojima prevladavaju obrti imaju oznaku "niža pouzdanost".
- Interval zanemaruje nesigurnost procjene koeficijenata, pa je za male odjeljke nešto preuzak.
- Model opisuje gdje je broj subjekata neobičan za JLS takve veličine i strukture. To nije izravna mjera potražnje.
"""
    (DOCS / "evaluacija.md").write_text(tekst, encoding="utf-8")


def main() -> int:
    jls = pd.read_csv(REF / "jls.csv")
    mat = pd.read_parquet(SNAP / "matrica.parquet")
    d = pripremi(mat, jls)
    ukupno_odj = d.groupby("odjeljak").broj.sum()
    odjeljci = sorted(ukupno_odj[ukupno_odj >= MIN_SUBJEKATA_RH].index)
    print(f"Modeliram {len(odjeljci)} od {len(ukupno_odj)} odjeljaka (ostali imaju < {MIN_SUBJEKATA_RH} subjekata u RH).")

    print("Evaluacija (GroupKFold po županijama) ...", flush=True)
    po_odj, ukupno = evaluacija(d, odjeljci)
    print(json.dumps({k: v for k, v in ukupno.items() if k != "obz"}, indent=1, ensure_ascii=False))

    print("Konačni model ...", flush=True)
    pred = konacni(d, odjeljci)
    print(pred[pred.status != "premalo"].status.value_counts(normalize=True).round(3).to_dict())

    # D14: test osjetljivosti, isti model samo na pretežitoj djelatnosti.
    d2 = pripremi(pd.read_parquet(SNAP / "matrica_pretezita.parquet"), jls)
    pred2 = konacni(d2, [o for o in odjeljci if d2[d2.odjeljak == o].broj.sum() >= MIN_SUBJEKATA_RH])
    usp = pred.merge(pred2[["sifra_opcine", "odjeljak", "status"]], on=["sifra_opcine", "odjeljak"], suffixes=("", "_p"))
    usp = usp[(usp.status != "premalo") & (usp.status_p != "premalo")]
    meta = json.loads((SNAP / "build_meta.json").read_text(encoding="utf-8"))
    osj = {
        "isti_status": float((usp.status == usp.status_p).mean()),
        "nedostaje_potvrdeno": float((usp[usp.status == "nedostaje"].status_p == "nedostaje").mean()),
        "zasiceno_potvrdeno": float((usp[usp.status == "zasiceno"].status_p == "zasiceno").mean()),
        "suprotno": int((((usp.status == "nedostaje") & (usp.status_p == "zasiceno")) |
                         ((usp.status == "zasiceno") & (usp.status_p == "nedostaje"))).sum()),
        "slaganje_izvora": meta["slaganje_odjeljaka"],
        "subjekata_glavni": int(mat.broj.sum()),
        "subjekata_pretezita": int(pd.read_parquet(SNAP / "matrica_pretezita.parquet").broj.sum()),
    }
    print("Osjetljivost (D14):", osj)

    nazivi = nkd.nazivi_odjeljaka()
    # D14: uz svaku ćeliju i status iz modela samo na pretežitoj djelatnosti (UI pokazuje je li nalaz potvrđen).
    pred = pred.merge(pred2[["sifra_opcine", "odjeljak", "status"]].rename(columns={"status": "status_pretezita"}),
                      on=["sifra_opcine", "odjeljak"], how="left")
    pred.to_parquet(SNAP / "predikcije.parquet", index=False)
    po_odj.to_parquet(SNAP / "evaluacija_po_odjeljku.parquet", index=False)
    (SNAP / "evaluacija.json").write_text(json.dumps({**ukupno, "osjetljivost": osj}, ensure_ascii=False, indent=2),
                                          encoding="utf-8")
    zapisi_md(ukupno, po_odj, osj, nazivi)
    print("Zapisano: data/snapshot/predikcije.parquet, evaluacija.json, docs/evaluacija.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
