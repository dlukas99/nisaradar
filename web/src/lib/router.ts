import { useEffect, useState } from "react";

// Hash usmjeravanje (#/rezultat/132/96): radi na GitHub Pagesu bez postavki poslužitelja,
// a svaki rezultat ima vlastitu poveznicu koju savjetnik može poslati ili spremiti.
export interface Ruta {
  stranica: string;
  dijelovi: string[];
  upit: URLSearchParams;
}

function procitaj(): Ruta {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [put, upit = ""] = h.split("?");
  const dijelovi = put.split("/").filter(Boolean).map(decodeURIComponent);
  return { stranica: dijelovi[0] ?? "", dijelovi: dijelovi.slice(1), upit: new URLSearchParams(upit) };
}

export function useRuta(): Ruta {
  const [ruta, setRuta] = useState(procitaj);
  useEffect(() => {
    const f = () => {
      setRuta(procitaj());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return ruta;
}

export function idi(put: string) {
  window.location.hash = put.startsWith("#") ? put : `#${put}`;
}
