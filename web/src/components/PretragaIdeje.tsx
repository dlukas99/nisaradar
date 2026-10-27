import { useMemo, useState } from "react";
import type { Odjeljak, Razred } from "../lib/data";
import { napraviPretrazivac } from "../lib/pretraga";

export function PretragaIdeje({
  razredi,
  odjeljci,
  odabrani,
  onOdaberi,
}: {
  razredi: Razred[];
  odjeljci: Map<string, Odjeljak>;
  odabrani: Razred | null;
  onOdaberi: (r: Razred) => void;
}) {
  const [tekst, setTekst] = useState("");

  const trazi = useMemo(() => napraviPretrazivac(razredi, odjeljci), [razredi, odjeljci]);
  const prijedlozi = useMemo(() => trazi(tekst), [tekst, trazi]);

  const primjeri = ["frizerski salon", "kafić", "knjigovodstveni servis", "vodoinstalater", "izrada web stranica", "pekara"];

  return (
    <div>
      <label className="lbl" htmlFor="ideja">
        Opišite ideju u nekoliko riječi
      </label>
      <input
        id="ideja"
        type="search"
        placeholder="npr. frizerski salon za muškarce"
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        autoComplete="off"
      />
      <div className="primjeri" aria-label="Primjeri">
        {primjeri.map((p) => (
          <button key={p} type="button" className="chip" onClick={() => setTekst(p)}>
            {p}
          </button>
        ))}
      </div>
      {tekst.trim() && (
        <>
          <p className="hint" style={{ marginTop: 12 }} aria-live="polite">
            {prijedlozi.length
              ? "Odaberite djelatnost (NKD 2025) koja najbolje odgovara ideji:"
              : "Nema prijedloga. Pokušajte drugim riječima (npr. 'restoran', 'servis računala')."}
          </p>
          <ul className="prijedlozi">
            {prijedlozi.map((r) => (
              <li key={r.razred}>
                <button
                  type="button"
                  className="prijedlog"
                  aria-pressed={odabrani?.razred === r.razred}
                  onClick={() => onOdaberi(r)}
                >
                  <span className="kod">{r.razred}</span>
                  <span>{r.naziv}</span>
                  <span className="sub">
                    Odjeljak {r.odjeljak} – {odjeljci.get(r.odjeljak)?.naziv}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
