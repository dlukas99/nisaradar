import type { Status } from "./data";

const broj = new Intl.NumberFormat("hr-HR");
const dec1 = new Intl.NumberFormat("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmt = (n: number) => broj.format(n);
export const fmt1 = (n: number) => dec1.format(n);
export const postotak = (x: number, znamenki = 1) =>
  new Intl.NumberFormat("hr-HR", { style: "percent", maximumFractionDigits: znamenki }).format(x);

export function datum(iso: string | null | undefined): string {
  if (!iso) return "nepoznato";
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`;
}

export function datumVrijeme(iso: string | null | undefined): string {
  if (!iso) return "nepoznato";
  const d = new Date(iso);
  return `${datum(iso)} u ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Oznake semafora: boja nikad nije jedini nositelj značenja (uvijek ide i ikona i tekst).
export const STATUS: Record<Status, { oznaka: string; ikona: string; opis: string }> = {
  nedostaje: {
    oznaka: "Nedostaje",
    ikona: "▼",
    opis: "Stvarno je subjekata manje nego što je uobičajeno za ovakav JLS (ispod 10. percentila očekivanja).",
  },
  ravnoteza: {
    oznaka: "U ravnoteži",
    ikona: "●",
    opis: "Broj subjekata je unutar uobičajenog raspona za ovakav JLS.",
  },
  zasiceno: {
    oznaka: "Zasićeno",
    ikona: "▲",
    opis: "Stvarno je subjekata više nego što je uobičajeno za ovakav JLS (iznad 90. percentila očekivanja).",
  },
  premalo: {
    oznaka: "Premalo podataka",
    ikona: "○",
    opis: "U cijeloj Hrvatskoj je premalo subjekata u ovom odjeljku za pouzdan model.",
  },
};

export const jlsVrsta = (grad: boolean) => (grad ? "Grad" : "Općina");

// "subjekt", "subjekta", "subjekata" (hrvatska množina)
export function subjekata(n: number): string {
  const z = n % 10;
  const zz = n % 100;
  if (z === 1 && zz !== 11) return `${fmt(n)} subjekt`;
  if (z >= 2 && z <= 4 && (zz < 12 || zz > 14)) return `${fmt(n)} subjekta`;
  return `${fmt(n)} subjekata`;
}

// Normalizacija za pretragu: mala slova, bez dijakritika (korisnici često tipkaju "cevapi" umjesto "ćevapi").
export function normaliziraj(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

// Nazivi županija su pridjevi ("Osječko-baranjska"), a Grad Zagreb je iznimka: padeži za rečenice u tekstu.
export const zupanijaNom = (z: string) => (z === "Grad Zagreb" ? z : `${z} županija`);
export const zupanijaGen = (z: string) => (z === "Grad Zagreb" ? "Grada Zagreba" : `${z.replace(/a$/, "e")} županije`);
export const zupanijaLok = (z: string) => (z === "Grad Zagreb" ? "Gradu Zagrebu" : `${z.replace(/a$/, "oj")} županiji`);
