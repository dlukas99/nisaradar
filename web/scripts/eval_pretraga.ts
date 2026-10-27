// D7 evaluacija: top-1 i top-3 točnost prijedloga NKD razreda na ručno označenim opisima ideja.
// Pokretanje (nakon pipeline/export.py): npx tsx scripts/eval_pretraga.ts
// Ishod: ispis u konzolu i docs/evaluacija_pretrage.md.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Odjeljak, Razred } from "../src/lib/data";
import { napraviPretrazivac } from "../src/lib/pretraga";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const razredi: Razred[] = JSON.parse(readFileSync(resolve(ROOT, "web/public/data/razredi.json"), "utf8"));
const odjeljci: Odjeljak[] = JSON.parse(readFileSync(resolve(ROOT, "web/public/data/odjeljci.json"), "utf8"));
const trazi = napraviPretrazivac(razredi, new Map(odjeljci.map((o) => [o.odjeljak, o])));

// Jednostavan CSV parser (polja bez navodnika i zareza unutar polja, kako je datoteka i napisana).
const linije = readFileSync(resolve(ROOT, "data/reference/nkd_test_opisi.csv"), "utf8").trim().split(/\r?\n/).slice(1);
const primjeri = linije.map((l) => {
  const [opis, razred, prihvatljivo = ""] = l.split(",");
  return { opis, tocni: new Set([razred, ...prihvatljivo.split("|").filter(Boolean)]), glavni: razred };
});

let top1 = 0, top3 = 0, odjTop1 = 0, prazno = 0;
const promasaji: string[] = [];
for (const p of primjeri) {
  const r = trazi(p.opis, 6).map((x) => x.razred);
  if (!r.length) prazno++;
  if (r[0] && p.tocni.has(r[0])) top1++;
  if (r.slice(0, 3).some((x) => p.tocni.has(x))) top3++;
  // Za semafor je bitan odjeljak (D1): je li prvi prijedlog barem u pravom odjeljku?
  if (r[0] && [...p.tocni].some((t) => t.slice(0, 2) === r[0].slice(0, 2))) odjTop1++;
  if (!r.slice(0, 3).some((x) => p.tocni.has(x))) promasaji.push(`| ${p.opis} | ${p.glavni} | ${r.slice(0, 3).join(", ") || "–"} |`);
}
const n = primjeri.length;
const pct = (x: number) => `${((x / n) * 100).toFixed(1).replace(".", ",")} %`;
const oznaka = process.argv[2] ?? "trenutno";
console.log(`n=${n} top-1 ${pct(top1)} top-3 ${pct(top3)} odjeljak top-1 ${pct(odjTop1)} bez prijedloga ${prazno}`);

writeFileSync(
  resolve(ROOT, "docs/evaluacija_pretrage.md"),
  `# Evaluacija prijedloga djelatnosti iz teksta (D7)

> Generira \`web/scripts/eval_pretraga.ts\` (oznaka izvođenja: ${oznaka}). Testni skup: \`data/reference/nkd_test_opisi.csv\`.

Testni skup ima ${n} ručno označenih opisa ideja, napisanih kako bi ih korisnik tipkao. Za svaki je zadan točan razred NKD 2025
i, gdje je to opravdano, prihvatljive alternative (npr. "pekara" je 10.71 ili 47.24).

| Mjera | Vrijednost |
|---|---|
| Top-1 točnost (prvi prijedlog je točan razred) | **${pct(top1)}** |
| Top-3 točnost (točan razred je među prva tri) | **${pct(top3)}** |
| Prvi prijedlog u točnom odjeljku (razina na kojoj radi model) | **${pct(odjTop1)}** |
| Opisa bez ijednog prijedloga | ${prazno} |

Korisnik uvijek sam bira među prijedlozima, a može odabrati i odjeljak izravno, pa je za UX ključna top-3 točnost.

## Poštena napomena o razvoju

Prvo mjerenje (v1, prije ikakve dorade, izvan uzorka) dalo je **top-1 87,5 %, top-3 89,4 %**. Promašaji su zatim
analizirani i napravljene su tri **opće** izmjene logike pretrage, bez dodavanja sinonima za testne primjere:

1. svaki sinonim se uspoređuje zasebno, bez kazne za duljinu polja (dugi službeni nazivi);
2. lagano skidanje hrvatskih nastavaka ("knjigovodstveni" ≈ "knjigovodstvo");
3. manja težina generičkih riječi ("servis", "ured", "radionica").

Rezultat iznad je nakon tih izmjena, pa je djelomično "u uzorku". Za nepristranu procjenu treba novi skup opisa
od stvarnih korisnika (test 5.11.).

## Promašaji (točan razred nije među prva tri)

| Opis | Točno | Prva tri prijedloga |
|---|---|---|
${promasaji.join("\n") || "| – | | |"}
`,
  "utf8",
);
