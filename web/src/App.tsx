import { Suspense, lazy, useEffect, useState } from "react";
import type { Osnovno } from "./lib/data";
import { ucitajOsnovno } from "./lib/data";
import { datum } from "./lib/format";
import { useRuta } from "./lib/router";
import { Izvori } from "./pages/Izvori";
import { Pocetna } from "./pages/Pocetna";
import { Rezultat } from "./pages/Rezultat";

// Pregled vuče MapLibre (~800 kB), pa se učitava tek kad korisnik otvori kartu.
const Pregled = lazy(() => import("./pages/Pregled").then((m) => ({ default: m.Pregled })));

const PILOT_ZUPANIJA = 14; // Osječko-baranjska
const ZADANI_ODJELJAK = "96";

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.5" />
      <path d="M16 16 L26 8" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="21.5" cy="19.5" r="3" fill="var(--st-nedostaje)" />
    </svg>
  );
}

export function App() {
  const ruta = useRuta();
  const [d, setD] = useState<Osnovno | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  useEffect(() => {
    ucitajOsnovno().then(setD).catch((e) => setGreska(String(e)));
  }, []);

  useEffect(() => {
    const naslovi: Record<string, string> = { rezultat: "Rezultat", karta: "Pregled po županiji", izvori: "Izvori i ažurnost" };
    document.title = naslovi[ruta.stranica] ? `${naslovi[ruta.stranica]} · NišaRadar` : "NišaRadar – nedostaje li djelatnost u vašem gradu?";
  }, [ruta.stranica]);

  const nav = (href: string, tekst: string, stranica: string) => (
    <a href={href} aria-current={ruta.stranica === stranica ? "page" : undefined}>
      {tekst}
    </a>
  );

  let sadrzaj: JSX.Element;
  if (greska) sadrzaj = <p className="greska">Podaci se nisu mogli učitati: {greska}</p>;
  else if (!d) sadrzaj = <p className="ucitavanje">Učitavam podatke…</p>;
  else if (ruta.stranica === "rezultat" && ruta.dijelovi.length >= 2)
    sadrzaj = <Rezultat d={d} sifra={Number(ruta.dijelovi[0])} odj={ruta.dijelovi[1]} razredKod={ruta.upit.get("razred")} />;
  else if (ruta.stranica === "karta")
    sadrzaj = (
      <Pregled
        d={d}
        zup={ruta.dijelovi[0] !== undefined ? Number(ruta.dijelovi[0]) : PILOT_ZUPANIJA}
        odj={ruta.dijelovi[1] ?? ZADANI_ODJELJAK}
        istaknuti={ruta.upit.get("jls") ? Number(ruta.upit.get("jls")) : undefined}
      />
    );
  else if (ruta.stranica === "izvori") sadrzaj = <Izvori d={d} />;
  else sadrzaj = <Pocetna d={d} />;

  return (
    <>
      <a className="skip" href="#sadrzaj" onClick={(e) => { e.preventDefault(); document.getElementById("sadrzaj")?.focus(); }}>
        Preskoči na sadržaj
      </a>
      <header className="top">
        <div className="top-in">
          <a className="logo" href="#/">
            <Logo /> NišaRadar
          </a>
          <nav className="glavna" aria-label="Glavna navigacija">
            {nav("#/", "Provjera ideje", "")}
            {nav("#/karta", "Pregled županije", "karta")}
            {nav("#/izvori", "Izvori i metoda", "izvori")}
          </nav>
        </div>
      </header>
      <main id="sadrzaj" tabIndex={-1}>
        <Suspense fallback={<p className="ucitavanje">Učitavam kartu…</p>}>{sadrzaj}</Suspense>
      </main>
      <footer className="dno">
        <div className="in">
          <span>
            NišaRadar · Datathon Portala otvorenih podataka 2026. · kod pod licencom EUPL-1.2 ·{" "}
            <a href="https://github.com/dlukas99/nisaradar">GitHub</a>
          </span>
          {d && (
            <span>
              Podaci: Sudski registar (MPUDT) od {datum(d.meta.snapshot_vrijeme)}, DZS, MRRFEU, DGU · <a href="#/izvori">izvori</a>
            </span>
          )}
        </div>
      </footer>
    </>
  );
}
