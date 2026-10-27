import { useEffect, useMemo, useState } from "react";
import { Razdioba } from "../components/Razdioba";
import { StatusOznaka } from "../components/StatusOznaka";
import type { Deficit, Osnovno, OdjeljakDatoteka } from "../lib/data";
import { dohvati } from "../lib/data";
import { STATUS, fmt, fmt1, jlsVrsta, postotak, subjekata } from "../lib/format";
import { na10k, tekstOdlomka } from "../lib/odlomak";

export function Rezultat({ d, sifra, odj, razredKod }: { d: Osnovno; sifra: number; odj: string; razredKod: string | null }) {
  const [def, setDef] = useState<Deficit | null>(null);
  const [odjDat, setOdjDat] = useState<OdjeljakDatoteka | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [kopirano, setKopirano] = useState(false);

  useEffect(() => {
    setDef(null);
    setGreska(null);
    Promise.all([dohvati<Deficit>(`deficit/${sifra}.json`), dohvati<OdjeljakDatoteka>(`odjeljak/${odj}.json`)])
      .then(([a, b]) => {
        setDef(a);
        setOdjDat(b);
      })
      .catch((e) => setGreska(String(e)));
  }, [sifra, odj]);

  const jls = d.jls.find((j) => j.sifra === sifra);
  const odjeljak = d.odjeljci.find((o) => o.odjeljak === odj);
  const razred = razredKod ? d.razredi.find((r) => r.razred === razredKod) : undefined;
  const celija = def?.odjeljci.find((c) => c.odjeljak === odj);

  const stope = useMemo(() => {
    if (!odjDat || !jls) return null;
    const popPo = new Map(d.jls.map((j) => [j.sifra, j]));
    let zb = 0, zp = 0, rb = 0, rp = 0;
    for (const r of odjDat.jls) {
      const j = popPo.get(r.sifra);
      if (!j) continue;
      rb += r.broj; rp += j.stanovnika;
      if (j.sifra_zupanije === jls.sifra_zupanije) { zb += r.broj; zp += j.stanovnika; }
    }
    return { zupanija: na10k(zb, zp), rh: na10k(rb, rp) };
  }, [odjDat, jls, d.jls]);

  // Kontekst za objašnjenje: stopa u ostatku županije (značajka modela).
  const ostatakZupanije = useMemo(() => {
    if (!odjDat || !jls) return null;
    const popPo = new Map(d.jls.map((j) => [j.sifra, j]));
    let b = 0, p = 0;
    for (const r of odjDat.jls) {
      const j = popPo.get(r.sifra);
      if (j && j.sifra_zupanije === jls.sifra_zupanije && j.sifra !== jls.sifra) { b += r.broj; p += j.stanovnika; }
    }
    return p > 0 ? na10k(b, p) : null;
  }, [odjDat, jls, d.jls]);

  const prilike = useMemo(
    () =>
      (def?.odjeljci ?? [])
        .filter((c) => c.status === "nedostaje" && c.odjeljak !== odj)
        .sort((a, b) => (a.p_manje ?? 1) - (b.p_manje ?? 1))
        .slice(0, 6),
    [def, odj],
  );

  if (!jls || !odjeljak) return <p className="greska">Nepoznat grad/općina ili djelatnost. <a href="#/">Natrag na početak</a></p>;
  if (greska) return <p className="greska">Podaci se nisu mogli učitati ({greska}).</p>;
  if (!def || !celija || !stope) return <p className="ucitavanje">Učitavam rezultat…</p>;

  const st = STATUS[celija.status];
  const odlomak = tekstOdlomka({
    jls, odjeljak, celija, razred, brojURazredu: razred ? def.razredi[razred.razred] ?? 0 : undefined,
    meta: d.meta, stopaZupanija: stope.zupanija, stopaRh: stope.rh,
  });
  const potvrda = celija.status_uzi;

  return (
    <>
      <p className="ne-ispis small">
        <a href="#/">← Nova provjera</a>
      </p>
      <h1>
        {odjeljak.naziv}
        <span className="muted" style={{ fontWeight: 500 }}> · {jls.naziv}</span>
      </h1>
      <p className="muted">
        NKD 2025. odjeljak {odjeljak.odjeljak} ({odjeljak.podrucje_naziv})
        {razred && <> · vaša ideja: razred {razred.razred} {razred.naziv}</>} · {jlsVrsta(jls.grad)} {jls.naziv}, {jls.zupanija} županija
      </p>

      <div className="card">
        <div className="rezultat-glavni">
          <div className={`presuda ${celija.status}`}>
            <div className="velika">
              <span aria-hidden="true">{st.ikona}</span> {st.oznaka}
            </div>
            {celija.ocekivano !== null && celija.interval ? (
              <p style={{ fontSize: "1.08rem", marginTop: 8 }}>
                U {jls.grad ? "gradu" : "općini"} {jls.naziv} posluje <strong>{subjekata(celija.broj)}</strong> u ovoj djelatnosti.
                Za {jls.grad ? "grad" : "općinu"} ovakve veličine i strukture očekivano je <strong>{fmt1(celija.ocekivano)}</strong>{" "}
                (80 % raspon <strong>{celija.interval[0]}–{celija.interval[1]}</strong>).
              </p>
            ) : (
              <p style={{ marginTop: 8 }}>
                U {jls.grad ? "gradu" : "općini"} {jls.naziv} posluje <strong>{subjekata(celija.broj)}</strong>. {st.opis}
              </p>
            )}
            <p className="muted small">{st.opis}</p>

            <div className="brojke">
              <div className="brojka">
                <div className="v">{fmt(celija.broj)}</div>
                <div className="k">stvarno</div>
              </div>
              <div className="brojka">
                <div className="v">{celija.ocekivano !== null ? fmt1(celija.ocekivano) : "–"}</div>
                <div className="k">očekivano</div>
              </div>
              <div className="brojka">
                <div className="v">{celija.interval ? `${celija.interval[0]}–${celija.interval[1]}` : "–"}</div>
                <div className="k">80 % raspon</div>
              </div>
            </div>

            <div className="oznake">
              {celija.status !== "premalo" && potvrda && (
                <div className={`oznaka ${potvrda === celija.status ? "ok" : ""}`}>
                  <span aria-hidden="true">{potvrda === celija.status ? "✓" : "!"}</span>
                  <span>
                    {potvrda === celija.status ? (
                      <>Isti zaključak daje i provjera samo na pretežitoj djelatnosti (strožiji izvor). Nalaz je stabilan.</>
                    ) : (
                      <>
                        Provjera samo na pretežitoj djelatnosti daje „{STATUS[potvrda].oznaka.toLowerCase()}”. Nalaz ovisi o izvoru
                        šifre djelatnosti, pa ga uzmite s rezervom.
                      </>
                    )}
                  </span>
                </div>
              )}
              {odjeljak.obrti && (
                <div className="oznaka">
                  <span aria-hidden="true">!</span>
                  <span>
                    <strong>Niža pouzdanost:</strong> u ovoj djelatnosti obično prevladavaju obrti, a oni nisu u Sudskom registru.
                  </span>
                </div>
              )}
              {jls.niza_pouzdanost_nkd && (
                <div className="oznaka">
                  <span aria-hidden="true">!</span>
                  <span>
                    <strong>Niža pouzdanost:</strong> {postotak(jls.udio_bez_sifre)} tvrtki u ovom JLS-u nema šifru djelatnosti
                    (neuobičajeno puno).
                  </span>
                </div>
              )}
              <div className="oznaka info">
                <span aria-hidden="true">i</span>
                <span>
                  Pokrivenost: trgovačka društva i zadruge, bez obrta. {postotak(jls.udio_bez_sifre)} tvrtki u ovom JLS-u nema
                  šifru djelatnosti i nije uključeno.
                </span>
              </div>
            </div>
          </div>

          <div>
            {celija.ocekivano !== null && celija.interval && odjeljak.alpha !== null ? (
              <>
                <h3>Koliko je tvrtki uobičajeno ovdje?</h3>
                <p className="small muted">
                  Vjerojatnost svakog mogućeg broja tvrtki prema modelu, za {jls.grad ? "grad" : "općinu"} veličine, dobne strukture i razvijenosti kao {jls.naziv}.
                </p>
                <Razdioba mu={celija.ocekivano} alpha={odjeljak.alpha} stvarno={celija.broj} interval={celija.interval} />
              </>
            ) : (
              <p className="muted">
                Odjeljak ima manje od 50 tvrtki u cijeloj Hrvatskoj, pa za njega ne računamo očekivanje.
              </p>
            )}
            <p className="small" style={{ marginTop: 12 }}>
              Na 10.000 stanovnika: <strong>{fmt1(na10k(celija.broj, jls.stanovnika))}</strong> ovdje ·{" "}
              {fmt1(stope.zupanija)} u županiji · {fmt1(stope.rh)} u RH
            </p>
            {razred && (
              <p className="small">
                U užem razredu {razred.razred} ovdje posluje <strong>{subjekata(def.razredi[razred.razred] ?? 0)}</strong>{" "}
                <span className="muted">(samo informativno, model radi na razini odjeljka)</span>.
              </p>
            )}
            <p className="ne-ispis small">
              <a href={`#/karta/${jls.sifra_zupanije}/${odj}?jls=${jls.sifra}`}>Usporedi s ostalim JLS-ovima u županiji →</a>
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <details className="kako">
          <summary>Kako smo izračunali?</summary>
          <p>
            Za svaku djelatnost (odjeljak NKD 2025.) model je naučio koliko tvrtki obično ima grad ili općina s obzirom na broj
            stanovnika i četiri obilježja. Model je negativna binomna regresija naučena na svih {d.meta.obuhvat.jls} gradova i općina.
            Zatim stvarni broj uspoređujemo s očekivanom razdiobom:
          </p>
          <ul>
            <li><strong>Nedostaje</strong> ako je stvarni broj ispod 10. percentila očekivanja,</li>
            <li><strong>Zasićeno</strong> ako je iznad 90. percentila,</li>
            <li><strong>U ravnoteži</strong> inače.</li>
          </ul>
          <table className="kako-tablica">
            <tbody>
              <tr><td>Broj stanovnika (Popis 2021.)</td><td className="num">{fmt(jls.stanovnika)}</td></tr>
              <tr><td>Udio stanovnika 65+</td><td className="num">{postotak(jls.udio_65)}</td></tr>
              <tr><td>Udio stanovnika 0–14</td><td className="num">{postotak(jls.udio_0_14)}</td></tr>
              <tr><td>Indeks razvijenosti (2024.)</td><td className="num">{fmt1(jls.indeks_razvijenosti)} ({jls.skupina_razvijenosti}. skupina)</td></tr>
              <tr><td>Grad ili općina</td><td>{jlsVrsta(jls.grad)}</td></tr>
              <tr><td>Tvrtki u djelatnosti na 10.000 st. u ostatku županije</td><td className="num">{ostatakZupanije !== null ? fmt1(ostatakZupanije) : "– (županija je jedan JLS, koristi se RH)"}</td></tr>
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 12 }}>
            Provjera točnosti: na gradovima i općinama županija koje model nije vidio prosječna pogreška pada s{" "}
            {fmt1(d.meta.evaluacija.mae_baseline)} na {fmt1(d.meta.evaluacija.mae_glm)} tvrtki po djelatnosti u odnosu na
            jednostavno pravilo „nacionalni prosjek × stanovnici”. <a href="#/izvori">Više o metodi i izvorima</a>.
          </p>
        </details>
      </div>

      <div className="card">
        <h2>Tržišni odlomak za poslovni plan</h2>
        <p className="muted small ne-ispis">Gotov tekst s izvorima. Kopirajte ga u zahtjev za potporu ili poslovni plan.</p>
        <div className="odlomak" id="odlomak">{odlomak}</div>
        <div className="btn-row ne-ispis" style={{ marginTop: 12 }}>
          <button
            className="btn-primary"
            onClick={() =>
              navigator.clipboard.writeText(odlomak).then(() => {
                setKopirano(true);
                setTimeout(() => setKopirano(false), 2500);
              })
            }
          >
            {kopirano ? "✓ Kopirano" : "Kopiraj tekst"}
          </button>
          <button onClick={() => window.print()}>Ispiši / spremi PDF</button>
        </div>
        <p className="sr-only" aria-live="polite">{kopirano ? "Tekst je kopiran." : ""}</p>
      </div>

      {prilike.length > 0 && (
        <div className="card ne-ispis">
          <h2>Djelatnosti koje nedostaju u {jls.grad ? "gradu" : "općini"} {jls.naziv}</h2>
          <p className="muted small">Odjeljci sa statusom „nedostaje”, od najizraženijeg.</p>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr><th>Djelatnost</th><th className="r">Stvarno</th><th className="r skriveno-mob">Očekivano</th><th>Status</th></tr>
              </thead>
              <tbody>
                {prilike.map((c) => {
                  const o = d.odjeljci.find((x) => x.odjeljak === c.odjeljak);
                  return (
                    <tr key={c.odjeljak} className="klik" onClick={() => (window.location.hash = `/rezultat/${jls.sifra}/${c.odjeljak}`)}>
                      <td>
                        <a href={`#/rezultat/${jls.sifra}/${c.odjeljak}`}>{c.odjeljak} – {o?.naziv}</a>
                        {o?.obrti && <span className="muted small"> · niža pouzdanost</span>}
                      </td>
                      <td className="r">{fmt(c.broj)}</td>
                      <td className="r skriveno-mob">{c.ocekivano !== null ? fmt1(c.ocekivano) : "–"}</td>
                      <td><StatusOznaka status={c.status} mala /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
