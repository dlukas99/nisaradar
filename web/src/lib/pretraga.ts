import type { Odjeljak, Razred } from "./data";
import { normaliziraj } from "./format";

// D7: prijedlog razreda NKD 2025 iz slobodnog opisa ideje.
//
// Pretražuje SLUŽBENE opise razreda iz DZS publikacije NKD 2025 (pipeline/nkd_opisi.py): naziv razreda i podrazreda,
// stavke "Ovaj podrazred uključuje" i upute iz tuđih "isključuje ..., vidi XX.XX" (npr. "ugradnju solarnih panela" -> 43.21),
// uz ručne sinonime (data/reference/sinonimi.csv) za razgovorne riječi ("kafić", "frizer").
//
// Zašto ne "fuzzy" po slovima (v1 s Fuse.js): sličnost slova nije sličnost značenja ("solarni" ~ "stolarija").
// Zato riječ upita mora postojati u opisu (uz isti korijen), a približno podudaranje (tipfeler) koristi se samo
// za riječi kojih uopće nema u rječniku opisa. Odvojeno od React komponente da je evaluira web/scripts/eval_pretraga.ts.

/** Službeni opisi po razredu: [izvor, tekst], izvor "p" = naziv podrazreda, "u" = uključuje, "r" = uputa iz "vidi". */
export type Opisi = Record<string, [string, string][]>;

export interface Prijedlog {
  razred: Razred;
  bodovi: number;
  /** Udio "težine" riječi upita pronađen u ovom razredu (0–1); mjera sigurnosti prijedloga. */
  pokrivenost: number;
  /** Službeni tekst koji se najbolje poklopio s upitom (za objašnjenje "zašto ovaj prijedlog"). */
  razlog: string;
  razlogIzvor: "naziv" | "sinonim" | "opis";
}

export type Pretrazivac = (tekst: string, koliko?: number) => Prijedlog[];

// Riječi koje ne nose značenje djelatnosti ("želim otvoriti mali ..."); uklanjamo ih prije pretrage.
const STOP = new Set(
  (
    "zelim zelio zeljela htio htjela htjeo bih bi biti budem postati otvoriti otvorit otvorim pokrenuti pokrenem pokrenut " +
    "imati mali mala malu malo vlastiti vlastitu vlastita svoj svoju svoja moj moju jedan jednu neki neku " +
    "u na za i s sa od do kao te ili po uz pri iz kod se sam smo ste "
  ).split(/\s+/).filter(Boolean),
);
// Riječi o obliku posla, ne o djelatnosti; uklanjamo ih (i u opisima i u upitu).
const OBLIK = new Set("obrt obrta firma firmu firme tvrtka tvrtku tvrtke posao posla biznis djelatnost djelatnosti poduzece".split(" "));

// Lagani "stemmer" za hrvatski: skida česte nastavke da se "knjigovodstveni", "knjigovodstvo" i "knjigovodstva"
// svedu na isti korijen. Nije lingvistički potpun, ali uklanja većinu promašaja zbog padeža i pridjeva.
const NASTAVCI = [
  "ovima", "evima", "ova", "ove", "ovi", "skih", "skog", "skom", "skoj", "nih", "nog", "nom", "noj",
  "ske", "ski", "ska", "sko", "ima", "ama", "ih", "og", "om", "oj", "im", "em",
  "ni", "na", "no", "ne", "a", "e", "i", "o", "u",
];
// Pridjevi na -čki nastaju od imenica na -ka (keramika -> keramički, tehnika -> tehnički): svodimo ih na isti korijen
// ("keramick" -> "keramik"), inače "keramiku" u upitu ne nalazi "keramičke pločice" u službenom opisu.
const NASTAVCI_CK = ["ckih", "ckog", "ckom", "ckoj", "cke", "cki", "cka", "cko"];
export function korijen(w: string): string {
  // Kratke imenice (koza/koze/kozu, riba, vino) smiju se skratiti na 3 slova; duže riječi zadržavaju barem 4.
  const min = w.length <= 5 ? 3 : 4;
  for (const n of NASTAVCI_CK) {
    if (w.endsWith(n) && w.length - n.length >= 4) return w.slice(0, -n.length) + "k";
  }
  for (const n of NASTAVCI) {
    if (w.endsWith(n) && w.length - n.length >= min) return w.slice(0, -n.length);
  }
  return w;
}

