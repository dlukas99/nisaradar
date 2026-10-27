import Fuse from "fuse.js";
import type { Odjeljak, Razred } from "./data";
import { normaliziraj } from "./format";

// D7 v1: fuzzy pretraga nad službenim nazivima NKD 2025 razreda i ručnim sinonimima (data/reference/sinonimi.csv).
// Odvojeno od React komponente da se ista logika može evaluirati skriptom (web/scripts/eval_pretraga.ts).

interface Stavka {
  razred: Razred;
  naziv: string;
  sinonimi: string[];
  odjeljakNaziv: string;
}

// Riječi koje ne nose značenje djelatnosti ("želim otvoriti mali ..."); uklanjamo ih prije pretrage.
const STOP = new Set(
  "zelim htio htjela bih otvoriti otvorit pokrenuti pokrenem imati mali malu malo vlastiti vlastitu svoj svoju u na za i s sa od do kao jedan jednu obrt firmu tvrtku posao biznis djelatnost".split(
    " ",
  ),
);

// Lagani "stemmer" za hrvatski: skida česte nastavke da se "knjigovodstveni", "knjigovodstvo" i "knjigovodstva"
// svedu na isti korijen. Nije lingvistički potpun, ali uklanja većinu promašaja zbog padeža i pridjeva.
const NASTAVCI = [
  "ovima", "evima", "skih", "ckih", "skog", "skom", "skoj", "nih", "nog", "nom", "noj",
  "ske", "ski", "ska", "sko", "cke", "cki", "cka", "cko", "ima", "ama", "ih", "og", "om", "oj", "im", "em",
  "ni", "na", "no", "ne", "a", "e", "i", "o", "u",
];
function korijen(w: string): string {
  for (const n of NASTAVCI) {
    if (w.endsWith(n) && w.length - n.length >= 4) return w.slice(0, -n.length);
  }
  return w;
}
const korijeni = (s: string) => normaliziraj(s).split(/[^a-z0-9]+/).filter(Boolean).map(korijen).join(" ");

// Generičke riječi o obliku posla ("servis", "ured", "radionica") malo govore o djelatnosti, a vuku prema razredima koji
// ih imaju u sinonimima ("knjigovodstveni servis" -> autoservis). Zato vrijede manje od riječi koje nose djelatnost.
const SLABE = new Set(["servis", "uslug", "radionic", "ured", "studi", "agencij", "obrt", "tvrtk", "centar", "male", "mal"]);
const TEZINA_SLABE = 0.35;

export type Pretrazivac = (tekst: string, koliko?: number) => Razred[];

export function napraviPretrazivac(razredi: Razred[], odjeljci: Map<string, Odjeljak>): Pretrazivac {
  const stavke: Stavka[] = razredi.map((r) => ({
    razred: r,
    naziv: korijeni(r.naziv),
    // Svaki sinonim zaseban element: Fuse ga uspoređuje zasebno, pa kratki sinonim ("kafić") nije "razvodnjen" ostalima.
    sinonimi: r.sinonimi ? r.sinonimi.split(",").map((x) => korijeni(x)) : [],
    odjeljakNaziv: korijeni(odjeljci.get(r.odjeljak)?.naziv ?? ""),
  }));
  const fuse = new Fuse(stavke, {
    keys: [
      { name: "sinonimi", weight: 0.5 },
      { name: "naziv", weight: 0.35 },
      { name: "odjeljakNaziv", weight: 0.15 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 3,
    // Bez kazne za duljinu polja: službeni nazivi su dugi ("Uvođenje instalacija vodovoda, kanalizacije i plina ...").
    ignoreFieldNorm: true,
  });

  return (tekst, koliko = 6) => {
    const rijeci = normaliziraj(tekst)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(korijen);
    if (!rijeci.length) return [];
    // Svaka riječ se traži zasebno, a bodovi se zbrajaju: "pekara i slastičarna" nađe oba razreda.
    const bodovi = new Map<string, { r: Razred; s: number }>();
    for (const w of rijeci) {
      for (const h of fuse.search(w, { limit: 15 })) {
        const k = h.item.razred.razred;
        const s = (1 - (h.score ?? 1)) * (SLABE.has(w) ? TEZINA_SLABE : 1);
        const prije = bodovi.get(k);
        bodovi.set(k, { r: h.item.razred, s: (prije?.s ?? 0) + s });
      }
    }
    const poredano = [...bodovi.values()].sort((a, b) => b.s - a.s || b.r.broj_rh - a.r.broj_rh);
    // Slabe slučajne pogotke ("salon" ~ "služba") odbacujemo: zadržavamo samo one blizu najboljeg.
    const najbolji = poredano[0]?.s ?? 0;
    return poredano
      .filter((x) => x.s >= najbolji * 0.6)
      .slice(0, koliko)
      .map((x) => x.r);
  };
}
