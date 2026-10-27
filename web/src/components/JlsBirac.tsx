import { useId, useMemo, useState } from "react";
import type { Jls } from "../lib/data";
import { fmt, jlsVrsta, normaliziraj } from "../lib/format";

// Pristupačan combobox (ARIA 1.2): tipkanje filtrira, strelice biraju, Enter potvrđuje.
export function JlsBirac({
  jls,
  odabrani,
  onOdaberi,
  id,
}: {
  jls: Jls[];
  odabrani: Jls | null;
  onOdaberi: (j: Jls) => void;
  id?: string;
}) {
  const [upit, setUpit] = useState(odabrani ? odabrani.naziv : "");
  const [otvoren, setOtvoren] = useState(false);
  const [aktivni, setAktivni] = useState(0);
  const listId = useId();

  const rezultati = useMemo(() => {
    const q = normaliziraj(upit.trim());
    if (!q || (odabrani && upit === odabrani.naziv)) return jls.slice().sort((a, b) => b.stanovnika - a.stanovnika).slice(0, 8);
    return jls
      .filter((j) => normaliziraj(j.naziv).includes(q))
      .sort((a, b) => {
        // Nazivi koji počinju upitom prvi, zatim veći JLS-ovi.
        const pa = normaliziraj(a.naziv).startsWith(q) ? 0 : 1;
        const pb = normaliziraj(b.naziv).startsWith(q) ? 0 : 1;
        return pa - pb || b.stanovnika - a.stanovnika;
      })
      .slice(0, 12);
  }, [upit, jls, odabrani]);

  const odaberi = (j: Jls) => {
    onOdaberi(j);
    setUpit(j.naziv);
    setOtvoren(false);
  };

  return (
    <div className="combo">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={otvoren}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={otvoren && rezultati[aktivni] ? `${listId}-${rezultati[aktivni].sifra}` : undefined}
        placeholder="npr. Beli Manastir"
        value={upit}
        autoComplete="off"
        onChange={(e) => {
          setUpit(e.target.value);
          setOtvoren(true);
          setAktivni(0);
        }}
        onFocus={(e) => {
          setOtvoren(true);
          e.target.select();
        }}
        onBlur={() => setTimeout(() => setOtvoren(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOtvoren(true);
            setAktivni((a) => Math.min(a + 1, rezultati.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAktivni((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && otvoren && rezultati[aktivni]) {
            e.preventDefault();
            odaberi(rezultati[aktivni]);
          } else if (e.key === "Escape") {
            setOtvoren(false);
          }
        }}
      />
      {otvoren && rezultati.length > 0 && (
        <ul id={listId} role="listbox">
          {rezultati.map((j, i) => (
            <li
              key={j.sifra}
              id={`${listId}-${j.sifra}`}
              role="option"
              aria-selected={i === aktivni}
              onMouseDown={(e) => {
                e.preventDefault();
                odaberi(j);
              }}
              onMouseEnter={() => setAktivni(i)}
            >
              <span>
                {j.naziv} <span className="muted">· {jlsVrsta(j.grad)}</span>
              </span>
              <span className="muted">
                {j.zupanija} · {fmt(j.stanovnika)} st.
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