/** Tekst -> korijeni riječi bez stop-riječi i riječi o obliku posla. */
function tokeni(s: string): string[] {
  return normaliziraj(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !OBLIK.has(w))
    .map(korijen);
}

// Riječ upita koja označava VRSTU djelatnosti (projektirati, ugraditi, proizvoditi, prodavati, popravljati...).
// Takve riječi su česte pa im rijetkost daje malu težinu, a zapravo odlučuju između npr. 71.12 (projektiranje solarnih
// elektrana) i 43.21 (ugradnja solarnih panela). Zato razredi u odgovarajućim odjeljcima dobivaju poticaj.
// Odjeljci prema NKD 2025: 41–43 građevinarstvo, 10–33 prerađivačka industrija, 46–47 trgovina, 71 inženjerstvo...
const PRERADIVACKA = Array.from({ length: 24 }, (_, i) => String(10 + i));
const VRSTA: [RegExp, string[]][] = [
  [/^(projekt|projektira|projektant|nadzor|inzenjer|geodet)/, ["71"]],
  [/^(dizajn|dizajner)/, ["74", "71"]],
  [/^(ugradnj|ugrad|montaz|montir|postavlj|postav|polag|lijep|instalac|instalater|izvodjenj)/, ["43", "42", "33"]],
  [/^(bojanj|bojat|licenj|licit|soboslik|fasad|keramicar|parket)/, ["43"]],
  [/^(gradnj|gradev|gradit|zidar|asfalt)/, ["41", "42", "43"]],
  [/^(proizvodnj|proizvod|izrad|izradi)/, PRERADIVACKA],
  // "Prodaja" u razgovoru znači trgovinu na malo; na veliko se kaže "veleprodaja" ili "na veliko".
  [/^(prodaj|prodava|trgovin|ducan|shop|webshop)/, ["47"]],
  [/^(veleprodaj|velik|veletrgovin|distribuc|uvoz|izvoz)/, ["46"]],
  [/^(popravak|popravk|popravlj|servis|odrzavanj|odrzavat|serviser|restaurac)/, ["95", "33", "81"]],
  [/^(iznajmljivanj|najam|rent)/, ["77", "68", "55"]],
  [/^(prijevoz|prevoz|dostav|transport)/, ["49", "53", "50", "51"]],
  [/^(uzgoj|uzgaj|sadnj|sadit)/, ["01", "02", "03"]],
  [/^(ordinac|lijecnik|doktor|terapeut)/, ["86", "75"]],
  [/^(skol|tecaj|instrukc|poducavanj|edukac)/, ["85"]],
];
const TEZINA_VRSTE = 1.6;

// Razgovorne riječi koje u službenim opisima stoje drugačije ("prodaja" -> "trgovina", "montaža" -> "ugradnja").
const PROSIRENJA: Record<string, string[]> = {
  prodaj: ["trgovin"],
  prodaja: ["trgovin"],
  montaz: ["ugradnj", "postavljanj"],
  servis: ["popravak", "odrzavanj"],
  najam: ["iznajmljivanj"],
  aut: ["automobil", "motorn", "vozil"],
  auto: ["automobil", "motorn", "vozil"],
  bojanj: ["bojenj", "soboslikarsk"],
  licenj: ["bojenj", "soboslikarsk"],
  automobil: ["motorn", "vozil"],
  kompjuter: ["racunal"],
  mobitel: ["telefon", "komunikacijsk"],
  web: ["internet"],
};

