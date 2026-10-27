import { useMemo, useState } from "react";
import { fmt, fmt1, postotak } from "../lib/format";
import { razdioba } from "../lib/stat";

// Očekivana razdioba broja subjekata za JLS ovakve veličine i strukture (NegBin iz modela),
// s označenim 80 % rasponom i stvarnim brojem. Ovo je srž objašnjenja "kako smo izračunali".

const W = 560;
const H = 190;
const M = { l: 8, r: 8, t: 30, b: 34 };

interface Stupac {
  od: number;
  do: number;
  p: number;
}

export function Razdioba({
  mu,
  alpha,
  stvarno,
  interval,
}: {
  mu: number;
  alpha: number;
  stvarno: number;
  interval: [number, number];
}) {
  const [hover, setHover] = useState<number | null>(null);

  const stupci = useMemo<Stupac[]>(() => {
    const pmf = razdioba(mu, alpha, stvarno);
    // Velike općine imaju stotine mogućih vrijednosti: grupiramo u najviše ~50 stupaca.
    const sirina = Math.max(1, Math.ceil(pmf.length / 50));
    const out: Stupac[] = [];
    for (let i = 0; i < pmf.length; i += sirina) {
      const dio = pmf.slice(i, i + sirina);
      out.push({ od: i, do: i + dio.length - 1, p: dio.reduce((a, b) => a + b, 0) });
    }
    return out;
  }, [mu, alpha, stvarno]);

  const maxP = Math.max(...stupci.map((s) => s.p));
  const n = stupci.length;
  const bw = (W - M.l - M.r) / n;
  const y = (p: number) => M.t + (H - M.t - M.b) * (1 - p / maxP);
  const xK = (k: number) => {
    const i = stupci.findIndex((s) => k >= s.od && k <= s.do);
    const s = stupci[i < 0 ? n - 1 : i];
    return M.l + (i < 0 ? n - 1 : i) * bw + ((k - s.od + 0.5) / (s.do - s.od + 1)) * bw;
  };
  const [lo, hi] = interval;
  const boja = (s: Stupac) =>
    s.do < lo ? "var(--st-nedostaje)" : s.od > hi ? "var(--st-zasiceno)" : "var(--st-ravnoteza)";
  const oznakaStupca = (s: Stupac) => (s.od === s.do ? `${fmt(s.od)}` : `${fmt(s.od)}–${fmt(s.do)}`);
  const xStvarno = xK(stvarno);
  const xMu = xK(Math.round(mu));
  // Oznake na osi: početak, interval, kraj (bez preklapanja).
  const kraj = stupci[n - 1].do;
  const osi = [...new Set([0, lo, hi, kraj])];

  return (
    <div className="graf">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Očekivana razdioba: najvjerojatnije oko ${fmt1(mu)} subjekata, 80 % raspon ${lo}–${hi}; stvarno ${stvarno}.`}>
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--line-2)" />
        {stupci.map((s, i) => {
          const x = M.l + i * bw;
          const visina = H - M.b - y(s.p);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* veća nevidljiva ploha za lakši hover */}
              <rect x={x} y={M.t} width={bw} height={H - M.t - M.b} fill="transparent" />
              <rect
                x={x + Math.min(1, bw * 0.15)}
                y={y(s.p)}
                width={Math.max(1, bw - Math.min(2, bw * 0.3))}
                height={Math.max(0, visina)}
                rx={Math.min(3, bw / 4)}
                fill={boja(s)}
                opacity={hover === null || hover === i ? 0.85 : 0.45}
              />
            </g>
          );
        })}
        {/* očekivano */}
        <line x1={xMu} x2={xMu} y1={M.t - 4} y2={H - M.b} stroke="var(--ink-2)" strokeDasharray="3 3" />
        {/* stvarno */}
        <line x1={xStvarno} x2={xStvarno} y1={M.t - 14} y2={H - M.b} stroke="var(--ink)" strokeWidth={2.5} />
        <circle cx={xStvarno} cy={M.t - 14} r={4.5} fill="var(--ink)" />
        <text
          x={Math.min(Math.max(xStvarno, M.l), W - M.r)}
          y={M.t - 20}
          textAnchor={xStvarno < 50 ? "start" : xStvarno > W - 50 ? "end" : "middle"}
          fontSize="12"
          fontWeight="700"
          fill="var(--ink)"
        >
          Stvarno: {fmt(stvarno)}
        </text>
        {osi.map((k) => (
          <text key={k} x={xK(k)} y={H - M.b + 16} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
            {fmt(k)}
          </text>
        ))}
        <text x={W / 2} y={H - 3} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
          broj subjekata
        </text>
      </svg>
      {hover !== null && (
        <div
          className="tip"
          style={{ left: `${((M.l + (hover + 0.5) * bw) / W) * 100}%`, top: `${(y(stupci[hover].p) / H) * 100}%` }}
        >
          {oznakaStupca(stupci[hover])} subj.: {postotak(stupci[hover].p)}
        </div>
      )}
      <div className="legenda">
        <span>
          <i className="sw" style={{ background: "var(--st-nedostaje)" }} /> neuobičajeno malo (ispod 10 %)
        </span>
        <span>
          <i className="sw" style={{ background: "var(--st-ravnoteza)" }} /> uobičajeni raspon (80 %)
        </span>
        <span>
          <i className="sw" style={{ background: "var(--st-zasiceno)" }} /> neuobičajeno puno (iznad 90 %)
        </span>
        <span>
          <svg width="14" height="12" aria-hidden="true">
            <line x1="7" x2="7" y1="0" y2="12" stroke="var(--ink-2)" strokeDasharray="3 2" />
          </svg>
          očekivano ({fmt1(mu)})
        </span>
      </div>
    </div>
  );
}
