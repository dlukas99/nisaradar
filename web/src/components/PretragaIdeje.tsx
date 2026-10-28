import { useEffect, useMemo, useRef, useState } from "react";
import { dohvati, type Odjeljak, type Razred } from "../lib/data";
import { napraviPretrazivac, type Opisi, type Prijedlog } from "../lib/pretraga";

// Ispod ove pokrivenosti (udio "težine" riječi opisa pronađen u najboljem razredu) alat nije prepoznao većinu riječi:
// upozoravamo i ne odabiremo sami. Na testnim skupovima pokrivenost NE razlikuje točne od netočnih prijedloga
// (docs/evaluacija_pretrage.md), pa prag služi samo za slučaj "većina riječi nepoznata", ne kao mjera točnosti.
const PRAG_SIGURNOSTI = 0.3;

export function PretragaIdeje({
  razredi,
  odjeljci,
  odabrani,
  onOdaberi,
}: {
  razredi: Razred[];
  odjeljci: Map<string, Odjeljak>;
  odabrani: Razred | null;
  onOdaberi: (r: Razred | null) => void;
}) {
  const [tekst, setTekst] = useState("");
  const [opisi, setOpisi] = useState<Opisi | undefined>();

  // Službeni opisi razreda (~130 kB sažeto) dohvaćaju se u pozadini; do tada pretraga radi nad nazivima i sinonimima.
  useEffect(() => {
    dohvati<Opisi>("nkd_opisi.json").then(setOpisi, () => setOpisi({}));
  }, []);

  const trazi = useMemo(() => napraviPretrazivac(razredi, odjeljci, opisi), [razredi, odjeljci, opisi]);
  const prijedlozi = useMemo(() => trazi(tekst), [tekst, trazi]);
  const siguran = (prijedlozi[0]?.pokrivenost ?? 0) >= PRAG_SIGURNOSTI;

  // Najbolji prijedlog odabiremo sami (korisnik ga može promijeniti klikom). Kad korisnik sam klikne, njegov izbor
  // vrijedi dok ne promijeni tekst.
  const rucno = useRef(false);
  useEffect(() => {
    rucno.current = false;
  }, [tekst]);
  useEffect(() => {
    if (rucno.current) return;
    onOdaberi(siguran ? prijedlozi[0].razred : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prijedlozi, siguran]);

  const primjeri = ["frizerski salon", "kafić", "knjigovodstveni servis", "projektiranje solarnih elektrana", "izrada web stranica", "pekara"];

  return (
    <div>
      <label className="lbl" htmlFor="ideja">
        Opišite ideju u nekoliko riječi
      </label>
      <div className="unos-ikona">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="ideja"
          type="search"
          placeholder="npr. građevinska firma za gradnju kuća"
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="primjeri" aria-label="Primjeri">
        <span className="muted">Primjeri:</span>
        {primjeri.map((p) => (
          <button key={p} type="button" className="chip" onClick={() => setTekst(p)}>
            {p}
          </button>
        ))}
      </div>
      {tekst.trim() && (
        <>
          <p className="hint" style={{ marginTop: 12 }} aria-live="polite">
            {!prijedlozi.length
              ? "Nema prijedloga. Pokušajte drugim riječima (npr. 'restoran', 'servis računala') ili odaberite odjeljak ispod."
              : siguran
                ? "Odabrali smo djelatnost (NKD 2025) koja najbolje odgovara opisu. Ako nije prava, kliknite drugu:"
                : "Nismo sigurni da prijedlozi pokrivaju cijelu ideju. Odaberite najbližu djelatnost ili opišite ideju drugim riječima:"}
          </p>
          <ul className="prijedlozi">
            {prijedlozi.map((p, i) => (
              <li key={p.razred.razred}>
                <button
                  type="button"
                  className="prijedlog"
                  aria-pressed={odabrani?.razred === p.razred.razred}
                  onClick={() => {
                    rucno.current = true;
                    onOdaberi(p.razred);
                  }}
                >
                  <span className="kod">{p.razred.razred}</span>
                  <span className="naziv">
                    {p.razred.naziv}
                    {i === 0 && siguran && <span className="oznaka-najbolji">najbolje odgovara</span>}
                  </span>
                  <span className="sub">
                    Odjeljak {p.razred.odjeljak} – {odjeljci.get(p.razred.odjeljak)?.naziv}
                  </span>
                  <Razlog p={p} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// "Zašto ovaj prijedlog": službeni tekst iz NKD publikacije koji se poklopio s opisom.
function Razlog({ p }: { p: Prijedlog }) {
  if (p.razlogIzvor === "naziv") return null;
  const tekst = p.razlog.length > 110 ? p.razlog.slice(0, 107).trimEnd() + "…" : p.razlog;
  return (
    <span className="sub razlog">
      {p.razlogIzvor === "sinonim" ? "Uobičajeni naziv: " : "Službeni opis NKD 2025 uključuje: "}„{tekst}”
    </span>
  );
}
