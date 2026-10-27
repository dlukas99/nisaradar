// Negativna binomna razdioba (NB2, kao u pipeline/model.py): Var = μ + α μ².
// Računamo je i u pregledniku da bismo nacrtali cijelu očekivanu razdiobu, ne samo interval.

// Lanczosova aproksimacija log-gama funkcije.
function lgamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function nbPmf(k: number, mu: number, alpha: number): number {
  if (mu <= 0) return k === 0 ? 1 : 0;
  // Za α ≈ 0 (model je pao na Poisson) koristimo Poissonovu razdiobu.
  if (alpha < 1e-4) return Math.exp(k * Math.log(mu) - mu - lgamma(k + 1));
  const n = 1 / alpha;
  const p = n / (n + mu);
  return Math.exp(lgamma(k + n) - lgamma(n) - lgamma(k + 1) + n * Math.log(p) + k * Math.log(1 - p));
}

// Vjerojatnosti P(Y = k) za k = 0..kMax, gdje kMax pokriva 99,5 % mase (i stvarnu vrijednost).
export function razdioba(mu: number, alpha: number, stvarno: number): number[] {
  const out: number[] = [];
  let kum = 0;
  for (let k = 0; k < 2000; k++) {
    const p = nbPmf(k, mu, alpha);
    out.push(p);
    kum += p;
    if (kum > 0.995 && k >= stvarno && k >= 3) break;
  }
  return out;
}
