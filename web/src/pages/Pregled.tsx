import { useEffect, useMemo, useState } from "react";
import { Karta } from "../components/Karta";
import { StatusOznaka } from "../components/StatusOznaka";
import type { Osnovno, OdjeljakDatoteka, OdjeljakJls, Status } from "../lib/data";
import { dohvati } from "../lib/data";
import { STATUS, datum, fmt, fmt1, jlsVrsta } from "../lib/format";
import { idi } from "../lib/router";

type Kljuc = "naziv" | "stanovnika" | "broj" | "ocekivano" | "razlika" | "status";
const REDOSLIJED: Record<Status, number> = { nedostaje: 0, ravnoteza: 1, zasiceno: 2, premalo: 3 };

export function Pregled({ d, zup, odj, istaknuti }: { d: Osnovno; zup: number; odj: string; istaknuti?: number }) {
  const [dat, setDat] = useState<OdjeljakDatoteka | null>(null);
  const [sort, setSort] = useState<{ k: Kljuc; smjer: 1 | -1 }>({ k: "status", smjer: 1 });

  useEffect(() => {
    setDat(null);
    dohvati<OdjeljakDatoteka>(`odjeljak/${odj}.json`).then(setDat);
  }, [odj]);

  const zupanije = useMemo(() => {
    const m = new Map<number, string>();
    d.jls.forEach((j) => m.set(j.sifra_zupanije, j.zupanija));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "hr"));
  }, [d.jls]);
  const jlsUZup = useMemo(() => d.jls.filter((j) => zup === 0 || j.sifra_zupanije === zup), [d.jls, zup]);
  const podaci = useMemo(() => new Map<number, OdjeljakJls>((dat?.jls ?? []).map((r) => [r.sifra, r])), [dat]);
  const odjeljak = d.odjeljci.find((o) => o.odjeljak === odj);

  const redovi = useMemo(() => {
    const r = jlsUZup.map((j) => {
      const p = podaci.get(j.sifra);
      return { j, p, razlika: p && p.ocekivano !== null ? p.broj - p.ocekivano : 0 };
    });
    const v = (x: (typeof r)[number]): number | string => {
      switch (sort.k) {
        case "naziv": return x.j.naziv;
        case "stanovnika": return x.j.stanovnika;
        case "broj": return x.p?.broj ?? 0;
        case "ocekivano": return x.p?.ocekivano ?? -1;
        case "razlika": return x.razlika;
        case "status": return REDOSLIJED[x.p?.status ?? "premalo"] * 1e6 + (x.p?.p_manje ?? 1) * 1e3;
      }
    };
    return r.sort((a, b) => {
      const va = v(a), vb = v(b);
      return (typeof va === "string" ? va.localeCompare(vb as string, "hr") : va - (vb as number)) * sort.smjer;
    });
  }, [jlsUZup, podaci, sort]);

  const brojac = useMemo(() => {
    const c: Record<Status, number> = { nedostaje: 0, ravnoteza: 0, zasiceno: 0, premalo: 0 };
    redovi.forEach((r) => c[r.p?.status ?? "premalo"]++);
    return c;
  }, [redovi]);

  const nazivZup = zup === 0 ? "Republika Hrvatska" : `${zupanije.find(([s]) => s === zup)?.[1]} županija`;

  const izvozCsv = () => {
    const zaglavlje = ["sifra_jls", "jls", "vrsta", "zupanija", "stanovnika", "odjeljak_nkd2025", "stvarno", "ocekivano",
      "interval_10", "interval_90", "p_manje", "status", "status_samo_pretezita", "snapshot_id"];
    const esc = (s: string | number) => (typeof s === "string" && /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : String(s));
    const linije = redovi.map(({ j, p }) => [j.sifra, j.naziv, jlsVrsta(j.grad), j.zupanija, j.stanovnika, odj, p?.broj ?? 0,
      p?.ocekivano ?? "", p?.interval?.[0] ?? "", p?.interval?.[1] ?? "", p?.p_manje ?? "", p?.status ?? "premalo",
      p?.status_uzi ?? "", d.meta.snapshot_id].map(esc).join(";"));
    // BOM da Excel ispravno prikaže hrvatska slova; ";" jer hrvatski Excel koristi zarez kao decimalni znak.
    const blob = new Blob(["﻿" + [zaglavlje.join(";"), ...linije].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nisaradar_${zup === 0 ? "RH" : `zupanija${zup}`}_odjeljak${odj}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const zaglavljeStupca = (k: Kljuc, tekst: string, desno = false) => (
    <th className={desno ? "r" : undefined} aria-sort={sort.k === k ? (sort.smjer === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort((s) => ({ k, smjer: s.k === k ? (-s.smjer as 1 | -1) : 1 }))}>
        {tekst} {sort.k === k ? (sort.smjer === 1 ? "↑" : "↓") : ""}
      </button>
    </th>
  );

  return (
    <>
      <h1>Pregled po županiji</h1>
      <p className="muted">
        Semafor za odabranu djelatnost u svim gradovima i općinama. Kliknite JLS na karti ili u tablici za detalje i tržišni odlomak.
      </p>
      <div className="filteri card">
        <div>
          <label className="lbl" htmlFor="zup">Županija</label>
          <select id="zup" value={zup} onChange={(e) => idi(`/karta/${e.target.value}/${odj}`)}>
            <option value={0}>Cijela Hrvatska</option>
            {zupanije.map(([s, n]) => <option key={s} value={s}>{n}</option>)}
          </select>
        </div>
        <div style={{ flexBasis: 380 }}>
          <label className="lbl" htmlFor="odj">Djelatnost (odjeljak NKD 2025.)</label>
          <select id="odj" value={odj} onChange={(e) => idi(`/karta/${zup}/${e.target.value}`)}>
            {d.odjeljci.map((o) => <option key={o.odjeljak} value={o.odjeljak}>{o.odjeljak} – {o.naziv}</option>)}
          </select>
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <button onClick={izvozCsv} disabled={!dat}>⬇ Izvoz CSV</button>
        </div>
      </div>

      <h2>{odjeljak?.naziv} · {nazivZup}</h2>
      <div className="sazetak" aria-label="Sažetak">
        {(["nedostaje", "ravnoteza", "zasiceno", "premalo"] as Status[]).map((s) =>
          brojac[s] > 0 ? (
            <span key={s} className={`status st-${s}`}>
              <span className="ik" aria-hidden="true">{STATUS[s].ikona}</span> {STATUS[s].oznaka}: {brojac[s]}
            </span>
          ) : null,
        )}
      </div>
      {odjeljak?.obrti && (
        <div className="oznaka" style={{ marginBottom: 12 }}>
          <span aria-hidden="true">!</span>
          <span><strong>Niža pouzdanost:</strong> u ovoj djelatnosti obično prevladavaju obrti, koji nisu u Sudskom registru.</span>
        </div>
      )}

      <Karta jls={jlsUZup} podaci={podaci} odabraniJls={istaknuti} onKlik={(s) => idi(`/rezultat/${s}/${odj}`)} />
      <p className="small muted" style={{ marginTop: 6 }}>
        Podaci: Sudski registar, snapshot {d.meta.snapshot_id} ({datum(d.meta.snapshot_vrijeme)}); Popis 2021.; indeks razvijenosti 2024.
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="tbl-wrap" style={{ maxHeight: 560 }}>
          <table>
            <caption className="sr-only">Gradovi i općine: stvarni i očekivani broj tvrtki te semafor</caption>
            <thead>
              <tr>
                {zaglavljeStupca("naziv", "Grad / općina")}
                {zaglavljeStupca("stanovnika", "Stanovnika", true)}
                {zaglavljeStupca("broj", "Stvarno", true)}
                {zaglavljeStupca("ocekivano", "Očekivano", true)}
                <th className="r">80 % raspon</th>
                {zaglavljeStupca("razlika", "Razlika", true)}
                {zaglavljeStupca("status", "Semafor")}
              </tr>
            </thead>
            <tbody>
              {!dat && <tr><td colSpan={7} className="muted">Učitavam…</td></tr>}
              {dat && redovi.map(({ j, p, razlika }) => (
                <tr key={j.sifra} className={`klik ${j.sifra === istaknuti ? "odabran" : ""}`} onClick={() => idi(`/rezultat/${j.sifra}/${odj}`)}>
                  <td>
                    <a href={`#/rezultat/${j.sifra}/${odj}`} onClick={(e) => e.stopPropagation()}>{j.naziv}</a>
                    {zup === 0 && <span className="muted small"> · {j.zupanija}</span>}
                    {j.niza_pouzdanost_nkd && <span className="muted small" title="Neuobičajeno velik udio tvrtki bez šifre djelatnosti"> · niža pouzdanost</span>}
                  </td>
                  <td className="r">{fmt(j.stanovnika)}</td>
                  <td className="r">{fmt(p?.broj ?? 0)}</td>
                  <td className="r">{p?.ocekivano != null ? fmt1(p.ocekivano) : "–"}</td>
                  <td className="r">{p?.interval ? `${p.interval[0]}–${p.interval[1]}` : "–"}</td>
                  <td className="r">{p?.ocekivano != null ? (razlika > 0 ? "+" : "") + fmt1(razlika) : "–"}</td>
                  <td>
                    <StatusOznaka status={p?.status ?? "premalo"} mala />
                    {p && p.status_uzi && p.status !== "premalo" && p.status_uzi !== p.status && (
                      <span className="muted small" title="Model samo na pretežitoj djelatnosti daje drukčiji status"> *</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          * Model samo na pretežitoj djelatnosti (strožiji izvor) daje drukčiji status. Takav nalaz uzmite s rezervom.
        </p>
      </div>
    </>
  );
}