// Generičke riječi o obliku posla ("servis", "ured", "radionica") malo govore o djelatnosti.
const SLABE = new Set(["servis", "uslug", "radionic", "ured", "studi", "agencij", "centar", "salon"]);
const TEZINA_SLABE = 0.35;

// Težine izvora: naziv i sinonimi su najpouzdaniji, stavke iz opisa malo manje, naziv odjeljka najmanje.
const TEZINE = { naziv: 1, sinonim: 1, p: 0.9, u: 0.75, r: 0.75, odjeljak: 0.3 } as const;

interface Fraza {
  t: Set<string>;
  w: number;
  tekst: string;
  izvor: Prijedlog["razlogIzvor"];
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let najmanje = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      najmanje = Math.min(najmanje, cur[j]);
    }
    if (najmanje > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export function napraviPretrazivac(razredi: Razred[], odjeljci: Map<string, Odjeljak>, opisi: Opisi = {}): Pretrazivac {
  // --- Indeks: za svaki razred popis fraza (skup korijena + težina izvora).
  const indeks = razredi.map((r) => {
    const fraze: Fraza[] = [{ t: new Set(tokeni(r.naziv)), w: TEZINE.naziv, tekst: r.naziv, izvor: "naziv" }];
    for (const s of r.sinonimi ? r.sinonimi.split(",") : []) {
      fraze.push({ t: new Set(tokeni(s)), w: TEZINE.sinonim, tekst: s.trim(), izvor: "sinonim" });
    }
    for (const [izvor, tekst] of opisi[r.razred] ?? []) {
      fraze.push({ t: new Set(tokeni(tekst)), w: TEZINE[izvor as "p" | "u" | "r"] ?? 0.7, tekst, izvor: "opis" });
    }
    const odj = odjeljci.get(r.odjeljak)?.naziv ?? "";
    fraze.push({ t: new Set(tokeni(odj)), w: TEZINE.odjeljak, tekst: odj, izvor: "opis" });
    return { r, fraze: fraze.filter((f) => f.t.size) };
  });

  // Rijetkost korijena (IDF) preko razreda: "solar" je rijedak i jako informativan, "proizvodnj" čest i slab.
  const df = new Map<string, number>();
  for (const { fraze } of indeks) {
    for (const k of new Set(fraze.flatMap((f) => [...f.t]))) df.set(k, (df.get(k) ?? 0) + 1);
  }
  const N = indeks.length;
  const idf = (k: string) => Math.log(1 + N / (df.get(k) ?? N));
  const rjecnik = [...df.keys()];
  const stopLista = [...STOP, ...OBLIK].filter((w) => w.length >= 4);

  /** Korijeni iz rječnika koji odgovaraju riječi upita, s kvalitetom podudaranja (1 = isti korijen). */
  function podudaranja(q: string): Map<string, number> {
    const m = new Map<string, number>();
    const dodaj = (k: string, v: number) => m.set(k, Math.max(m.get(k) ?? 0, v));
    for (const p of PROSIRENJA[q] ?? []) if (df.has(p)) dodaj(p, 0.9);
    if (df.has(q)) {
      dodaj(q, 1);
      return m; // riječ postoji u opisima: ne tražimo slične riječi (inače "solar" ~ "solarij", "stolar")
    }
    for (const k of rjecnik) {
      const [kraci, dulji] = k.length < q.length ? [k, q] : [q, k];
      if (kraci.length >= 4 && dulji.startsWith(kraci) && dulji.length - kraci.length <= 3) dodaj(k, 0.8);
    }
    if (m.size === 0 && q.length >= 5) {
      // Tipfeler: najviše 1 slovo razlike (2 za duge riječi), i to samo kad riječi nema u rječniku.
      const max = q.length >= 8 ? 2 : 1;
      for (const k of rjecnik) if (levenshtein(q, k, max) <= max) dodaj(k, 0.7);
    }
    return m;
  }

  return (tekst, koliko = 6) => {
    const sirove = normaliziraj(tekst).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    // Tipfeler u stop-riječi ("zelkim" umjesto "zelim") ne smije postati djelatnost.
    const rijeci = sirove
      .filter((w) => !STOP.has(w) && !OBLIK.has(w))
      .filter((w) => w.length < 5 || !stopLista.some((s) => levenshtein(w, s, 1) <= 1))
      .map(korijen);
    const upit = [...new Set(rijeci)].map((q) => ({
      q,
      p: podudaranja(q),
      w: SLABE.has(q) ? TEZINA_SLABE : 1,
    }));
    // Težina riječi = rijetkost njezina najboljeg podudaranja; riječ bez podudaranja ulazi u nazivnik pokrivenosti
    // s prosječnom težinom (nepoznata riječ znači da prijedlog vjerojatno ne pokriva cijelu ideju).
    for (const u of upit) {
      const najbolje = [...u.p.entries()].sort((a, b) => b[1] - a[1])[0];
      (u as { tezina?: number }).tezina = najbolje ? idf(najbolje[0]) * u.w : 0;
    }
    const poznate = upit.filter((u) => u.p.size);
    if (!poznate.length) return [];
    const prosjek = poznate.reduce((s, u) => s + (u as { tezina?: number }).tezina!, 0) / poznate.length;
    const ukupno = upit.reduce((s, u) => s + ((u as { tezina?: number }).tezina || prosjek), 0);

    const vrste = new Set(rijeci.flatMap((q) => VRSTA.filter(([re]) => re.test(q)).flatMap(([, o]) => o)));

    const rezultati: Prijedlog[] = [];
    for (const { r, fraze } of indeks) {
      // Za svaku riječ upita: najbolje podudaranje u bilo kojoj frazi razreda.
      const poRijeci = new Array(upit.length).fill(0);
      let najFraza = 0, razlog: Fraza | null = null, pogodjeno = 0;
      for (const f of fraze) {
        let zbrojFraze = 0;
        upit.forEach((u, i) => {
          let best = 0;
          for (const [k, kv] of u.p) if (f.t.has(k)) best = Math.max(best, kv * idf(k) * u.w);
          if (best) {
            zbrojFraze += best * f.w;
            poRijeci[i] = Math.max(poRijeci[i], best * f.w);
          }
        });
        if (zbrojFraze > najFraza) {
          najFraza = zbrojFraze;
          razlog = f;
        }
      }
      const zbroj = poRijeci.reduce((s, x) => s + x, 0);
      if (!zbroj || !razlog) continue;
      upit.forEach((u, i) => {
        if (poRijeci[i]) pogodjeno += (u as { tezina?: number }).tezina!;
      });
      // Pola bodova za pokrivenost svih riječi, pola za najbolju pojedinačnu frazu (nagrađuje riječi koje se
      // pojavljuju ZAJEDNO, npr. "ugradnju solarnih panela", ispred razreda koji ih imaju razbacane).
      let bodovi = 0.5 * zbroj + 0.5 * najFraza;
      if (vrste.size && vrste.has(r.odjeljak)) bodovi *= TEZINA_VRSTE;
      rezultati.push({
        razred: r,
        bodovi,
        pokrivenost: Math.min(1, pogodjeno / ukupno),
        razlog: razlog.tekst,
        razlogIzvor: razlog.izvor,
      });
    }
    rezultati.sort((a, b) => b.bodovi - a.bodovi || b.razred.broj_rh - a.razred.broj_rh);
    // Slabe slučajne pogotke odbacujemo: zadržavamo samo one blizu najboljeg.
    const najbolji = rezultati[0]?.bodovi ?? 0;
    return rezultati.filter((x) => x.bodovi >= najbolji * 0.45).slice(0, koliko);
  };
}
