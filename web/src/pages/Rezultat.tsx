import { useEffect, useMemo, useState } from "react";
import { Razdioba } from "../components/Razdioba";
import { StatusOznaka } from "../components/StatusOznaka";
import type { Deficit, Osnovno, OdjeljakDatoteka } from "../lib/data";
import { dohvati } from "../lib/data";
import { STATUS, fmt, fmt1, jlsVrsta, postotak, subjekata } from "../lib/format";
import { na10k, tekstOdlomka, type UziPogled } from "../lib/odlomak";
import type { Opisi } from "../lib/pretraga";
import { ocijeni } from "../lib/stat";

export function Rezultat({ d, sifra, odj, razredKod }: { d: Osnovno; sifra: number; odj: string; razredKod: string | null }) {
  const [def, setDef] = useState<Deficit | null>(null);
  const [odjDat, setOdjDat] = useState<OdjeljakDatoteka | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [kopirano, setKopirano] = useState(false);
  const [opisi, setOpisi] = useState<Opisi | null>(null);

  // Službeni opis razreda ("Ovaj podrazred uključuje ...") da korisnik vidi što točno spada u djelatnost.
  useEffect(() => {
    if (razredKod) dohvati<Opisi>("nkd_opisi.json").then(setOpisi, () => setOpisi({}));
  }, [razredKod]);

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

  // D15: uži pogled po razredu. Očekivanje razreda = očekivanje odjeljka × udio razreda u odjeljku u RH;
  // negativna binomna razdioba stanjivanjem zadržava isti α, pa raspon i semafor računamo istim pravilom (D5).
  const uze: UziPogled | undefined = useMemo(() => {
    if (!razred || razred.udio === null || !def || !celija || celija.ocekivano === null || !odjeljak || odjeljak.alpha === null)
      return undefined;
    const broj = def.razredi[razred.razred] ?? 0;
    const ocekivano = celija.ocekivano * razred.udio;
    const o = ocijeni(ocekivano, odjeljak.alpha, broj);
    return { razred, broj, ocekivano, interval: o.interval, status: o.status };
  }, [razred, def, celija, odjeljak]);

  // D16: lokali na OpenStreetMap karti; undefined ako karta za ovu vrstu djelatnosti nema oznaku.
  const osm = useMemo(() => {
    if (!def || !d.meta.osm) return undefined;
    const mapirani = new Set(d.meta.osm.razredi);
    if (razred) return mapirani.has(razred.razred) ? def.osm[razred.razred] ?? 0 : undefined;
    const uOdjeljku = [...mapirani].filter((r) => r.startsWith(odj + "."));
    return uOdjeljku.length ? uOdjeljku.reduce((zbroj, r) => zbroj + (def.osm[r] ?? 0), 0) : undefined;
  }, [def, d.meta.osm, razred, odj]);

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

  // Glavni prikaz: razred ako ga možemo procijeniti (uže, D15), inače odjeljak.
  const g = uze
    ? { status: uze.status, broj: uze.broj, ocekivano: uze.ocekivano as number | null, interval: uze.interval as [number, number] | null }
    : { status: celija.status, broj: celija.broj, ocekivano: celija.ocekivano, interval: celija.interval };
  const st = STATUS[g.status];
  const odlomak = tekstOdlomka({
    jls, odjeljak, celija, uze, osm,
    razred: uze ? undefined : razred, brojURazredu: !uze && razred ? def.razredi[razred.razred] ?? 0 : undefined,
    meta: d.meta, stopaZupanija: stope.zupanija, stopaRh: stope.rh,
  });
  const potvrda = uze ? null : celija.status_uzi;
  const opisRazreda = razred && opisi ? (opisi[razred.razred] ?? []).filter(([izv]) => izv !== "r").slice(0, 8) : [];
  const uOvom = jls.grad ? "gradu" : "općini";

  return (
    <>
      <p className="ne-ispis small">
        <a href="#/">← Nova provjera</a>
      </p>
      <h1>
        {razred ? razred.naziv : odjeljak.naziv}
        <span className="muted" style={{ fontWeight: 500 }}> · {jls.naziv}</span>
      </h1>
      <p className="muted">
        {razred ? (
          <>NKD 2025. razred {razred.razred} (odjeljak {odjeljak.odjeljak} – {odjeljak.naziv})</>
        ) : (
          <>NKD 2025. odjeljak {odjeljak.odjeljak} ({odjeljak.podrucje_naziv})</>
        )}{" "}
        · {jlsVrsta(jls.grad)} {jls.naziv}, {jls.zupanija} županija
      </p>

      <div className="card">
        <div className="rezultat-glavni">
          <div className={`presuda ${g.status}`}>
            <div className="velika">
              <span aria-hidden="true">{st.ikona}</span> {st.oznaka}
            </div>
            {g.ocekivano !== null && g.interval ? (
              <p style={{ fontSize: "1.08rem", marginTop: 8 }}>
                U {uOvom} {jls.naziv} registrirano je <strong>{subjekata(g.broj)}</strong> {uze ? "u ovom razredu" : "u ovoj djelatnosti"}.
                Za {jls.grad ? "grad" : "općinu"} ovakve veličine i strukture očekivano je <strong>{fmt1(g.ocekivano)}</strong>{" "}
                (80 % raspon <strong>{g.interval[0]}–{g.interval[1]}</strong>).
              </p>
            ) : (
              <p style={{ marginTop: 8 }}>
                U {uOvom} {jls.naziv} registrirano je <strong>{subjekata(g.broj)}</strong>. {st.opis}
              </p>
            )}
            <p className="muted small">{st.opis}</p>

            <div className="brojke">
              <div className="brojka">
                <div className="v">{fmt(g.broj)}</div>
                <div className="k">stvarno</div>
              </div>
              <div className="brojka">
                <div className="v">{g.ocekivano !== null ? fmt1(g.ocekivano) : "–"}</div>
                <div className="k">očekivano</div>
              </div>
              <div className="brojka">
                <div className="v">{g.interval ? `${g.interval[0]}–${g.interval[1]}` : "–"}</div>
                <div className="k">80 % raspon</div>
              </div>
            </div>

            <div className="oznake">
              {uze && (
                <div className="oznaka info">
                  <span aria-hidden="true">i</span>
                  <span>
                    Procjena za razred: očekivanje cijelog odjeljka × udio razreda u odjeljku u RH ({postotak(uze.razred.udio ?? 0)}).
                    Pretpostavlja da je taj udio svugdje sličan.
                  </span>
                </div>
              )}
              {razred && !uze && (
                <div className="oznaka info">
                  <span aria-hidden="true">i</span>
                  <span>
                    Razred {razred.razred} ima premalo tvrtki u Hrvatskoj za vlastitu procjenu, pa prikazujemo cijeli odjeljak{" "}
                    {odjeljak.odjeljak}. U razredu je ovdje registrirano {subjekata(def.razredi[razred.razred] ?? 0)}.
                  </span>
                </div>
              )}
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
            </div>
          </div>

          <div>
            {g.ocekivano !== null && g.interval && odjeljak.alpha !== null ? (
              <>
                <h3>Koliko je tvrtki uobičajeno ovdje?</h3>
                <p className="small muted">
                  Vjerojatnost svakog mogućeg broja tvrtki prema modelu, za {jls.grad ? "grad" : "općinu"} veličine, dobne strukture i razvijenosti kao {jls.naziv}.
                </p>
                <Razdioba mu={g.ocekivano} alpha={odjeljak.alpha} stvarno={g.broj} interval={g.interval} />
              </>
            ) : (
              <p className="muted">
                Odjeljak ima manje od 50 tvrtki u cijeloj Hrvatskoj, pa za njega ne računamo očekivanje.
              </p>
            )}
            {uze && (
              <div className="sira">
                <span className="small muted">Šira djelatnost: odjeljak {odjeljak.odjeljak} – {odjeljak.naziv}</span>
                <div className="sira-red">
                  <StatusOznaka status={celija.status} mala />
                  <span className="small">
                    stvarno <strong>{fmt(celija.broj)}</strong>
                    {celija.ocekivano !== null && celija.interval && (
                      <>, očekivano {fmt1(celija.ocekivano)} ({celija.interval[0]}–{celija.interval[1]})</>
                    )}
                  </span>
                </div>
              </div>
            )}
            <p className="small" style={{ marginTop: 12 }}>
              Tvrtki u odjeljku {odjeljak.odjeljak} na 10.000 stanovnika: <strong>{fmt1(na10k(celija.broj, jls.stanovnika))}</strong> ovdje ·{" "}
              {fmt1(stope.zupanija)} u županiji · {fmt1(stope.rh)} u RH
            </p>
            <p className="ne-ispis small">
              <a href={`#/karta/${jls.sifra_zupanije}/${odj}?jls=${jls.sifra}`}>Usporedi s ostalim JLS-ovima u županiji →</a>
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Što ovi brojevi ne vide</h2>
        <ul className="ne-vide">
          <li>
            <strong>Obrte.</strong> Sudski registar sadrži samo trgovačka društva i zadruge. Obrti su u Obrtnom registru, za koji ne
            postoje otvoreni podaci po djelatnosti i općini. Model zato uspoređuje tvrtke s tvrtkama: kaže ima li ovdje
            neuobičajeno malo ili puno <em>tvrtki</em>, a ne svih poduzetnika.
            {odjeljak.obrti && <> U ovoj djelatnosti obrti obično prevladavaju, pa je zaključak samo okviran.</>}
          </li>
          <li>
            <strong>Poslovnice.</strong> Tvrtka se broji u mjestu sjedišta. Prodavaonica trgovačkog lanca, poslovnica banke ili
            benzinska postaja tvrtke sa sjedištem u drugom gradu ovdje se ne vidi.
          </li>
          <li>
            <strong>Tvrtke bez šifre djelatnosti:</strong> {postotak(jls.udio_bez_sifre)} tvrtki u ovom JLS-u nema upisanu
            djelatnost, pa nisu u izračunu.
          </li>
        </ul>
        {osm !== undefined && (
          <div className="osm">
            <div className="osm-broj">{osm}</div>
            <div>
              <strong>broj lokala ove vrste na karti OpenStreetMap u {uOvom} {jls.naziv}</strong>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Karta bilježi stvarne lokale na terenu, uključujući obrte i poslovnice lanaca, ali je nepotpuna (ucrtavaju je
                volonteri), osobito u manjim mjestima. Broj je zato donja granica, a ne točan popis. Usporedite ga sa
                svojim poznavanjem mjesta.{" "}
                <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(jls.naziv + ", Hrvatska")}`} target="_blank" rel="noreferrer">
                  Otvori kartu
                </a>
              </p>
            </div>
          </div>
        )}
      </div>

      {razred && opisRazreda.length > 0 && (
        <div className="card">
          <h2>Što obuhvaća razred {razred.razred}</h2>
          <p className="small muted">Iz službenog opisa NKD 2025. (DZS). Provjerite odgovara li vašoj ideji.</p>
          <ul className="opis-razreda">
            {opisRazreda.map(([, t], i) => (
              <li key={i}>{t.charAt(0).toUpperCase() + t.slice(1)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <details className="kako">
          <summary>Kako smo izračunali?</summary>
          <p>
            Za svaku djelatnost (odjeljak NKD 2025.) model je naučio koliko tvrtki obično ima grad ili općina s obzirom na broj
            stanovnika i četiri obilježja. Model je negativna binomna regresija naučena na svih {d.meta.obuhvat.jls} gradova i općina.
            Zatim stvarni broj uspoređujemo s očekivanom razdiobom:
          </p>
          {uze && (
            <p>
              Za uži razred očekivanje je očekivanje cijelog odjeljka pomnoženo s udjelom razreda u odjeljku u Hrvatskoj
              ({postotak(uze.razred.udio ?? 0)}). Provjera na svim gradovima i općinama: stvarni broj je u 80 % rasponu u 79,8 % slučajeva.
            </p>
          )}
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
