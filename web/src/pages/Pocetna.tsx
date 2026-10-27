import { useMemo, useState } from "react";
import { JlsBirac } from "../components/JlsBirac";
import { PretragaIdeje } from "../components/PretragaIdeje";
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
        <h1>Nedostaje li vaša djelatnost u vašem gradu ili općini?</h1>
        <p className="lead">
          NišaRadar uspoređuje stvarni broj tvrtki u djelatnosti s brojem koji je uobičajen za grad ili općinu
          te veličine, dobne strukture i razvijenosti. Dobit ćete jasan odgovor, raspon i gotov odlomak za
          poslovni plan.
        </p>
        <p className="small muted">
          Podaci Sudskog registra od {datum(d.meta.snapshot_vrijeme)} · {fmt(d.meta.obuhvat.subjekata_u_obuhvatu)} aktivnih
          tvrtki i zadruga · svih {d.meta.obuhvat.jls} gradova i općina
        </p>
      </section>

      <div className="card koraci">
        <div className="korak">
          <h2>Što želite pokrenuti?</h2>
          <PretragaIdeje
            razredi={d.razredi}
            odjeljci={odjeljci}
            odabrani={razred}
            onOdaberi={(r) => {
              setRazred(r);
              setOdjeljak(r.odjeljak);
            }}
          />
          <details style={{ marginTop: 12 }}>
            <summary className="small">Znam šifru djelatnosti – odaberi odjeljak NKD 2025 izravno</summary>
            <select
              aria-label="Odjeljak NKD 2025"
              style={{ marginTop: 8 }}
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

        <div className="korak" style={{ marginTop: 28 }}>
          <h2>Gdje?</h2>
          <label className="lbl" htmlFor="jls">
            Grad ili općina
          </label>
          <JlsBirac id="jls" jls={d.jls} odabrani={jls} onOdaberi={setJls} />
        </div>

        <div style={{ marginTop: 24, paddingLeft: 44 }}>
          <button className="btn-primary" disabled={!spremno} onClick={provjeri}>
            Provjeri djelatnost →
          </button>
          {!spremno && (
            <p className="hint">
              {!odabraniOdjeljak ? "Odaberite djelatnost" : "Odaberite grad ili općinu"} da biste nastavili.
            </p>
          )}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <a className="card" href="#/karta" style={{ textDecoration: "none", color: "inherit" }}>
          <h3>Za savjetnike: pregled županije →</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Karta i tablica svih gradova i općina u županiji za odabranu djelatnost, s izvozom u CSV.
          </p>
        </a>
        <a className="card" href="#/izvori" style={{ textDecoration: "none", color: "inherit" }}>
          <h3>Kako radi i odakle su podaci →</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Otvoreni podaci MPUDT-a, DZS-a, MRRFEU-a i DGU-a, model, provjera točnosti i ograničenja.
          </p>
        </a>
      </div>
    </>
  );
}
