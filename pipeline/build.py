"""Izgradnja matrice JLS × NKD 2025 odjeljak iz Sudrega i referentnih tablica (odluke D1, D2, D11, D12, D13).

Koraci:
  1. obuhvat: tržišni pravni oblici (D2), domaće sjedište, bez stečaja i likvidacije (D13);
  2. odjeljak NKD 2025 za svaki subjekt (D12): pretežita djelatnost (2025, ili 2007 mapirana), a ako je nema,
     subjekti.glavna_djelatnost (NKD 2007) mapirana preko službene DZS tablice veza;
  3. kontrola D12: slaganje odjeljaka kod subjekata s oba izvora, sada na istoj verziji (prag 85 %);
  4. agregati: broj subjekata po JLS × odjeljak, udio bez šifre po JLS-u i oznaka "niža pouzdanost" (D11).

Ishod: data/snapshot/matrica.parquet, data/snapshot/jls_pokrivenost.parquet, data/snapshot/razredi.parquet
(sve su to agregati, bez pojedinačnih subjekata, D9).

Pokretanje: .venv\\Scripts\\python.exe -X utf8 pipeline\\build.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
FULL = ROOT / "data" / "raw" / "full"
SIFRARNICI = ROOT / "data" / "raw" / "sifrarnici"
REF = ROOT / "data" / "reference"
SNAP = ROOT / "data" / "snapshot"

# D2: filtriramo po vrsta_pravnog_oblika_id, a ne po sifra (sifre 11 i 14 se ponavljaju).
TRZISNI_OBLICI = {5: "d.o.o.", 81: "j.d.o.o.", 9: "zadruga", 4: "d.d.", 1: "j.t.d.", 2: "k.d."}
POSTUPCI_GASENJA = {2, 3}  # D13: stečaj, likvidacija
# D12: prag slaganja. 27.10. je izmjereno 73 % i odlučeno (D14) da se nastavlja s oba izvora uz test osjetljivosti,
# jer razlika nije artefakt mapiranja (i u istoj verziji NKD 2007 izvori se slažu samo 26 %). Ispod praga samo upozoravamo.
PRAG_SLAGANJA = 0.85


def ucitaj_nkd() -> pd.DataFrame:
    return pd.DataFrame(json.loads((SIFRARNICI / "nacionalna_klasifikacija_djelatnosti.json").read_text(encoding="utf-8")))


def glavna_u_sifru(s: pd.Series) -> pd.Series:
    """subjekti.glavna_djelatnost je NKD 2007 razred bez točke; 3 znamenke znače izgubljenu vodeću nulu."""
    s = s.dropna().astype(int).astype(str).str.zfill(4)
    return s.str[:2] + "." + s.str[2:]


def mapa_2007_2025(sub: pd.DataFrame) -> pd.Series:
    """Razred NKD 2007 -> odjeljak NKD 2025.

    Ako službena tablica razred vodi u jedan odjeljak, uzima se on. Ako vodi u više odjeljaka, uzima se onaj koji je
    najčešći među subjektima koji imaju obje šifre (pretežita 2025 i glavna 2007); bez takvih subjekata uzima se
    prvi odjeljak iz tablice (D12).
    """
    k = pd.read_csv(REF / "nkd_2007_2025.csv", dtype=str)
    k["odj"] = k.nkd2025.str[:2]
    kandidati = k.groupby("nkd2007").odj.apply(lambda s: list(dict.fromkeys(s)))
    oba = sub.dropna(subset=["razred2007_glavna", "odj2025_pretezita"])
    empirija = oba.groupby(["razred2007_glavna", "odj2025_pretezita"]).size()

    def izaberi(razred: str, odjeljci: list[str]) -> str:
        if len(odjeljci) == 1 or razred not in empirija.index.get_level_values(0):
            return odjeljci[0]
        e = empirija.loc[razred]
        e = e[e.index.isin(odjeljci)]
        return e.idxmax() if len(e) else odjeljci[0]

    return pd.Series({r: izaberi(r, o) for r, o in kandidati.items()}, name="odj2025"), kandidati.map(len) > 1


def subjekti_u_obuhvatu() -> pd.DataFrame:
    su = pd.read_parquet(FULL / "subjekti.parquet", columns=["mbs", "postupak", "glavna_djelatnost"])
    po = pd.read_parquet(FULL / "pravni_oblici.parquet", columns=["mbs", "vrsta_pravnog_oblika_id"])
    sj = pd.read_parquet(FULL / "sjedista.parquet", columns=["mbs", "sifra_zupanije", "sifra_opcine"])
    pret = pd.read_parquet(FULL / "pretezite_djelatnosti.parquet", columns=["mbs", "nacionalna_klasifikacija_djelatnosti_id"])
    nkd = ucitaj_nkd()

    d = su.merge(po, on="mbs").merge(sj, on="mbs")
    # Domaće sjedište = sifra_opcine postoji (drzava_id nije pouzdan, CLAUDE.md 3.1).
    d = d[d.vrsta_pravnog_oblika_id.isin(TRZISNI_OBLICI) & d.sifra_opcine.notna() & ~d.postupak.isin(POSTUPCI_GASENJA)].copy()
    d["sifra_opcine"] = d.sifra_opcine.astype(int)
    d["sifra_zupanije"] = d.sifra_zupanije.astype(int)

    pret = pret.merge(nkd[["id", "sifra", "verzija"]], left_on="nacionalna_klasifikacija_djelatnosti_id", right_on="id")
    d = d.merge(pret[["mbs", "sifra", "verzija"]], on="mbs", how="left")
    d["odj2025_pretezita"] = d.sifra.where(d.verzija == "NKD 2025").str[:2]
    d["razred2025_pretezita"] = d.sifra.where(d.verzija == "NKD 2025").str[:5]
    d["razred2007_pretezita"] = d.sifra.where(d.verzija == "NKD 2007").str[:5]
    d["razred2007_glavna"] = glavna_u_sifru(d.glavna_djelatnost).reindex(d.index)
    return d


def dodijeli_odjeljak(d: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    mapa, visestruki = mapa_2007_2025(d)
    d["odj2025_glavna"] = d.razred2007_glavna.map(mapa)
    # Redoslijed izvora (D12): pretežita 2025 > pretežita 2007 (mapirana) > glavna 2007 (mapirana).
    d["odjeljak"] = d.odj2025_pretezita.fillna(d.razred2007_pretezita.map(mapa)).fillna(d.odj2025_glavna)
    d["izvor"] = "bez šifre"
    d.loc[d.odj2025_glavna.notna(), "izvor"] = "glavna 2007"
    d.loc[d.razred2007_pretezita.notna(), "izvor"] = "pretežita 2007"
    d.loc[d.odj2025_pretezita.notna(), "izvor"] = "pretežita 2025"
    # Razred (4 znamenke, D1) samo za informaciju: ima ga samo pretežita 2025 (bez mapiranja razreda).
    d["razred"] = d.razred2025_pretezita

    # Kontrola D12 na istoj verziji.
    oba = d.dropna(subset=["odj2025_pretezita", "odj2025_glavna"])
    jednoznacni = oba[~oba.razred2007_glavna.map(visestruki).fillna(False).astype(bool)]
    kontrola = {
        "n_oba_izvora": int(len(oba)),
        "slaganje_odjeljaka": float((oba.odj2025_pretezita == oba.odj2025_glavna).mean()),
        "n_jednoznacni": int(len(jednoznacni)),
        "slaganje_jednoznacni": float((jednoznacni.odj2025_pretezita == jednoznacni.odj2025_glavna).mean()),
        "razreda_visestruko": int(visestruki.sum()),
    }
    return d, kontrola


def main() -> int:
    d = subjekti_u_obuhvatu()
    d, k = dodijeli_odjeljak(d)
    print(f"Subjekata u obuhvatu (D2 + domaće sjedište + D13): {len(d):,}")
    print("Izvor odjeljka:", d.izvor.value_counts().to_dict())
    print(f"D12 kontrola: subjekata s oba izvora {k['n_oba_izvora']:,}, slaganje odjeljaka NKD 2025 {k['slaganje_odjeljaka']:.1%}")
    print(f"  samo razredi s jednoznačnim odjeljkom ({k['n_jednoznacni']:,}): {k['slaganje_jednoznacni']:.1%}"
          f" | razreda 2007 s više odjeljaka 2025: {k['razreda_visestruko']}")
    if k["slaganje_odjeljaka"] < PRAG_SLAGANJA:
        print(f"UPOZORENJE (D12/D14): slaganje je ispod {PRAG_SLAGANJA:.0%}; nastavlja se uz test osjetljivosti.")

    jls = pd.read_csv(REF / "jls.csv")
    s_odj = d.dropna(subset=["odjeljak"])
    odjeljci = sorted(s_odj.odjeljak.unique())
    puna = pd.MultiIndex.from_product([jls.sifra_opcine, odjeljci], names=["sifra_opcine", "odjeljak"])

    def matrica(x: pd.DataFrame) -> pd.DataFrame:
        # Puna matrica: i JLS × odjeljak s nula subjekata je podatak (to je upravo "nedostaje").
        m = x.groupby(["sifra_opcine", "odjeljak"]).size().rename("broj")
        return m.reindex(puna, fill_value=0).reset_index()

    mat = matrica(s_odj)
    # D14: test osjetljivosti, samo subjekti čiji odjeljak dolazi iz pretežite djelatnosti.
    mat_pret = matrica(s_odj[s_odj.izvor.str.startswith("pretežita")])

    # D11: udio bez šifre po JLS-u, prag = neponderirani prosjek + 2 SD preko JLS-ova u RH.
    pok = d.groupby("sifra_opcine").agg(subjekata=("mbs", "size"),
                                         bez_sifre=("odjeljak", lambda s: int(s.isna().sum()))).reset_index()
    pok = jls[["sifra_opcine"]].merge(pok, how="left").fillna(0)
    pok["udio_bez_sifre"] = (pok.bez_sifre / pok.subjekata.where(pok.subjekata > 0)).fillna(0)
    prag = pok.udio_bez_sifre.mean() + 2 * pok.udio_bez_sifre.std()
    pok["niza_pouzdanost_nkd"] = pok.udio_bez_sifre > prag

    raz = (d.dropna(subset=["razred"]).groupby(["sifra_opcine", "razred"]).size().rename("broj").reset_index())

    SNAP.mkdir(parents=True, exist_ok=True)
    mat.to_parquet(SNAP / "matrica.parquet", index=False)
    mat_pret.to_parquet(SNAP / "matrica_pretezita.parquet", index=False)
    pok.to_parquet(SNAP / "jls_pokrivenost.parquet", index=False)
    raz.to_parquet(SNAP / "razredi.parquet", index=False)
    # Meta dohvata (snapshot_id, vrijeme) ide uz agregate da se zna iz kojeg su snapshota.
    if (FULL / "_meta.json").exists():
        (SNAP / "sudreg_meta.json").write_text((FULL / "_meta.json").read_text(encoding="utf-8"), encoding="utf-8")
    (SNAP / "build_meta.json").write_text(json.dumps({
        **k, "subjekata_u_obuhvatu": int(len(d)), "subjekata_s_odjeljkom": int(len(s_odj)),
        "izvor_odjeljka": {k2: int(v) for k2, v in d.izvor.value_counts().items()},
        "prag_bez_sifre": float(prag), "odjeljaka": len(odjeljci),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Matrica: {len(jls)} JLS × {len(odjeljci)} odjeljaka = {len(mat):,} ćelija, ukupno subjekata {mat.broj.sum():,}")
    print(f"D11: prag udjela bez šifre {prag:.1%}, oznaka kod {int(pok.niza_pouzdanost_nkd.sum())} JLS-ova")
    return 0


if __name__ == "__main__":
    sys.exit(main())
