// Tipovi i dohvat statičkih JSON datoteka koje generira pipeline/export.py (shema: docs/openapi.yaml).

export type Status = "nedostaje" | "ravnoteza" | "zasiceno" | "premalo";

export interface Jls {
  sifra: number;
  naziv: string;
  zupanija: string;
  sifra_zupanije: number;
  grad: boolean;
  stanovnika: number;
  udio_0_14: number;
  udio_65: number;
  indeks_razvijenosti: number;
  skupina_razvijenosti: number;
  subjekata: number;
  udio_bez_sifre: number;
  niza_pouzdanost_nkd: boolean;
}

export interface Odjeljak {
  odjeljak: string;
  naziv: string;
  podrucje: string;
  podrucje_naziv: string;
  obrti: boolean;
  modeliran: boolean;
  broj_rh: number;
  alpha: number | null;
}

export interface Razred {
  razred: string;
  naziv: string;
  odjeljak: string;
  sinonimi: string;
  broj_rh: number;
}

export interface Celija {
  odjeljak: string;
  broj: number;
  ocekivano: number | null;
  interval: [number, number] | null;
  p_manje: number | null;
  p_vise: number | null;
  status: Status;
  status_uzi: Status | null;
}

export interface Deficit {
  sifra: number;
  odjeljci: Celija[];
  razredi: Record<string, number>;
}

export interface OdjeljakJls {
  sifra: number;
  broj: number;
  ocekivano: number | null;
  interval: [number, number] | null;
  p_manje: number | null;
  status: Status;
  status_uzi: Status | null;
}

export interface OdjeljakDatoteka {
  odjeljak: string;
  jls: OdjeljakJls[];
}

export interface Izvor {
  naziv: string;
  izdavac: string;
  url: string;
  ckan: string | null;
  licenca: string;
  koristimo: string;
  ckan_azurirano?: string | null;
}

export interface Meta {
  naziv: string;
  snapshot_id: number;
  snapshot_vrijeme: string | null;
  dohvaceno: string | null;
  generirano: string;
  obuhvat: {
    subjekata_u_obuhvatu: number;
    subjekata_s_odjeljkom: number;
    izvor_odjeljka: Record<string, number>;
    slaganje_izvora: number;
    prag_bez_sifre: number;
    jls: number;
    odjeljaka: number;
    odjeljaka_modelirano: number;
  };
  evaluacija: {
    devijanca_glm: number;
    devijanca_baseline: number;
    devijanca_gbm: number;
    mae_glm: number;
    mae_baseline: number;
    pokrivenost_80_pit: number;
    odjeljaka_glm_bolji_od_baselinea: number;
    odjeljaka: number;
  };
  osjetljivost: {
    isti_status: number;
    nedostaje_potvrdeno: number;
    zasiceno_potvrdeno: number;
    slaganje_izvora: number;
    subjekata_glavni: number;
    subjekata_pretezita: number;
  };
  odjeljci_obrti: string[];
  izvori: Izvor[];
  izvori_provjereno: string;
}

const BASE = `${import.meta.env.BASE_URL}data/`;
const cache = new Map<string, Promise<unknown>>();

// Svaka datoteka se dohvaća najviše jednom po posjetu.
export function dohvati<T>(put: string): Promise<T> {
  if (!cache.has(put)) {
    cache.set(
      put,
      fetch(BASE + put).then((r) => {
        if (!r.ok) throw new Error(`${put}: HTTP ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(put) as Promise<T>;
}

export interface Osnovno {
  meta: Meta;
  jls: Jls[];
  odjeljci: Odjeljak[];
  razredi: Razred[];
}

export async function ucitajOsnovno(): Promise<Osnovno> {
  const [meta, jls, odjeljci, razredi] = await Promise.all([
    dohvati<Meta>("meta.json"),
    dohvati<Jls[]>("jls.json"),
    dohvati<Odjeljak[]>("odjeljci.json"),
    dohvati<Razred[]>("razredi.json"),
  ]);
  return { meta, jls, odjeljci, razredi };
}

export const geojsonUrl = BASE + "jls.geojson";
