import { useEffect, useState } from "react";
import type { Osnovno } from "../lib/data";
import { datum, datumVrijeme, fmt, postotak } from "../lib/format";

// Datum zadnje izmjene skupa dohvaćamo uživo iz CKAN API-ja data.gov.hr. CKAN ne šalje CORS zaglavlja, pa običan
// fetch iz preglednika ne prolazi; CKAN zato podržava JSONP (parametar `callback`). Ako ni to ne uspije,
// prikazujemo vrijednost koju je dohvatio noćni pipeline.
type Uzivo = Record<string, { datum: string | null; uzivo: boolean }>;

let jsonpBrojac = 0;
function ckanJsonp(id: string, timeoutMs = 6000): Promise<{ result: { metadata_modified: string } }> {
  return new Promise((resolve, reject) => {
    const ime = `__ckan${++jsonpBrojac}`;
    const s = document.createElement("script");
    const w = window as unknown as Record<string, unknown>;
    const pocisti = () => {
      delete w[ime];
      s.remove();
      clearTimeout(t);
    };
    const t = setTimeout(() => {
      pocisti();
      reject(new Error("timeout"));
    }, timeoutMs);
    w[ime] = (data: { result: { metadata_modified: string } }) => {
      pocisti();
      resolve(data);
    };
    s.onerror = () => {
      pocisti();
      reject(new Error("mreža"));
    };
    s.src = `https://data.gov.hr/ckan/api/3/action/package_show?id=${encodeURIComponent(id)}&callback=${ime}`;
    document.head.appendChild(s);
  });
}

