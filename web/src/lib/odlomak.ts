import type { Celija, Jls, Meta, Odjeljak, Razred, Status } from "./data";
import { datum, fmt, fmt1, jlsVrsta, subjekata } from "./format";

// D8: tržišni odlomak je deterministički predložak. Svaka brojka dolazi iz podataka i ima izvor; nema LLM-a.

/** Uži pogled po razredu (D15): očekivanje odjeljka × udio razreda u RH. */
export interface UziPogled {
  razred: Razred;
  broj: number;
  ocekivano: number;
  interval: [number, number];
  status: Exclude<Status, "premalo">;
}

export interface OdlomakUlaz {
  jls: Jls;
  odjeljak: Odjeljak;
  celija: Celija;
  uze?: UziPogled;
  /** Razred odabran bez vlastite procjene (premalo subjekata u RH): samo broj. */
  razred?: Razred;
  brojURazredu?: number;
  /** Lokali na OpenStreetMap karti (D16); undefined ako karta nema oznaku za ovu vrstu djelatnosti. */
  osm?: number;
  meta: Meta;
  stopaZupanija: number; // subjekata odjeljka na 10.000 stanovnika u županiji
  stopaRh: number; // subjekata odjeljka na 10.000 stanovnika u RH
}

const na10k = (broj: number, stanovnika: number) => (broj / stanovnika) * 10000;

function zakljucak(status: Status): { polozaj: string; recenica: string } {
  if (status === "nedostaje")
    return { polozaj: "ispod uobičajenog raspona", recenica: "Djelatnost je u ovom JLS-u nedovoljno zastupljena u odnosu na usporedive gradove i općine" };
  if (status === "zasiceno")
    return { polozaj: "iznad uobičajenog raspona", recenica: "Djelatnost je u ovom JLS-u zastupljenija nego u usporedivim gradovima i općinama" };
  return { polozaj: "unutar uobičajenog raspona", recenica: "Zastupljenost djelatnosti odgovara usporedivim gradovima i općinama" };
}

export function tekstOdlomka(u: OdlomakUlaz): string {
  const { jls, odjeljak, celija, meta, uze } = u;
  const mjesto = `${jlsVrsta(jls.grad) === "Grad" ? "Gradu" : "Općini"} ${jls.naziv}`;
  const dijelovi: string[] = [];
  const uvod =
    `Prema podacima Sudskog registra (stanje ${datum(meta.snapshot_vrijeme)}, snapshot ${meta.snapshot_id}), ` +
    `u ${mjesto} (${jls.zupanija} županija; ${fmt(jls.stanovnika)} stanovnika prema Popisu 2021.) `;
  const struktura =
    `${jls.grad ? "grad" : "općinu"} ove veličine, dobne strukture (${fmt1(jls.udio_65 * 100)} % stanovnika starijih od 65 godina) ` +
    `i razvijenosti (indeks razvijenosti ${fmt1(jls.indeks_razvijenosti)}, ${jls.skupina_razvijenosti}. razvojna skupina)`;

  if (uze) {
    const z = zakljucak(uze.status);
    dijelovi.push(
      uvod +
        `posluje ${subjekata(uze.broj)} (aktivna trgovačka društva i zadruge) u razredu NKD 2025. ` +
        `${uze.razred.razred} – ${uze.razred.naziv}.`,
    );
    dijelovi.push(
      `Za ${struktura} procjena očekuje ${fmt1(uze.ocekivano)} subjekata u tom razredu, uz 80 %-tni raspon od ` +
        `${uze.interval[0]} do ${uze.interval[1]}. Stvarni broj je ${z.polozaj}. ${z.recenica}.`,
    );
    if (celija.ocekivano !== null && celija.interval) {
      dijelovi.push(
        `U široj djelatnosti (odjeljak ${odjeljak.odjeljak} – ${odjeljak.naziv}) posluje ${subjekata(celija.broj)}, ` +
          `uz očekivanih ${fmt1(celija.ocekivano)} (raspon ${celija.interval[0]}–${celija.interval[1]}).`,
      );
    }
  } else {
    dijelovi.push(
      uvod +
        `posluje ${subjekata(celija.broj)} (aktivna trgovačka društva i zadruge) s pretežitom djelatnošću u odjeljku ` +
        `NKD 2025. ${odjeljak.odjeljak} – ${odjeljak.naziv}.`,
    );
    if (celija.ocekivano !== null && celija.interval) {
      const z = zakljucak(celija.status);
      dijelovi.push(
        `Za ${struktura} statistički model očekuje ${fmt1(celija.ocekivano)} subjekata, uz 80 %-tni raspon od ` +
          `${celija.interval[0]} do ${celija.interval[1]}. Stvarni broj je ${z.polozaj}. ${z.recenica}.`,
      );
    }
    if (u.razred && u.brojURazredu !== undefined) {
      dijelovi.push(`U užem razredu ${u.razred.razred} – ${u.razred.naziv} registrirano je ${subjekata(u.brojURazredu)}.`);
    }
  }

  dijelovi.push(
    `Na 10.000 stanovnika to je ${fmt1(na10k(celija.broj, jls.stanovnika))} subjekata u odjeljku ${odjeljak.odjeljak}, ` +
      `prema ${fmt1(u.stopaZupanija)} u ${jls.zupanija} županiji i ${fmt1(u.stopaRh)} u Republici Hrvatskoj.`,
  );

  if (u.osm !== undefined) {
    dijelovi.push(
      `Broj lokala ove vrste ucrtanih na karti OpenStreetMap u ${mjesto}: ${u.osm}. Taj broj uključuje i obrte i poslovnice ` +
        `tvrtki sa sjedištem drugdje, ali karta nije potpuna.`,
    );
  }

  const ograde = [
    "Sudski registar obuhvaća trgovačka društva i zadruge prema sjedištu; obrti nisu uključeni jer otvoreni podaci o obrtima po djelatnosti i JLS-u nisu dostupni, a poslovnice tvrtki sa sjedištem u drugom mjestu broje se u mjestu sjedišta.",
  ];
  if (odjeljak.obrti) ograde.push("U ovoj djelatnosti obično prevladavaju obrti, pa je procjena niže pouzdanosti.");
  dijelovi.push(ograde.join(" "));

  dijelovi.push(
    "Izvori: Sudski registar (Ministarstvo pravosuđa, uprave i digitalne transformacije), Popis stanovništva 2021. (DZS), " +
      "indeks razvijenosti (MRRFEU, NN 3/2024), NKD 2025. (DZS)" +
      (u.osm !== undefined ? ", OpenStreetMap (© OpenStreetMap contributors, ODbL)" : "") +
      ". Izračun: NišaRadar, https://dlukas99.github.io/nisaradar/",
  );
  return dijelovi.join(" ");
}

export { na10k };
