import { useMemo, useState } from "react";
import { JlsBirac } from "../components/JlsBirac";
import { PretragaIdeje } from "../components/PretragaIdeje";
import { Radar } from "../components/Radar";
import type { Jls, Osnovno, Razred } from "../lib/data";
import { datum, fmt } from "../lib/format";
import { idi } from "../lib/router";

export function Pocetna({ d }: { d: Osnovno }) {
  const odjeljci = useMemo(() => new Map(d.odjeljci.map((o) => [o.odjeljak, o])), [d.odjeljci]);
  const [razred, setRazred] = useState<Razred | null>(null);
  const [odjeljak, setOdjeljak] = useState<string>("");
  const [jls, setJls] = useState<Jls | null>(null);

  const odabraniOdjeljak = razred?.odjeljak ?? odjeljak;
  const spremno = Boolean(odabraniOdjeljak && jls);

  const provjeri = () => {
    if (!spremno || !jls) return;
    idi(`/rezultat/${jls.sifra}/${odabraniOdjeljak}${razred ? `?razred=${razred.razred}` : ""}`);
  };

  return (
    <>
      <section className="hero">
        <div className="hero-in">
          <div className="ulaz">
            <span className="eyebrow">
              <span className="tocka" /> Podaci Sudskog registra od {datum(d.meta.snapshot_vrijeme)}
            </span>
            <h1 style={{ marginTop: 14 }}>
              Nedostaje li vaša djelatnost <span className="naglasak">u vašem mjestu?</span>
            </h1>
            <p className="lead">
              NišaRadar uspoređuje stvarni broj tvrtki u djelatnosti s brojem koji je uobičajen za grad ili općinu te veličine,
              dobne strukture i razvijenosti. Dobit ćete jasan odgovor, raspon i gotov odlomak za poslovni plan.
            </p>
            <div className="statistika">
              <div>
                <span className="v">{fmt(d.meta.obuhvat.subjekata_u_obuhvatu)}</span>
                <span className="k">aktivnih tvrtki i zadruga</span>
              </div>
              <div>
                <span className="v">{d.meta.obuhvat.jls}</span>
                <span className="k">gradova i općina</span>
              </div>
              <div>
                <span className="v">{d.meta.izvori.length}</span>
                <span className="k">otvorenih izvora podataka</span>
              </div>
              <div>
                <span className="v">noćno</span>
                <span className="k">osvježavanje iz API-ja</span>
              </div>
            </div>
          </div>
          <Radar />
        </div>
      </section>

      <div className="card koraci-kartica koraci ulaz ulaz-2">
        <div className="korak">
          <h2>Što želite pokrenuti?</h2>
          <PretragaIdeje
            razredi={d.razredi}
            odjeljci={odjeljci}
            odabrani={razred}
            onOdaberi={(r) => {
              setRazred(r);
              setOdjeljak(r?.odjeljak ?? "");
            }}
          />
          <details className="izravno" style={{ marginTop: 14 }}>
            <summary>Znam šifru djelatnosti – odaberi odjeljak NKD 2025 izravno</summary>
            <select
              aria-label="Odjeljak NKD 2025"
              style={{ marginTop: 10 }}
              value={razred ? "" : odjeljak}
              onChange={(e) => {
                setRazred(null);
                setOdjeljak(e.target.value);
              }}
            >
              <option value="">— odaberite odjeljak —</option>
              {d.odjeljci.map((o) => (
                <option key={o.odjeljak} value={o.odjeljak}>
                  {o.odjeljak} – {o.naziv}
                </option>
              ))}
            </select>
          </details>
        </div>

        <div className="korak">
          <h2>Gdje?</h2>
          <label className="lbl" htmlFor="jls">
            Grad ili općina
          </label>
          <JlsBirac id="jls" jls={d.jls} odabrani={jls} onOdaberi={setJls} />
        </div>

        <div className="korak-dno">
          <button className="btn-primary" disabled={!spremno} onClick={provjeri}>
            Provjeri djelatnost <span className="strelica" aria-hidden="true">→</span>
          </button>
          {!spremno && (
            <p className="hint">{!odabraniOdjeljak ? "Opišite ideju ili odaberite djelatnost" : "Odaberite grad ili općinu"} da biste nastavili.</p>
          )}
        </div>
      </div>

      <section className="sekcija">
        <span className="eyebrow">Kako radi</span>
        <h2>Tri koraka od ideje do argumenta za poslovni plan</h2>
        <div className="kako-radi">
          <div className="card">
            <span className="br">01</span>
            <h3>Opišete ideju svojim riječima</h3>
            <p>Alat pretražuje službene opise djelatnosti Državnog zavoda za statistiku i sam predlaže šifru NKD 2025.</p>
          </div>
          <div className="card">
            <span className="br">02</span>
            <h3>Model usporedi mjesto s usporedivima</h3>
            <p>
              Statistički model naučen na svih {d.meta.obuhvat.jls} gradova i općina kaže koliko je tvrtki uobičajeno za mjesto
              vaše veličine, dobne strukture i razvijenosti.
            </p>
          </div>
          <div className="card">
            <span className="br">03</span>
            <h3>Dobijete odgovor i gotov tekst</h3>
            <p>Semafor s rasponom, lokale s karte i tržišni odlomak s izvorima, spreman za zahtjev za potporu ili poslovni plan.</p>
          </div>
        </div>
      </section>

      <section className="sekcija grid2">
        <a className="card ploca-link" href="#/karta">
          <span className="eyebrow">Za savjetnike</span>
          <h3>
            Pregled cijele županije <span className="strelica" aria-hidden="true">→</span>
          </h3>
          <p className="muted small" style={{ margin: 0 }}>
            Karta i tablica svih gradova i općina u županiji za odabranu djelatnost, s izvozom u CSV.
          </p>
        </a>
        <a className="card ploca-link" href="#/izvori">
          <span className="eyebrow">Transparentnost</span>
          <h3>
            Izvori, metoda i točnost <span className="strelica" aria-hidden="true">→</span>
          </h3>
          <p className="muted small" style={{ margin: 0 }}>
            Odakle su podaci, kako radi model, koliko je točan i što ne vidi.
          </p>
        </a>
      </section>

      <section className="sekcija">
        <span className="eyebrow">Otvoreni podaci</span>
        <div className="izvori-traka">
          <span>Sudski registar · MPUDT</span>
          <span>Popis stanovništva 2021. · DZS</span>
          <span>NKD 2025. · DZS</span>
          <span>Indeks razvijenosti · MRRFEU</span>
          <span>Granice JLS-a · DGU</span>
          <span>OpenStreetMap · ODbL</span>
          <span>Portal otvorenih podataka · CKAN API</span>
        </div>
      </section>
    </>
  );
}
