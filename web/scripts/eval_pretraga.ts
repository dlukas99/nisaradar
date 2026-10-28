// D7 evaluacija: top-1 i top-3 točnost prijedloga NKD razreda na ručno označenim opisima ideja.
// Pokretanje (nakon pipeline/export.py): npm run eval:pretraga
// Ishod: ispis u konzolu i docs/evaluacija_pretrage.md.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Odjeljak, Razred } from "../src/lib/data";
import { napraviPretrazivac, type Opisi, type Pretrazivac } from "../src/lib/pretraga";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const json = <T>(p: string): T => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const razredi = json<Razred[]>("web/public/data/razredi.json");
const odjeljci = new Map(json<Odjeljak[]>("web/public/data/odjeljci.json").map((o) => [o.odjeljak, o]));
const opisi = json<Opisi>("web/public/data/nkd_opisi.json");

// Usporedba: samo nazivi i sinonimi (bez službenih opisa) prema punoj pretrazi.
const bezOpisa = napraviPretrazivac(razredi, odjeljci, {});
const puna = napraviPretrazivac(razredi, odjeljci, opisi);

// Jednostavan CSV parser (polja bez navodnika i zareza unutar polja, kako su datoteke i napisane).
function ucitaj(datoteka: string) {
  return readFileSync(resolve(ROOT, "data/reference", datoteka), "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => {
      const [opis, razred, prihvatljivo = ""] = l.split(",");
      return { opis, glavni: razred, tocni: new Set([razred, ...prihvatljivo.split("|").filter(Boolean)]) };
    });
}

function mjeri(trazi: Pretrazivac, primjeri: ReturnType<typeof ucitaj>) {
  let top1 = 0, top3 = 0, odjTop1 = 0, prazno = 0;
  const promasaji: string[] = [];
  for (const p of primjeri) {
    const r = trazi(p.opis, 6).map((x) => x.razred.razred);
    if (!r.length) prazno++;
    if (r[0] && p.tocni.has(r[0])) top1++;
    if (r.slice(0, 3).some((x) => p.tocni.has(x))) top3++;
    // Za semafor je bitan odjeljak (D1): je li prvi prijedlog barem u pravom odjeljku?
    if (r[0] && [...p.tocni].some((t) => t.slice(0, 2) === r[0].slice(0, 2))) odjTop1++;
    if (!r.slice(0, 3).some((x) => p.tocni.has(x))) promasaji.push(`| ${p.opis} | ${p.glavni} | ${r.slice(0, 3).join(", ") || "–"} |`);
  }
  const n = primjeri.length;
  const pct = (x: number) => `${((x / n) * 100).toFixed(1).replace(".", ",")} %`;
  return { n, top1: pct(top1), top3: pct(top3), odj: pct(odjTop1), prazno, promasaji };
}

const stari = ucitaj("nkd_test_opisi.csv");
const novi = ucitaj("nkd_test_opisi_novi.csv");
const r = {
  stariBez: mjeri(bezOpisa, stari), stariPuna: mjeri(puna, stari),
  noviBez: mjeri(bezOpisa, novi), noviPuna: mjeri(puna, novi),
};
for (const [k, v] of Object.entries(r)) console.log(k, `n=${v.n} top-1 ${v.top1} top-3 ${v.top3} odjeljak ${v.odj} prazno ${v.prazno}`);

const red = (naziv: string, x: ReturnType<typeof mjeri>) => `| ${naziv} | ${x.top1} | ${x.top3} | ${x.odj} | ${x.prazno} |`;

