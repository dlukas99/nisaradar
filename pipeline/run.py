"""Cijeli noćni pipeline: dohvat -> build -> model -> export.

Plan B (CLAUDE.md, odjeljak 5): ako dohvat iz Sudrega ne uspije, ne rušimo se, nego izvozimo zadnji uspješni snapshot
iz data/snapshot/ (agregati su u gitu). UI tada prikazuje datum tog snapshota.

Pokretanje:
  .venv\\Scripts\\python.exe -X utf8 pipeline\\run.py              # puni pipeline
  .venv\\Scripts\\python.exe -X utf8 pipeline\\run.py --bez-dohvata  # samo build/model/export nad postojećim podacima
  .venv\\Scripts\\python.exe -X utf8 pipeline\\run.py --samo-export  # samo izvoz za web (npr. na GitHub Pages buildu)
"""

from __future__ import annotations

import argparse
import sys
import time

import build
import export
import fetch_sudreg
import model

sys.stdout.reconfigure(encoding="utf-8")


def korak(naziv: str, fn) -> int:
    t = time.time()
    print(f"\n=== {naziv} ===", flush=True)
    rc = fn()
    print(f"=== {naziv}: gotovo za {time.time() - t:.0f} s (kod {rc}) ===", flush=True)
    return rc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bez-dohvata", action="store_true")
    ap.add_argument("--samo-export", action="store_true")
    args, _ = ap.parse_known_args()
    sys.argv = sys.argv[:1]  # podmoduli imaju svoje argparse; ne prosljeđujemo im naše zastavice

    if args.samo_export:
        return korak("export", export.main)

    if not args.bez_dohvata:
        try:
            if korak("dohvat Sudreg", fetch_sudreg.main) != 0:
                raise RuntimeError("dohvat nije uspio")
        except Exception as e:  # noqa: BLE001 - plan B: svaka greška dohvata vodi na zadnji snapshot
            print(f"PLAN B: dohvat nije uspio ({type(e).__name__}: {e}). Izvozim zadnji uspješni snapshot.")
            return korak("export", export.main)

    for naziv, fn in (("build", build.main), ("model", model.main), ("export", export.main)):
        if korak(naziv, fn) != 0:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
