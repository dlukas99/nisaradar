"""Puni dohvat potrebnih tablica Sudskog registra s checkpointom po stranicama.

Zašto checkpoint: puni dohvat traje ~14 min, a veza zna puknuti (ChunkedEncodingError). Svaka stranica sprema se
odmah u data/raw/pages/<snapshot_id>/<tablica>/<offset>.json. Ponovno pokretanje preskače već spremljene stranice,
pa se nastavlja točno gdje je stalo, i to nad ISTIM snapshotom (CLAUDE.md 3.1: sve tablice iz istog snapshota).

Kad su sve stranice tablice tu, spajaju se u data/raw/full/<tablica>.parquet. Šifrarnici idu u data/raw/sifrarnici/.
Na kraju se piše data/raw/full/_meta.json (snapshot_id, vrijeme snapshota i dohvata).

D9: dohvaćamo samo tablice bez osobnih podataka; /detalji_subjekta se ne koristi.

Pokretanje: .venv\\Scripts\\python.exe -X utf8 pipeline\\fetch_sudreg.py [--snapshot ID]
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from sudreg_client import SudregClient

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
FULL = RAW / "full"
SIFRARNICI = RAW / "sifrarnici"

TABLICE = ["sjedista", "pravni_oblici", "pretezite_djelatnosti", "subjekti"]
SIFRARNICI_LISTA = ["nacionalna_klasifikacija_djelatnosti", "vrste_pravnih_oblika", "vrste_postupaka"]
LIMIT = 1000  # veći limit povremeno prekida vezu (provjereno 27.10.)


def zadnji_snapshot(client: SudregClient) -> dict:
    snaps, _ = client.get("snapshots")
    # staleness 1 = najnoviji; -1 = istekao (API ga odbija). ID-jevi nisu poredani po starosti.
    return min((s for s in snaps if s["staleness"] >= 1), key=lambda s: s["staleness"])


def dohvati_tablicu(client: SudregClient, tablica: str, sid: int, mapa: Path) -> list[dict]:
    mapa.mkdir(parents=True, exist_ok=True)
    total_put = mapa / "_total.txt"
    offset = 0
    while True:
        stranica = mapa / f"{offset:09d}.json"
        if stranica.exists():
            redovi = json.loads(stranica.read_text(encoding="utf-8"))
        else:
            redovi, zaglavlja = client.get(tablica, {"snapshot_id": sid, "offset": offset, "limit": LIMIT,
                                                     "no_data_error": 0})
            if not isinstance(redovi, list):
                redovi = []
            if "X-Total-Count" in zaglavlja:
                total_put.write_text(zaglavlja["X-Total-Count"])
            vraceni_sid = zaglavlja.get("X-Snapshot-Id")
            if vraceni_sid and int(vraceni_sid) != sid:
                raise RuntimeError(f"{tablica}: API je vratio snapshot {vraceni_sid}, a tražen je {sid}")
            # Spremi atomarno (privremena datoteka pa preimenovanje), da prekid ne ostavi pola stranice.
            tmp = stranica.with_suffix(".tmp")
            tmp.write_text(json.dumps(redovi, ensure_ascii=False), encoding="utf-8")
            tmp.replace(stranica)
        total = int(total_put.read_text()) if total_put.exists() else None
        offset += len(redovi)
        if offset % 20000 < LIMIT:
            print(f"  {tablica}: {offset:,} / {total if total is not None else '?'}", flush=True)
        if not redovi or (total is not None and offset >= total):
            break
    sve = []
    for f in sorted(mapa.glob("*.json")):
        sve += json.loads(f.read_text(encoding="utf-8"))
    return sve


def main() -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", type=int, help="snapshot_id (zadano: najnoviji)")
    args = ap.parse_args()

    client = SudregClient()
    if args.snapshot:
        snap = {"id": args.snapshot, "timestamp": None}
    else:
        snap = zadnji_snapshot(client)
    sid = int(snap["id"])
    print(f"Snapshot {sid} ({snap.get('timestamp')})")
    stranice = RAW / "pages" / str(sid)

    FULL.mkdir(parents=True, exist_ok=True)
    SIFRARNICI.mkdir(parents=True, exist_ok=True)
    broj = {}
    for t in TABLICE:
        print(f"Dohvaćam {t} ...", flush=True)
        redovi = dohvati_tablicu(client, t, sid, stranice / t)
        df = pd.DataFrame(redovi)
        if "mbs" in df and df.mbs.duplicated().any():
            # API ponekad vrati preklapajuće stranice; mbs je u ovim tablicama jedinstven (provjereno 27.10.).
            print(f"  {t}: uklonjeno {int(df.mbs.duplicated().sum())} ponovljenih redaka")
            df = df.drop_duplicates("mbs")
        df.to_parquet(FULL / f"{t}.parquet", index=False)
        broj[t] = len(df)
        print(f"  {t}: {len(df):,} redaka")
    for s in SIFRARNICI_LISTA:
        redovi = dohvati_tablicu(client, s, sid, stranice / s)
        (SIFRARNICI / f"{s}.json").write_text(json.dumps(redovi, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  šifrarnik {s}: {len(redovi):,}")

    (FULL / "_meta.json").write_text(json.dumps({
        "snapshot_id": sid,
        "snapshot_timestamp": snap.get("timestamp"),
        "dohvaceno": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "redaka": broj,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    # Stranice starijih snapshotova više ne trebaju (nastavak ima smisla samo za tekući snapshot).
    for stara in (RAW / "pages").iterdir():
        if stara.is_dir() and stara.name != str(sid):
            shutil.rmtree(stara)
    print("Gotovo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
