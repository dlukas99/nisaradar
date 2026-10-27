import type { Celija, Jls, Meta, Odjeljak, Razred } from "./data";
import { datum, fmt, fmt1, jlsVrsta, subjekata } from "./format";

// D8: tržišni odlomak je deterministički predložak. Svaka brojka dolazi iz podataka i ima izvor; nema LLM-a.

export interface OdlomakUlaz {
  jls: Jls;
  odjeljak: Odjeljak;
  celija: Celija;
  razred?: Razred;
  brojURazredu?: number;
  meta: Meta;
  stopaZupanija: number; // subjekata na 10.000 stanovnika u županiji
  stopaRh: number; // subjekata na 10.000 stanovnika u RH
}

const na10k = (broj: number, stanovnika: number) => (broj / stanovnika) * 10000;

export function tekstOdlomka(u: OdlomakUlaz): string {
  const { jls, odjeljak, celija, meta } = u;
  const mjesto = `${jlsVrsta(jls.grad) === "Grad" ? "Gradu" : "Općini"} ${jls.naziv}`;
  const stopaJls = na10k(celija.broj, jls.stanovnika);
  const dijelovi: string[] = [];

  dijelovi.push(
    `Prema podacima Sudskog registra (stanje ${datum(meta.snapshot_vrijeme)}, snapshot ${meta.snapshot_id}), ` +
      `u ${mjesto} (${jls.zupanija} županija; ${fmt(jls.stanovnika)} stanovnika prema Popisu 2021.) ` +
      `posluje ${subjekata(celija.broj)} (aktivna trgovačka društva i zadruge) s pretežitom djelatnošću u odjeljku ` +
      `NKD 2025. ${odjeljak.odjeljak} – ${odjeljak.naziv}.`,
  );

  if (celija.ocekivano !== null && celija.interval) {
    const [lo, hi] = celija.interval;
    const polozaj =
      celija.status === "nedostaje"
        ? "ispod uobičajenog raspona"
        : celija.status === "zasiceno"
          ? "iznad uobičajenog raspona"
          : "unutar uobičajenog raspona";
    const zakljucak =
      celija.status === "nedostaje"
        ? "Djelatnost je u ovom JLS-u nedovoljno zastupljena u odnosu na usporedive gradove i općine"
        : celija.status === "zasiceno"
          ? "Djelatnost je u ovom JLS-u zastupljenija nego u usporedivim gradovima i općinama"
          : "Zastupljenost djelatnosti odgovara usporedivim gradovima i općinama";
    dijelovi.push(
      `Za ${jlsVrsta(jls.grad).toLowerCase()} ove veličine, dobne strukture (${fmt1(jls.udio_65 * 100)} % stanovnika starijih od 65 godina) ` +
        `i razvijenosti (indeks razvijenosti ${fmt1(jls.indeks_razvijenosti)}, ${jls.skupina_razvijenosti}. razvojna skupina) ` +
        `statistički model očekuje ${fmt1(celija.ocekivano)} subjekata, uz 80 %-tni raspon od ${lo} do ${hi}. ` +
        `Stvarni broj je ${polozaj}. ${zakljucak}.`,
    );
  }

  dijelovi.push(
    `Na 10.000 stanovnika to je ${fmt1(stopaJls)} subjekata, prema ${fmt1(u.stopaZupanija)} u ${jls.zupanija} županiji ` +
      `i ${fmt1(u.stopaRh)} u Republici Hrvatskoj.`,
  );

  if (u.razred && u.brojURazredu !== undefined) {
    dijelovi.push(
      `U užem razredu ${u.razred.razred} – ${u.razred.naziv} u ${mjesto} registrirano je ${subjekata(u.brojURazredu)}` +
        ` (prema pretežitoj djelatnosti).`,
    );
  }

  const ograde = ["Obuhvat su trgovačka društva i zadruge; obrti nisu uključeni jer otvoreni podaci o obrtima po djelatnosti i JLS-u nisu dostupni."];
  if (odjeljak.obrti) ograde.push("U ovoj djelatnosti obično prevladavaju obrti, pa je procjena niže pouzdanosti.");
  dijelovi.push(ograde.join(" "));

  dijelovi.push(
    "Izvori: Sudski registar (Ministarstvo pravosuđa, uprave i digitalne transformacije), Popis stanovništva 2021. (DZS), " +
      "indeks razvijenosti (MRRFEU, NN 3/2024), NKD 2025. (DZS). Izračun: NišaRadar, https://dlukas99.github.io/nisaradar/",
  );
  return dijelovi.join(" ");
}

export { na10k };