writeFileSync(
  resolve(ROOT, "docs/evaluacija_pretrage.md"),
  `# Evaluacija prijedloga djelatnosti iz teksta (D7)

> Generira \`web/scripts/eval_pretraga.ts\` (\`npm run eval:pretraga\`). Testni skupovi: \`data/reference/nkd_test_opisi.csv\`
> (${r.stariPuna.n} opisa) i \`data/reference/nkd_test_opisi_novi.csv\` (${r.noviPuna.n} opisa).

Svaki opis je napisan kako bi ga korisnik tipkao ("zelkim biti projektant za solarne panele", s tipfelerom). Za svaki je zadan
točan razred NKD 2025 i, gdje je to opravdano, prihvatljive alternative (npr. "pekara" je 10.71 ili 47.24).

## Kako pretraga radi

Pretraga čita **službene opise razreda iz DZS publikacije NKD 2025** (\`pipeline/nkd_opisi.py\`): nazive razreda i podrazreda,
stavke "Ovaj podrazred uključuje" i upute iz tuđih "isključuje ..., vidi XX.XX" (npr. "ugradnju solarnih panela, vidi 43.21.0").
Ukupno 6.193 službena opisa za 646 od 651 razreda, uz ručne sinonime za razgovorne riječi ("kafić", "frizer").

- Riječ upita mora postojati u opisu (isti korijen nakon skidanja nastavaka). Približno podudaranje slova koristi se samo za
  riječi kojih nema u rječniku (tipfeleri), pa "solarni" više ne nalazi "stolariju".
- Rijetke riječi vrijede više ("solarn" više od "proizvodnj"); nagrađuje se opis u kojem se riječi upita pojavljuju zajedno.
- Riječ koja označava vrstu posla (projektiranje, ugradnja, proizvodnja, prodaja, popravak...) daje prednost odgovarajućim
  odjeljcima (71, 43, 10–33, 47, 95...).
- Najbolji prijedlog se odabire sam, uz službeni tekst zbog kojeg je predložen. Kad alat ne prepozna većinu riječi opisa
  (pokrivenost < 0,3), kaže da nije siguran i ne odabire ga sam. Pokrivenost ne razlikuje točne od netočnih prijedloga
  (na oba skupa svi točni i svi netočni prvi prijedlozi imaju pokrivenost ≥ 0,3), pa nije prikazana kao mjera sigurnosti.

## Rezultati

| Skup i inačica | Top-1 | Top-3 | Prvi prijedlog u točnom odjeljku | Bez prijedloga |
|---|---|---|---|---|
${red("Stari skup – samo nazivi i sinonimi", r.stariBez)}
${red("Stari skup – sa službenim opisima", r.stariPuna)}
${red("**Novi skup – samo nazivi i sinonimi**", r.noviBez)}
${red("**Novi skup – sa službenim opisima**", r.noviPuna)}

Korisnik uvijek može odabrati drugi prijedlog ili odjeljak izravno, pa je za UX ključna top-3 točnost.

## Poštena napomena o pristranosti

- **Stari skup** (104 opisa, 28.10.) korišten je za razvoj prve inačice (Fuse.js nad nazivima i sinonimima): sinonimi i pravila
  su dorađivani na njegovim promašajima. Visoka točnost na njemu je zato optimistična. Prvo mjerenje prve inačice, prije dorade,
  bilo je top-1 87,5 % i top-3 89,4 %. Jedna oznaka je ispravljena: krovopokrivački radovi su u NKD 2025 razred 43.41, ne 43.99.
- **Novi skup** (42 opisa) napisan je prije izrade nove pretrage, s drugim zanimanjima. Na njemu je prva inačica imala
  **top-1 42,9 % i top-3 59,5 %**: pretraga po sličnosti slova nije razumjela opise izvan svojih sinonima. To je bio stvarni problem
  koji je primijetio i korisnik ("projektiranje solarnih panela" -> stolarija).
- Promašaji stare pretrage na novom skupu bili su viđeni prije izrade nove, a dva opća pravila ("prodaja" = trgovina na malo,
  "automobil" = motorno vozilo) dodana su nakon prvog mjerenja nove pretrage. Ni novi skup zato nije potpuno nepristran.
- **Nepristranu procjenu daje tek test s korisnicima (5.11.)**: njihove opise treba zapisati prije nego što se pretraga na njima
  ispravlja.

## Promašaji na novom skupu (točan razred nije među prva tri)

| Opis | Točno | Prva tri prijedloga |
|---|---|---|
${r.noviPuna.promasaji.join("\n") || "| – | | |"}

## Promašaji na starom skupu

| Opis | Točno | Prva tri prijedloga |
|---|---|---|
${r.stariPuna.promasaji.join("\n") || "| – | | |"}
`,
  "utf8",
);
