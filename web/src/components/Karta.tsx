import maplibregl, { type GeoJSONSource, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Jls, OdjeljakJls } from "../lib/data";
import { geojsonUrl } from "../lib/data";
import { STATUS, fmt, fmt1 } from "../lib/format";

// Karta bez podloge treće strane: samo službene granice JLS-a (DGU). Tako nema ovisnosti o tile poslužitelju
// ni o njegovim uvjetima korištenja, a karta radi i kad je bez interneta osim našeg poslužitelja.

type GeoJson = GeoJSON.FeatureCollection<GeoJSON.Geometry, { sifra_opcine: number; naziv: string }>;
let geoPromise: Promise<GeoJson> | null = null;
const ucitajGeo = () => (geoPromise ??= fetch(geojsonUrl).then((r) => r.json()));

function cssVar(ime: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(ime).trim();
}

function granice(fc: GeoJson): LngLatBoundsLike {
  let [x0, y0, x1, y1] = [180, 90, -180, -90];
  const obidi = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    } else if (Array.isArray(c)) c.forEach(obidi);
  };
  fc.features.forEach((f) => obidi((f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates));
  return [[x0, y0], [x1, y1]];
}

export function Karta({
  jls,
  podaci,
  odabraniJls,
  onKlik,
}: {
  jls: Jls[]; // JLS-ovi koje prikazujemo (npr. jedna županija)
  podaci: Map<number, OdjeljakJls>;
  odabraniJls?: number;
  onKlik: (sifra: number) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const karta = useRef<maplibregl.Map | null>(null);
  const [spremna, setSpremna] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; sifra: number } | null>(null);
  const onKlikRef = useRef(onKlik);
  onKlikRef.current = onKlik;

  useEffect(() => {
    if (!div.current) return;
    const m = new maplibregl.Map({
      container: div.current,
      style: { version: 8, sources: {}, layers: [{ id: "pozadina", type: "background", paint: { "background-color": cssVar("--surface-2") } }] },
      center: [18.5, 45.6],
      zoom: 7,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ customAttribution: "Granice: DGU, Registar prostornih jedinica (Otvorena dozvola)" }));
    m.touchZoomRotate.disableRotation();
    m.on("load", () => {
      m.addSource("jls", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "sifra_opcine" });
      m.addLayer({
        id: "jls-fill",
        type: "fill",
        source: "jls",
        paint: {
          "fill-color": [
            "match", ["get", "status"],
            "nedostaje", cssVar("--st-nedostaje"),
            "zasiceno", cssVar("--st-zasiceno"),
            "ravnoteza", cssVar("--st-ravnoteza"),
            cssVar("--st-premalo"),
          ],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, ["match", ["get", "status"], "ravnoteza", 0.45, 0.8]],
        },
      });
      m.addLayer({ id: "jls-line", type: "line", source: "jls", paint: { "line-color": cssVar("--surface"), "line-width": 1 } });
      m.addLayer({
        id: "jls-odabran",
        type: "line",
        source: "jls",
        filter: ["==", ["get", "odabran"], true],
        paint: { "line-color": cssVar("--ink"), "line-width": 3 },
      });
      let hoverId: number | null = null;
      m.on("mousemove", "jls-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        if (hoverId !== null) m.setFeatureState({ source: "jls", id: hoverId }, { hover: false });
        hoverId = f.id as number;
        m.setFeatureState({ source: "jls", id: hoverId }, { hover: true });
        m.getCanvas().style.cursor = "pointer";
        setTip({ x: e.point.x, y: e.point.y, sifra: f.properties.sifra_opcine as number });
      });
      m.on("mouseleave", "jls-fill", () => {
        if (hoverId !== null) m.setFeatureState({ source: "jls", id: hoverId }, { hover: false });
        hoverId = null;
        m.getCanvas().style.cursor = "";
        setTip(null);
      });
      m.on("click", "jls-fill", (e) => {
        const f = e.features?.[0];
        if (f) onKlikRef.current(f.properties.sifra_opcine as number);
      });
      setSpremna(true);
    });
    karta.current = m;
    // Okvir karte mijenja veličinu (lijeno učitan CSS, promjena širine prozora): kanvas mora pratiti okvir.
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(div.current);
    return () => {
      ro.disconnect();
      m.remove();
    };
  }, []);

  // Podaci i odabrana županija: ponovno složi GeoJSON sa statusom kao svojstvom.
  useEffect(() => {
    if (!spremna || !karta.current) return;
    let otkazano = false;
    ucitajGeo().then((geo) => {
      if (otkazano || !karta.current) return;
      const skup = new Set(jls.map((j) => j.sifra));
      const fc: GeoJson = {
        type: "FeatureCollection",
        features: geo.features
          .filter((f: GeoJSON.Feature<GeoJSON.Geometry, { sifra_opcine: number; naziv: string }>) => skup.has(f.properties.sifra_opcine))
          .map((f: GeoJSON.Feature<GeoJSON.Geometry, { sifra_opcine: number; naziv: string }>) => ({
            ...f,
            properties: {
              ...f.properties,
              status: podaci.get(f.properties.sifra_opcine)?.status ?? "premalo",
              odabran: f.properties.sifra_opcine === odabraniJls,
            },
          })),
      };
      (karta.current.getSource("jls") as GeoJSONSource).setData(fc);
      if (fc.features.length) {
        karta.current.resize();
        karta.current.fitBounds(granice(fc), { padding: 24, duration: 0 });
      }
    });
    return () => {
      otkazano = true;
    };
  }, [spremna, jls, podaci, odabraniJls]);

  const tipJls = tip ? jls.find((j) => j.sifra === tip.sifra) : undefined;
  const tipPod = tip ? podaci.get(tip.sifra) : undefined;

  return (
    <div className="karta" ref={div} role="region" aria-label="Karta gradova i općina obojena po semaforu (podaci su i u tablici ispod)">
      {tip && tipJls && (
        <div className="karta-tip" style={{ left: Math.min(tip.x + 12, (div.current?.clientWidth ?? 400) - 270), top: tip.y + 12 }}>
          <strong>{tipJls.naziv}</strong>
          <br />
          {tipPod ? (
            <>
              {STATUS[tipPod.status].ikona} {STATUS[tipPod.status].oznaka}
              <br />
              stvarno {fmt(tipPod.broj)}
              {tipPod.ocekivano !== null && tipPod.interval && (
                <>
                  , očekivano {fmt1(tipPod.ocekivano)} ({tipPod.interval[0]}–{tipPod.interval[1]})
                </>
              )}
            </>
          ) : (
            "nema podataka"
          )}
        </div>
      )}
    </div>
  );
}
