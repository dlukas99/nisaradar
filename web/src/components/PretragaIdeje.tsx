import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import type { Odjeljak, Razred } from "../lib/data";
import { normaliziraj } from "../lib/format";

// D7 v1: fuzzy pretraga nad službenim nazivima NKD 2025 razreda i ručnim sinonimima (data/reference/sinonimi.csv).

interface Stavka {
  razred: Razred;
  naziv: string;
  sinonimi: string;
  odjeljakNaziv: string;
}

// Riječi koje ne nose značenje djelatnosti ("želim otvoriti mali ..."); uklanjamo ih prije pretrage.
const STOP = new Set(
  "zelim htio htjela bih otvoriti otvorit pokrenuti pokrenem imati mali malu malo vlastiti vlastitu svoj svoju u na za i s sa od do kao jedan jednu obrt firmu tvrtku posao biznis djelatnost".split(
    " ",
  ),
);

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

  const fuse = useMemo(() => {
    const stavke: Stavka[] = razredi.map((r) => ({
      razred: r,
      naziv: normaliziraj(r.naziv),
      sinonimi: normaliziraj(r.sinonimi),
      odjeljakNaziv: normaliziraj(odjeljci.get(r.odjeljak)?.naziv ?? ""),
    }));
    return new Fuse(stavke, {
      keys: [
        { name: "sinonimi", weight: 0.5 },
        { name: "naziv", weight: 0.35 },
        { name: "odjeljakNaziv", weight: 0.15 },
      ],
      threshold: 0.38,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 3,
    });
  }, [razredi, odjeljci]);

  const prijedlozi = useMemo(() => {
    const rijeci = normaliziraj(tekst)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w));
    if (!rijeci.length) return [];
    // Svaka riječ se traži zasebno, a bodovi se zbrajaju: "pekara i slastičarna" nađe oba razreda.
    const bodovi = new Map<string, { r: Razred; s: number }>();
    for (const w of rijeci) {
      for (const h of fuse.search(w, { limit: 15 })) {
        const k = h.item.razred.razred;
        const s = 1 - (h.score ?? 1);
        const prije = bodovi.get(k);
        bodovi.set(k, { r: h.item.razred, s: (prije?.s ?? 0) + s });
      }
    }
    const poredano = [...bodovi.values()].sort((a, b) => b.s - a.s || b.r.broj_rh - a.r.broj_rh);
    // Slabe slučajne pogotke ("salon" ~ "služba") odbacujemo: zadržavamo samo one blizu najboljeg.
    const najbolji = poredano[0]?.s ?? 0;
    return poredano
      .filter((x) => x.s >= najbolji * 0.6)
      .slice(0, 6)
      .map((x) => x.r);
  }, [tekst, fuse]);

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
