"""Ponovljivo mjerenje pokrivenosti NKD šifre među tržišnim subjektima (odluke D2, D11, D13).

Mjeri koliko tržišnih subjekata ima NKD šifru (pretežita djelatnost i/ili glavna_djelatnost) i koliki je
udio bez šifre po JLS-u. NKD se ovdje NE mapira između verzija (to je zadatak D12): "ima šifru" znači
samo da postoji u barem jednom izvoru, neovisno o verziji.

Pokretanje (iz korijena repozitorija):
    .venv\\Scripts\\python.exe -X utf8 pipeline\\analiza_nkd.py            # koristi data/raw/full ako postoji
    .venv\\Scripts\\python.exe -X utf8 pipeline\\analiza_nkd.py --fetch    # ponovno povuci iz API-ja (~14 min)

Podaci su u data/raw/ (nije u gitu).
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

from sudreg_client import SudregClient

sys.stdout.reconfigure(encoding="utf-8")  # Windows konzola je inače cp1252

ROOT = Path(__file__).resolve().parent.parent
FULL = ROOT / "data" / "raw" / "full"
SIFRARNICI = ROOT / "data" / "raw" / "sifrarnici"
TABLICE = ["subjekti", "sjedista", "pretezite_djelatnosti", "pravni_oblici"]

# D2: tržišni pravni oblici. Filtriramo po vrsta_pravnog_oblika_id, a ne po sifra (sifre 11 i 14 se ponavljaju).
TRZISNI_OBLICI = {5: "d.o.o.", 81: "j.d.o.o.", 9: "zadruga", 4: "d.d.", 1: "j.t.d.", 2: "k.d."}
# D13: postupci koji znače gašenje subjekta (/vrste_postupaka: 2 stečaj, 3 likvidacija).
POSTUPCI_GASENJA = {2, 3}
OBZ_SIFRA_ZUPANIJE = 14


def dohvati(client: SudregClient) -> None:
    """Puni dohvat 4 tablice i NKD šifrarnika, sve s ISTIM snapshotom.

    Privremeno bez checkpointa: ako veza pukne, počinje se ispočetka. Checkpoint je u planu (CLAUDE.md, odjeljak 10)
    i ide u fetch_sudreg.py.
    """
    snaps, _ = client.get("snapshots")
    # staleness 1 = zadnja snimka; -1 je istekla snimka koju API odbija.
    sid = min((s for s in snaps if s["staleness"] >= 1), key=lambda s: s["staleness"])["id"]
    FULL.mkdir(parents=True, exist_ok=True)
    SIFRARNICI.mkdir(parents=True, exist_ok=True)
    for t in TABLICE:
        print(f"Dohvaćam {t} (snapshot {sid}) ...", flush=True)
        # limit=1000: veći limit je kod nas ponekad prekidao vezu.
        rows = [r for page in client.paginate(t, snapshot_id=sid, limit=1000) for r in page]
        pd.DataFrame(rows).to_parquet(FULL / f"{t}.parquet")
    nkd = [r for page in client.paginate("nacionalna_klasifikacija_djelatnosti", snapshot_id=sid) for r in page]
    (SIFRARNICI / "nacionalna_klasifikacija_djelatnosti.json").write_text(
        json.dumps(nkd, ensure_ascii=False, indent=2), encoding="utf-8")
    (FULL / "_meta.json").write_text(
        json.dumps({"snapshot_id": sid, "dohvaceno": datetime.now().isoformat(timespec="seconds")}), encoding="utf-8")


def pokrivenost(d: pd.DataFrame) -> str:
    n = len(d)
    return (f"n={n:>7,}  pretežita {d.ima_pretezitu.mean():6.1%}  glavna {d.ima_glavnu.mean():6.1%}  "
            f"barem jedno {d.ima_sifru.mean():6.1%}  bez šifre {(~d.ima_sifru).sum():>6,} ({(~d.ima_sifru).mean():.1%})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="ponovno dohvati podatke iz API-ja")
    args = ap.parse_args()

    if args.fetch or not all((FULL / f"{t}.parquet").exists() for t in TABLICE):
        print("Podaci nisu u data/raw/full ili je zatražen --fetch: dohvaćam iz API-ja.")
        dohvati(SudregClient())

    su, sj, pret, po = (pd.read_parquet(FULL / f"{t}.parquet") for t in TABLICE)
    nkd = pd.DataFrame(json.loads(
        (SIFRARNICI / "nacionalna_klasifikacija_djelatnosti.json").read_text(encoding="utf-8")))
    meta_path = FULL / "_meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        print(f"Izvor: snapshot {meta['snapshot_id']}, dohvaćeno {meta['dohvaceno']}")
    else:
        mt = datetime.fromtimestamp((FULL / "subjekti.parquet").stat().st_mtime).isoformat(timespec="seconds")
        print(f"Izvor: data/raw/full (datoteka od {mt}; snapshot nije zapisan, 27.10. je to bio 1349)")

    # --- Obuhvat: D2 (tržišni oblici) + domaće sjedište + D13 (bez stečaja i likvidacije) ---
    # Domaće sjedište = sifra_opcine postoji (drzava_id NIJE pouzdan, vidi CLAUDE.md 3.1).
    d = su.merge(po, on="mbs").merge(
        sj[["mbs", "sifra_zupanije", "sifra_opcine", "naziv_opcine"]], on="mbs")
    d = d[d.vrsta_pravnog_oblika_id.isin(TRZISNI_OBLICI) & d.sifra_opcine.notna()].copy()
    d["ima_pretezitu"] = d.mbs.isin(pret.mbs)
    d["ima_glavnu"] = d.glavna_djelatnost.notna()
    d["ima_sifru"] = d.ima_pretezitu | d.ima_glavnu
    d["gasenje"] = d.postupak.isin(POSTUPCI_GASENJA)
    m = d[~d.gasenje].copy()

    print("\n=== Obuhvat ===")
    print(f"Tržišni oblici (D2) s domaćim sjedištem: {len(d):,}")
    print(f"  isključeno D13 (stečaj i likvidacija): {d.gasenje.sum():,}; u analizi: {len(m):,}")

    print("\n=== Pokrivenost NKD šifre (bez mapiranja verzija) ===")
    for naziv, x in (("RH prije D13", d), ("RH (D2+D13)", m), ("OBŽ (D2+D13)", m[m.sifra_zupanije == OBZ_SIFRA_ZUPANIJE])):
        print(f"  {naziv:<14} {pokrivenost(x)}")

    ver = (pret.merge(nkd[["id", "verzija"]], left_on="nacionalna_klasifikacija_djelatnosti_id", right_on="id", how="left")
           .set_index("mbs").verzija)
    mv = m.assign(izvor=m.mbs.map(ver))
    print("\nIzvor šifre u analizi (RH):")
    print("  pretežita po verziji NKD:", mv[mv.ima_pretezitu].izvor.value_counts(dropna=False).to_dict())
    print(f"  samo glavna_djelatnost (NKD 2007): {(m.ima_glavnu & ~m.ima_pretezitu).sum():,}")
    print(f"  bez ikakve šifre: {(~m.ima_sifru).sum():,}")

    # --- D11: udio bez šifre po JLS-u i oznaka "niža pouzdanost" ---
    jls = (m.groupby(["sifra_opcine", "naziv_opcine"])
           .agg(n=("mbs", "size"), bez=("ima_sifru", lambda s: int((~s).sum()))).reset_index())
    jls["udio_bez"] = jls.bez / jls.n
    srednja, sd = jls.udio_bez.mean(), jls.udio_bez.std()
    prag = srednja + 2 * sd
    jls["niza_pouzdanost"] = jls.udio_bez > prag
    print("\n=== D11: udio subjekata bez šifre po JLS-u (neponderirano) ===")
    print(f"  JLS-ova: {len(jls)} | prosjek {srednja:.1%} | SD {sd:.1%} | prag (prosjek + 2 SD) {prag:.1%}")
    print(f"  ponderirani udio RH (svi subjekti): {(~m.ima_sifru).mean():.1%}")
    print(f"  JLS-ova s oznakom 'niža pouzdanost': {int(jls.niza_pouzdanost.sum())}; "
          f"JLS-ova s manje od 10 subjekata: {int((jls.n < 10).sum())}")
    print("  Najviši udjeli (top 10):")
    for _, r in jls.sort_values("udio_bez", ascending=False).head(10).iterrows():
        print(f"    {r.naziv_opcine:<28} {r.udio_bez:6.1%}  ({r.bez}/{r.n}){'  <- oznaka' if r.niza_pouzdanost else ''}")

    obz_ids = set(m[m.sifra_zupanije == OBZ_SIFRA_ZUPANIJE].sifra_opcine)
    obz = jls[jls.sifra_opcine.isin(obz_ids)]
    print(f"\n  OBŽ: {len(obz)} JLS-ova | udio bez šifre: min {obz.udio_bez.min():.1%}, medijan {obz.udio_bez.median():.1%}, "
          f"max {obz.udio_bez.max():.1%} | s oznakom: {int(obz.niza_pouzdanost.sum())}")
    for _, r in obz.sort_values("udio_bez", ascending=False).head(8).iterrows():
        print(f"    {r.naziv_opcine:<28} {r.udio_bez:6.1%}  ({r.bez}/{r.n}){'  <- oznaka' if r.niza_pouzdanost else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