export function Izvori({ d }: { d: Osnovno }) {
  const m = d.meta;
  const [uzivo, setUzivo] = useState<Uzivo>({});

  useEffect(() => {
    m.izvori.forEach((iz) => {
      if (!iz.ckan) return;
      ckanJsonp(iz.ckan)
        .then((j) => setUzivo((u) => ({ ...u, [iz.ckan!]: { datum: j.result.metadata_modified, uzivo: true } })))
        .catch(() => setUzivo((u) => ({ ...u, [iz.ckan!]: { datum: iz.ckan_azurirano ?? null, uzivo: false } })));
    });
  }, [m.izvori]);

  const e = m.evaluacija;
  const o = m.obuhvat;
  const s = m.osjetljivost;

  return (
    <>
      <h1>Izvori i ažurnost</h1>
      <p className="muted">
        Svi podaci su otvoreni podaci tijela javne vlasti, a podaci Sudskog registra dohvaćaju se izravno iz API-ja svake noći.
      </p>

      <div className="grid3">
        <div className="card">
          <div className="muted small">Sudski registar, snapshot</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>{m.snapshot_id}</div>
          <div className="small">stanje {datumVrijeme(m.snapshot_vrijeme)}</div>
        </div>
        <div className="card">
          <div className="muted small">Zadnje osvježavanje izračuna</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>{datum(m.generirano)}</div>
          <div className="small">noćni GitHub Actions</div>
        </div>
        <div className="card">
          <div className="muted small">Tvrtki i zadruga u analizi</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>{fmt(o.subjekata_s_odjeljkom)}</div>
          <div className="small">od {fmt(o.subjekata_u_obuhvatu)} aktivnih u obuhvatu</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Skupovi podataka</h2>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Skup</th><th>Izdavač</th><th>Što koristimo</th><th>Licenca</th><th>Ažurirano (data.gov.hr)</th></tr>
            </thead>
            <tbody>
              {m.izvori.map((iz) => {
                const u = iz.ckan ? uzivo[iz.ckan] : undefined;
                return (
                  <tr key={iz.naziv}>
                    <td><a href={iz.url} target="_blank" rel="noreferrer">{iz.naziv}</a>
                      {iz.ckan && <> · <a className="small" href={`https://data.gov.hr/ckan/dataset/${iz.ckan}`} target="_blank" rel="noreferrer">Portal</a></>}
                    </td>
                    <td>{iz.izdavac}</td>
                    <td className="small">{iz.koristimo}</td>
                    <td className="small">{iz.licenca}</td>
                    <td className="small">
                      {!iz.ckan ? "nije na Portalu" : !u ? "provjeravam…" : (
                        <>{datum(u.datum)} <span className="muted">({u.uzivo ? "uživo" : `provjereno ${datum(m.izvori_provjereno)}`})</span></>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" id="metoda">
        <h2>Metoda</h2>
        <ol>
          <li><strong>Obuhvat.</strong> Aktivni d.o.o., j.d.o.o., d.d., j.t.d., k.d. i zadruge sa sjedištem u RH, bez subjekata u stečaju ili likvidaciji. Lokacija je JLS sjedišta.</li>
          <li><strong>Djelatnost.</strong> NKD 2025., razina odjeljka. Prvi izvor je pretežita djelatnost. Ako je nema, koristi se glavna djelatnost iz Sudskog registra (NKD 2007.), prevedena na NKD 2025. službenom DZS tablicom veza.</li>
          <li><strong>Model.</strong> Za svaki odjeljak posebno: negativna binomna regresija broja tvrtki s brojem stanovnika kao izloženošću. Značajke su udio stanovnika 65+ i 0–14, indeks razvijenosti, grad ili općina i stopa tvrtki u ostatku županije.</li>
          <li><strong>Semafor.</strong> „Nedostaje” ako je P(Y ≤ stvarno) &lt; 10 %, „zasićeno” ako je P(Y ≥ stvarno) &lt; 10 %, inače „u ravnoteži”. Uz boju uvijek prikazujemo brojke i raspon.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Koliko je točno?</h2>
        <p>Model smo provjerili tako da je svaki put predviđao gradove i općine jedne županije koju nije vidio (21 provjera).</p>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Mjera</th><th className="r">Jednostavno pravilo¹</th><th className="r">NišaRadar model</th></tr></thead>
            <tbody>
              <tr><td>Poissonova devijanca (niže je bolje)</td><td className="r">{e.devijanca_baseline.toFixed(2).replace(".", ",")}</td><td className="r"><strong>{e.devijanca_glm.toFixed(2).replace(".", ",")}</strong></td></tr>
              <tr><td>Prosječna pogreška (tvrtki po JLS-u i djelatnosti)</td><td className="r">{e.mae_baseline.toFixed(2).replace(".", ",")}</td><td className="r"><strong>{e.mae_glm.toFixed(2).replace(".", ",")}</strong></td></tr>
              <tr><td>Pokrivenost 80 % raspona (cilj 75–85 %)</td><td className="r">–</td><td className="r"><strong>{postotak(e.pokrivenost_80_pit)}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">
          ¹ Nacionalni prosjek tvrtki po stanovniku × broj stanovnika. Model je bolji u {e.odjeljaka_glm_bolji_od_baselinea} od {e.odjeljaka} odjeljaka.
          Izazivač (gradient boosting) nije bio bolji, pa ostaje interpretabilan model.
        </p>
      </div>

      <div className="card">
        <h2>Ograničenja (iskreno)</h2>
        <ul>
          <li><strong>Obrti nisu uključeni.</strong> Nisu u Sudskom registru, a otvoreni podaci o obrtima po djelatnosti i JLS-u ne postoje. Odjeljci u kojima prevladavaju obrti ({m.odjeljci_obrti.join(", ")}) imaju oznaku „niža pouzdanost”.</li>
          <li><strong>Šifra djelatnosti.</strong> {postotak(1 - o.subjekata_s_odjeljkom / o.subjekata_u_obuhvatu)} tvrtki nema nijednu šifru djelatnosti, pa nisu u izračunu. JLS-ovi s neuobičajeno velikim udjelom takvih tvrtki (iznad {postotak(o.prag_bez_sifre)}) imaju oznaku „niža pouzdanost”.</li>
          <li><strong>Dva izvora djelatnosti.</strong> Pretežita i glavna djelatnost slažu se u {postotak(s.slaganje_izvora)} tvrtki koje imaju obje. Zato svaki nalaz provjeravamo i modelom samo na pretežitoj djelatnosti. Semafor je isti u {postotak(s.isti_status)} slučajeva, a rezultat pokazuje je li nalaz potvrđen.</li>
          <li><strong>Što model mjeri.</strong> Model pokazuje gdje je broj tvrtki neobičan za ovakav grad ili općinu, a ne izravnu potražnju. Mala očekivanja (npr. 0–2 tvrtke) gotovo nikad ne daju „nedostaje”, jer ni nula nije neobična.</li>
        </ul>
      </div>

      <div className="card">
        <h2>Otvoreni kod i alati</h2>
        <p>
          Kod je javno dostupan na <a href="https://github.com/dlukas99/nisaradar">github.com/dlukas99/nisaradar</a> pod licencom EUPL-1.2.
          Rezultati su dostupni i kao strojno čitljivi JSON (<a href={`${import.meta.env.BASE_URL}data/meta.json`}>meta.json</a>,
          shema u <code>docs/openapi.yaml</code>).
        </p>
        <p className="small muted">
          Izrađeno otvorenim alatima: Python (pandas, statsmodels, scikit-learn), React, MapLibre GL.
          Pri razvoju je korišten AI asistent za programiranje (Claude, Anthropic). Sam alat ne koristi zatvorene AI usluge.
        </p>
      </div>
    </>
  );
}
