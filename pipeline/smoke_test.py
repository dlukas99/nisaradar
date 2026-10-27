"""Smoke test Sudreg API-ja: token, snapshot, brojevi redaka, uzorci, trajanje dohvata.

Pokretanje (iz korijena repozitorija):
    .venv\\bin\\python.exe -X utf8 pipeline\\smoke_test.py

Svi dohvati ide s ISTIM snapshot_id. Uzorci se spremaju u data/raw/ (u .gitignore).
Namjerno NE dohvaćamo tablice o osobama (D9) i NE koristimo detalji_subjekta (6 zahtjeva/min).
"""

from __future__ import annotations

import json
import logging
import sys
import time
from collections import Counter
from pathlib import Path

from sudreg_client import SudregClient, SudregError

sys.stdout.reconfigure(encoding="utf-8")  # Windows konzola je inače cp1252 pa pada na č, š, ž
logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "data" / "raw" / "samples"
SIFRARNICI = ROOT / "data" / "raw" / "sifrarnici"
TABLES = ["subjekti", "sjedista", "pretezite_djelatnosti", "pravni_oblici"]


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def save(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def timed_get(client: SudregClient, endpoint: str, params: dict):
    """get() + stvarno proteklo vrijeme i približna veličina odgovora (JSON re-serijalizacija)."""
    t0 = time.perf_counter()
    data, headers = client.get(endpoint, params)
    wall = time.perf_counter() - t0
    size_mb = len(json.dumps(data, ensure_ascii=False).encode("utf-8")) / 1e6
    return data, headers, wall, size_mb


def main() -> int:
    try:
        client = SudregClient()
    except SudregError as e:
        print("NEUSPJEH:", e)
        return 1
    report: dict = {}

    # 1) Token -------------------------------------------------------------
    section("1. Token")
    try:
        print(f"Token dobiven, vrijedi još ~{client.token_ok()} s (sam token se ne ispisuje).")
    except SudregError as e:
        print("NEUSPJEH:", e)
        return 1

    # 2) Snapshotovi -------------------------------------------------------
    section("2. /snapshots")
    try:
        snaps, _ = client.get("snapshots")
    except SudregError as e:
        print("NEUSPJEH:", e)
        if e.status == 401:
            print(">>> 401 nakon uspješnog tokena: potvrdi registraciju e-mailom (link 'Potvrdi').")
        return 1
    save(SAMPLES / "snapshots.json", snaps)
    for s in snaps[:10]:
        print(f"  id={s['id']} timestamp={s['timestamp']} available_until={s['available_until']} "
              f"staleness={s['staleness']}")
    # staleness 1 = zadnja snimka; -1 se pojavljuje kod isteklih snimki (API ih odbija), pa ih preskačemo.
    latest = min((s for s in snaps if s["staleness"] >= 1), key=lambda s: s["staleness"])
    sid = latest["id"]
    print(f"Koristimo snapshot_id={sid} (staleness={latest['staleness']}) za sve dohvate.")
    report["snapshot_id"] = sid
    report["snapshot_timestamp"] = latest["timestamp"]

    # 3) Brojevi redaka ----------------------------------------------------
    section("3. /counts")
    counts, h = client.get("counts", {"snapshot_id": sid})
    save(SAMPLES / "counts.json", counts)
    print(f"  X-Snapshot-Id u odgovoru: {h.get('X-Snapshot-Id')}")
    for c in counts:
        print(f"  {c['table_name']:<34} {c['count_aktivni']:>12,}")
    report["counts"] = {c["table_name"]: c["count_aktivni"] for c in counts}

    # 4) Šifrarnici (mali, treba nam cijeli za tumačenje ID-jeva) ---------------
    section("4. Šifrarnici: vrste_pravnih_oblika i nacionalna_klasifikacija_djelatnosti")
    vpo = [r for page in client.paginate("vrste_pravnih_oblika", snapshot_id=sid) for r in page]
    nkd = [r for page in client.paginate("nacionalna_klasifikacija_djelatnosti", snapshot_id=sid) for r in page]
    save(SIFRARNICI / "vrste_pravnih_oblika.json", vpo)
    save(SIFRARNICI / "nacionalna_klasifikacija_djelatnosti.json", nkd)
    print(f"vrste_pravnih_oblika: {len(vpo)} redaka. Polja prvog retka: {sorted(vpo[0])}")
    for r in sorted(vpo, key=lambda r: r["sifra"]):
        print(f"  id={r['id']} sifra={r['sifra']:>3} kratica={r.get('kratica')!r:<12} "
              f"naziv={r.get('naziv')!r} status={r.get('status')} vrijedi_do={r.get('vrijedi_do')}")
    print(f"\nNKD: {len(nkd)} redaka. Po verziji: {dict(Counter(r['verzija'] for r in nkd))}")
    print(f"  duljine šifri po verziji: "
          f"{ {v: sorted({len(r['sifra']) for r in nkd if r['verzija'] == v}) for v in {r['verzija'] for r in nkd}} }")
    for r in nkd[:6]:
        print(f"  id={r['id']} sifra={r['sifra']!r} verzija={r['verzija']} naziv={r['puni_naziv'][:50]!r}")
    vpo_by_id = {r["id"]: r for r in vpo}
    nkd_by_id = {r["id"]: r for r in nkd}

    # 5) Uzorci od 5 redaka -----------------------------------------------------
    section("5. Uzorci (5 redaka, isti snapshot)")
    for t in TABLES:
        data, h, _, _ = timed_get(client, t, {"snapshot_id": sid, "limit": 5})
        same = h.get("X-Snapshot-Id") == str(sid)
        print(f"\n[{t}] redaka={len(data)} X-Total-Count={h.get('X-Total-Count')} "
              f"snapshot ok={same} X-Log-Id={h.get('X-Log-Id')}")
        print(f"  polja: {sorted({k for r in data for k in r})}")
        print(f"  prvi redak: {json.dumps(data[0], ensure_ascii=False)}")
        save(SAMPLES / f"{t}.json", data)
    data, _, _, _ = timed_get(client, "pravni_oblici", {"snapshot_id": sid, "limit": 2, "expand_relations": "true"})
    print(f"\n[pravni_oblici expand_relations=true] prvi redak: {json.dumps(data[0], ensure_ascii=False)}")
    save(SAMPLES / "pravni_oblici_expand.json", data)

    # 6) Probe parametara: only_active i filtri -----------------------------------
    section("6. Probe: only_active i filtri po lokaciji")
    for label, extra in [("zadano", {}), ("only_active=1", {"only_active": "1"}),
                         ("only_active=0", {"only_active": "0"}), ("only_active=true", {"only_active": "true"}),
                         ("only_active=false", {"only_active": "false"})]:
        try:
            _, h = client.get("subjekti", {"snapshot_id": sid, "limit": 1, **extra})
            print(f"  subjekti {label:<18} X-Total-Count={h.get('X-Total-Count')}")
        except SudregError as e:
            print(f"  subjekti {label:<18} GREŠKA: {str(e)[:160]}")
    sj_sample = json.loads((SAMPLES / "sjedista.json").read_text(encoding="utf-8"))
    dom = next((r for r in sj_sample if r.get("sifra_zupanije") is not None), None)
    if dom:
        base = client.get("sjedista", {"snapshot_id": sid, "limit": 1})[1].get("X-Total-Count")
        for name in ("sifra_zupanije", "sifra_opcine"):
            try:
                _, h = client.get("sjedista", {"snapshot_id": sid, "limit": 1, name: dom[name]})
                print(f"  sjedista {name}={dom[name]}: X-Total-Count={h.get('X-Total-Count')} (bez filtra {base})"
                      f"{'  -> filtar IGNORIRAN' if h.get('X-Total-Count') == base else '  -> filtar RADI'}")
            except SudregError as e:
                print(f"  sjedista {name}: GREŠKA {str(e)[:160]}")

    # 7) Trajanje stranica + analiza ključeva ---------------------------------
    section("7. Trajanje stranica i analiza (limit=1000)")
    pages: dict[str, list[dict]] = {}
    per_row_s: dict[str, float] = {}
    totals: dict[str, int] = {}
    for t in TABLES:
        data, h, wall, mb = timed_get(client, t, {"snapshot_id": sid, "limit": 1000})
        pages[t] = data
        totals[t] = int(h["X-Total-Count"])
        per_row_s[t] = wall / len(data)
        print(f"  {t:<24} {len(data)} redaka, {wall:5.2f} s (server {h.get('X-Seconds-Elapsed')} s), "
              f"~{mb:.2f} MB, total={totals[t]:,}")

    section("7b. Veći limit")
    for t in ("subjekti", "sjedista", "pretezite_djelatnosti", "pravni_oblici"):
        for lim in (5000, 10000):
            try:
                data, h, wall, mb = timed_get(client, t, {"snapshot_id": sid, "limit": lim})
            except SudregError as e:
                print(f"  {t} limit={lim}: GREŠKA {str(e)[:200]}")
                break
            print(f"  {t:<24} limit={lim:>5} -> {len(data)} redaka, {wall:5.2f} s, ~{mb:.2f} MB")
            if len(data) == lim:
                per_row_s[t] = min(per_row_s[t], wall / len(data))
            if wall > 10 or mb > 10:
                print("    (preko granice od ~10 s / ~10 MB, dalje ne povećavam)")
                break
    # Duboki offset: straničenje s velikim offsetom zna biti sporije.
    mid = totals["subjekti"] // 2
    try:
        _, _, wall, mb = timed_get(client, "subjekti", {"snapshot_id": sid, "limit": 1000, "offset": mid})
        print(f"  subjekti duboki offset={mid:,} limit=1000: {wall:.2f} s, ~{mb:.2f} MB")
    except SudregError as e:
        print(f"  duboki offset GREŠKA: {str(e)[:200]}")

    section("7c. Procjena punog dohvata (4 tablice)")
    est = {t: totals[t] * per_row_s[t] for t in TABLES}
    for t in TABLES:
        print(f"  {t:<24} {totals[t]:>10,} redaka ~{est[t] / 60:5.1f} min")
    print(f"  UKUPNO ~{sum(est.values()) / 60:.1f} min (bez ponavljanja i bez sporijih dubokih offseta)")
    report["totals_xtotal"] = totals
    report["estimated_full_fetch_min"] = round(sum(est.values()) / 60, 1)

    # 8) Analiza stranica -----------------------------------------------------
    section("8. Analiza stranica od 1000 redaka")
    for t in TABLES:
        mbs = [r["mbs"] for r in pages[t]]
        print(f"  {t:<24} jedinstvenih mbs: {len(set(mbs))}/{len(mbs)}  (duplikati: {len(mbs) - len(set(mbs))})")
    sj, pd_, po, su = (pages[t] for t in ("sjedista", "pretezite_djelatnosti", "pravni_oblici", "subjekti"))
    print(f"\nSjedišta (1000 redaka): bez drzava_id (domaće)={sum('drzava_id' not in r for r in sj)}, "
          f"sa sifra_opcine={sum('sifra_opcine' in r for r in sj)}, "
          f"sa sifra_zupanije={sum('sifra_zupanije' in r for r in sj)}, "
          f"sa naziv_opcine={sum('naziv_opcine' in r for r in sj)}")
    print(f"  županije u stranici: {dict(Counter((r.get('sifra_zupanije'), r.get('naziv_zupanije')) for r in sj).most_common(5))}")
    mbs_su = {r["mbs"] for r in su}
    for name, rows in (("sjedista", sj), ("pretezite_djelatnosti", pd_), ("pravni_oblici", po)):
        ov = sum(r["mbs"] in mbs_su for r in rows)
        print(f"  preklapanje mbs {name} ∩ subjekti (ista stranica offset 0): {ov}/{len(rows)}")
    ver = Counter(nkd_by_id[r["nacionalna_klasifikacija_djelatnosti_id"]]["verzija"]
                  if r["nacionalna_klasifikacija_djelatnosti_id"] in nkd_by_id else "NEPOZNAT ID" for r in pd_)
    print(f"\nPretežite djelatnosti: verzija NKD-a po recima: {dict(ver)}")
    print(f"  distinct NKD id: {len({r['nacionalna_klasifikacija_djelatnosti_id'] for r in pd_})}")
    for r in pd_[:5]:
        k = nkd_by_id.get(r["nacionalna_klasifikacija_djelatnosti_id"], {})
        print(f"  mbs={r['mbs']} -> nkd_id={r['nacionalna_klasifikacija_djelatnosti_id']} sifra={k.get('sifra')!r} "
              f"verzija={k.get('verzija')} {str(k.get('puni_naziv'))[:40]!r}")
    print(f"\nsubjekti.glavna_djelatnost: primjeri {[r.get('glavna_djelatnost') for r in su[:8]]}, "
          f"prisutno u {sum('glavna_djelatnost' in r for r in su)}/{len(su)} redaka")
    print(f"  status: {dict(Counter(r['status'] for r in su))}  postupak: {dict(Counter(r['postupak'] for r in su))}  "
          f"ino_podruznica: {dict(Counter(r['ino_podruznica'] for r in su))}")
    po_c = Counter(r["vrsta_pravnog_oblika_id"] for r in po)
    print("\nPravni oblici u stranici (po ID-ju):")
    for vid, c in po_c.most_common():
        v = vpo_by_id.get(vid, {})
        print(f"  {c:>4}x id={vid} sifra={v.get('sifra')} kratica={v.get('kratica')!r} naziv={v.get('naziv')!r}")

    save(SAMPLES / "_smoke_report.json", report)
    print("\nGotovo. Uzorci su u data/raw/samples/, šifrarnici u data/raw/sifrarnici/ (oboje u .gitignore).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
