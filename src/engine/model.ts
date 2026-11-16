import { FEATURE_GROUPS, FEATURES, featurize, missingFields, N_FEATURES } from "./features";
import { betaMeanConc, clamp, gammaPmf, invLogit, mulberry32, quantile } from "./rng";
import { ensembleEta, type TreeEnsemble } from "./trees";
import type { HistoricalLot, LotArrival, RiskPrediction } from "./types";

/**
 * BRD RISK MODEL
 * Lot-level binomial logistic regression (cases ~ Binomial(head, p)), fit by Newton–Raphson with an
 * L2 penalty, plus:
 *  - a bootstrap ensemble → parameter (model) uncertainty;
 *  - a beta-binomial overdispersion estimate → lot-to-lot variation the features can't explain.
 * Historical metaphylaxis is an input feature so the model separates "risky lot" from "lot that was
 * treated" (adjusting for confounding by indication); predictions are made with metaphylaxis = none.
 *
 * The same FittedModel shape also carries the alternative families in `zoo.ts` (Bayesian, reduced
 * predictor set, decision tree, random forest, gradient boosting, model average). Everything
 * downstream (prediction, uncertainty, explanations, validation) goes through etaOf / memberEtas.
 */
export type ModelKind = "logit" | "bayes" | "rojas" | "tree" | "forest" | "gbm" | "stack";
export const LINEAR_KINDS: ModelKind[] = ["logit", "bayes", "rojas"];

export interface FittedModel {
  /** Absent on older bundles = "logit". */
  kind?: ModelKind;
  version: string;
  trainedOn: { lots: number; head: number; from: string; to: string };
  coef: number[]; // [intercept, ...features]; empty for tree models
  /** Linear models: bootstrap refits (or posterior draws for the Bayesian model). */
  ensemble: number[][];
  /** Tree models: point fit + bootstrap refits. */
  trees?: { point: TreeEnsemble; boot: TreeEnsemble[] };
  /** Model average: component models and weights on the log-odds scale. */
  components?: FittedModel[];
  weights?: number[];
  hyper?: Record<string, number>;
  trainMs?: number;
  means: number[];
  ranges: { weightLb: [number, number]; head: [number, number]; haulMiles: [number, number] };
  concentration: number;
  lambda: number;
  metrics?: ModelMetrics;
}

export interface ModelMetrics {
  split: string;
  nTest: number;
  auc: number;
  aucBuyer: number;
  brier: number;
  calibration: { predicted: number; observed: number; n: number }[];
  roc: { fpr: number; tpr: number }[];
  rocBuyer: { fpr: number; tpr: number };
  sensitivity: number;
  specificity: number;
  ppv: number;
  coefTable: { name: string; label: string; coef: number; lo: number; hi: number }[];
  metaRREstimate: { premium: number; economy: number };
  /** Binomial deviance per head on the holdout (lower is better). */
  logLoss?: number;
  /** Head-weighted expected calibration error across deciles. */
  ece?: number;
  /** Permutation importance: increase in holdout log loss when a risk-factor group is shuffled. */
  importance?: { group: string; value: number }[];
  /** Holdout predictions, in the order of the holdout lots (feeds the in-app evaluation suite). */
  scores?: number[];
  /** Holdout P(lot ≥ high-risk cutoff), integrating parameter + lot-to-lot uncertainty. */
  pHigh?: number[];
}

export const kindOf = (m: FittedModel): ModelKind => m.kind ?? "logit";

export function fitLogistic(X: Float64Array[], y: number[], n: number[], lambda: number, w?: number[], hessOut?: Float64Array[][]): number[] {
  const p = N_FEATURES + 1;
  const beta = new Array(p).fill(0);
  const totY = y.reduce((a, b) => a + b, 0);
  const totN = n.reduce((a, b) => a + b, 0);
  beta[0] = Math.log(totY / Math.max(1, totN - totY));
  for (let iter = 0; iter < 30; iter++) {
    const g = new Float64Array(p);
    const H = Array.from({ length: p }, () => new Float64Array(p));
    for (let i = 0; i < X.length; i++) {
      const wi = w ? w[i] : 1;
      if (wi === 0) continue;
      const xi = X[i];
      let eta = beta[0];
      for (let j = 0; j < N_FEATURES; j++) eta += beta[j + 1] * xi[j];
      const mu = invLogit(eta);
      const r = (y[i] - n[i] * mu) * wi;
      const v = n[i] * mu * (1 - mu) * wi;
      g[0] += r;
      H[0][0] += v;
      for (let j = 0; j < N_FEATURES; j++) {
        const xj = xi[j];
        if (xj === 0) continue;
        g[j + 1] += r * xj;
        H[0][j + 1] += v * xj;
        for (let k = j; k < N_FEATURES; k++) if (xi[k] !== 0) H[j + 1][k + 1] += v * xj * xi[k];
      }
    }
    for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    for (let j = 1; j < p; j++) {
      g[j] -= lambda * beta[j];
      H[j][j] += lambda;
    }
    if (hessOut) hessOut[0] = H;
    const step = solve(H, g);
    let maxStep = 0;
    for (let j = 0; j < p; j++) {
      beta[j] += step[j];
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    if (maxStep < 1e-7) break;
  }
  return beta;
}

/** Gaussian elimination with partial pivoting (p ≈ 36, so this is plenty). */
function solve(A: Float64Array[], b: Float64Array): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

export const linPred = (beta: number[], x: ArrayLike<number>) => {
  let eta = beta[0];
  for (let j = 0; j < N_FEATURES; j++) eta += beta[j + 1] * x[j];
  return eta;
};

/** Point prediction on the log-odds scale, for any model family. */
export function etaOf(m: FittedModel, x: Float64Array): number {
  if (m.components) {
    let s = 0;
    m.components.forEach((c, k) => (s += m.weights![k] * etaOf(c, x)));
    return s;
  }
  if (m.trees) return ensembleEta(m.trees.point, x);
  return linPred(m.coef, x);
}

/** One log-odds prediction per ensemble member (bootstrap refit or posterior draw). */
export function memberEtas(m: FittedModel, x: Float64Array): number[] {
  if (m.components) {
    const parts = m.components.map((c) => memberEtas(c, x));
    const B = Math.max(...parts.map((p) => p.length));
    return Array.from({ length: B }, (_, b) => parts.reduce((s, p, k) => s + m.weights![k] * p[b % p.length], 0));
  }
  if (m.trees) return m.trees.boot.map((e) => ensembleEta(e, x));
  return m.ensemble.map((b) => linPred(b, x));
}

export const GROUP_IDX = FEATURE_GROUPS.map((g) => ({ group: g as string, idx: FEATURES.map((f, j) => (f.group === g ? j : -1)).filter((j) => j >= 0) }));

/** Log-odds contribution of each risk-factor group vs the average training lot (exact for linear models, ablation otherwise). */
export function groupContributions(m: FittedModel, x: Float64Array, eta = etaOf(m, x)): { group: string; value: number }[] {
  const linear = m.coef.length > 0 && !m.components;
  return GROUP_IDX.filter((g) => g.group !== "Metaphylaxis given").map(({ group, idx }) => {
    if (linear) return { group, value: idx.reduce((s, j) => s + m.coef[j + 1] * (x[j] - m.means[j]), 0) };
    const xa = Float64Array.from(x);
    for (const j of idx) xa[j] = m.means[j];
    return { group, value: eta - etaOf(m, xa) };
  });
}

/** P(p ≥ cutoff) from member predictions and beta-binomial lot variation. */
export function probAbove(mus: number[], conc: number, cutoff: number, nDraws: number, seed: number): number {
  const rng = mulberry32(seed);
  let hi = 0;
  for (let d = 0; d < nDraws; d++) if (betaMeanConc(rng, mus[d % mus.length], conc) >= cutoff) hi++;
  return hi / nDraws;
}

export function designMatrix(lots: HistoricalLot[]) {
  return {
    X: lots.map((l) => featurize(l, l.metaphylaxisGiven ? (l.metaphylaxisDrug as "premium" | "economy") : "none")),
    y: lots.map((l) => l.brdTreated45),
    n: lots.map((l) => l.head),
  };
}

/** Beta-binomial concentration κ from Pearson dispersion of (ideally out-of-sample) predictions. */
export function concentrationFrom(etas: ArrayLike<number>, y: number[], n: number[], dfUsed = N_FEATURES + 1): number {
  let pearson = 0;
  let nbar = 0;
  for (let i = 0; i < y.length; i++) {
    const mu = invLogit(etas[i]);
    pearson += (y[i] - n[i] * mu) ** 2 / Math.max(1e-9, n[i] * mu * (1 - mu));
    nbar += n[i];
  }
  nbar /= y.length;
  const phi = pearson / Math.max(1, y.length - dfUsed);
  const rho = clamp((phi - 1) / Math.max(1, nbar - 1), 0.002, 0.5);
  return 1 / rho - 1;
}

/** Metadata every model carries: training window, feature means (for explanations) and ranges (for out-of-range checks). */
export function modelBase(lots: HistoricalLot[], X: Float64Array[]) {
  const means = new Array(N_FEATURES).fill(0);
  for (const x of X) for (let j = 0; j < N_FEATURES; j++) means[j] += x[j] / X.length;
  const ws = lots.map((l) => l.weightLb);
  const hs = lots.map((l) => l.head);
  const hauls = lots.map((l) => l.haulMiles).filter((v): v is number => v != null);
  const dates = lots.map((l) => l.arrivalDate).sort();
  return {
    trainedOn: { lots: lots.length, head: hs.reduce((a, b) => a + b, 0), from: dates[0], to: dates[dates.length - 1] },
    means,
    ranges: {
      weightLb: [Math.min(...ws), Math.max(...ws)] as [number, number],
      head: [Math.min(...hs), Math.max(...hs)] as [number, number],
      haulMiles: [Math.min(...hauls), Math.max(...hauls)] as [number, number],
    },
  };
}

export interface TrainOptions {
  lambda?: number;
  bootstraps?: number;
  seed?: number;
  onProgress?: (frac: number) => void;
}

export function trainModel(lots: HistoricalLot[], opts: TrainOptions = {}): FittedModel {
  const t0 = performance.now();
  const lambda = opts.lambda ?? 2;
  const B = opts.bootstraps ?? 30;
  const rng = mulberry32(opts.seed ?? 7);
  const { X, y, n } = designMatrix(lots);
  const coef = fitLogistic(X, y, n, lambda);
  const ensemble: number[][] = [];
  for (let b = 0; b < B; b++) {
    const w = new Array(X.length).fill(0);
    for (let i = 0; i < X.length; i++) w[Math.floor(rng() * X.length)]++;
    ensemble.push(fitLogistic(X, y, n, lambda, w));
    opts.onProgress?.((b + 1) / B);
  }
  // Overdispersion → beta-binomial intra-lot correlation ρ → concentration κ = 1/ρ − 1.
  const concentration = concentrationFrom(X.map((x) => linPred(coef, x)), y, n);
  return {
    kind: "logit",
    version: "brd-logit-1.0",
    ...modelBase(lots, X),
    coef,
    ensemble,
    concentration,
    lambda,
    hyper: { lambda, bootstraps: B },
    trainMs: performance.now() - t0,
  };
}

/** Predict 45-day detected-BRD incidence WITHOUT metaphylaxis, with uncertainty and explanations. */
export function predictRisk(model: FittedModel, lot: LotArrival, highRiskCutoff = 0.15, nDraws = 600): RiskPrediction {
  const x = featurize(lot, "none");
  const eta = etaOf(model, x);
  const mean = invLogit(eta);
  const rng = mulberry32(0x5eed ^ lot.lotId.length * 7919 ^ Math.round(lot.weightLb));
  const mus = memberEtas(model, x).map(invLogit);
  const draws = new Float64Array(nDraws);
  let hi = 0;
  for (let d = 0; d < nDraws; d++) {
    const p = betaMeanConc(rng, mus[d % mus.length], model.concentration);
    draws[d] = p;
    if (p >= highRiskCutoff) hi++;
  }
  const sorted = Float64Array.from(draws).sort();
  // Group contributions on the log-odds scale relative to the average training lot.
  const contributions = groupContributions(model, x, eta)
    .map(({ group, value }) => ({ feature: group, label: group, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const ood: string[] = [];
  const r = model.ranges;
  if (lot.weightLb < r.weightLb[0] || lot.weightLb > r.weightLb[1]) ood.push(`Arrival weight ${lot.weightLb} lb is outside the training range (${r.weightLb[0]}–${r.weightLb[1]} lb)`);
  if (lot.head < r.head[0] || lot.head > r.head[1]) ood.push(`Lot size ${lot.head} head is outside the training range (${r.head[0]}–${r.head[1]})`);
  if (lot.haulMiles != null && (lot.haulMiles < r.haulMiles[0] || lot.haulMiles > r.haulMiles[1])) ood.push(`Haul of ${lot.haulMiles} mi is outside the training range`);
  return {
    mean,
    p10: quantile(sorted, 0.1),
    p90: quantile(sorted, 0.9),
    concentration: model.concentration,
    probHighRisk: hi / nDraws,
    contributions,
    ood,
    missing: missingFields(lot).map((m) => m.label),
  };
}

/**
 * Bayesian update for lots already on feed: combine the arrival prediction (prior) with BRD pulls
 * observed so far, accounting for the share of cases expected to have appeared by this day on feed.
 */
export function updateWithObserved(
  prior: RiskPrediction,
  lot: LotArrival,
  rr: number,
  onset: { shape: number; scale: number; metaDelay: number; metaGiven: boolean },
): { risk: RiskPrediction; note: string } {
  if (lot.daysOnFeed == null || lot.casesToDate == null) return { risk: prior, note: "" };
  const pmf = gammaPmf(onset.shape, onset.scale, 45);
  const shift = onset.metaGiven ? onset.metaDelay : 0;
  let F = 0;
  for (let i = 0; i <= Math.min(45, lot.daysOnFeed - shift); i++) F += pmf[i];
  const G = 400;
  const a = prior.mean * prior.concentration;
  const b = (1 - prior.mean) * prior.concentration;
  const logPost = new Float64Array(G);
  let maxL = -Infinity;
  for (let g = 0; g < G; g++) {
    const p = (g + 0.5) / G;
    const q = clamp(p * rr * F, 1e-9, 1 - 1e-9);
    const c = lot.casesToDate;
    const lp = (a - 1) * Math.log(p) + (b - 1) * Math.log(1 - p) + c * Math.log(q) + (lot.head - c) * Math.log(1 - q);
    logPost[g] = lp;
    if (lp > maxL) maxL = lp;
  }
  let tot = 0;
  const post = new Float64Array(G);
  for (let g = 0; g < G; g++) {
    post[g] = Math.exp(logPost[g] - maxL);
    tot += post[g];
  }
  let m = 0;
  let cum = 0;
  let p10 = 0;
  let p90 = 0;
  let hi = 0;
  for (let g = 0; g < G; g++) {
    const p = (g + 0.5) / G;
    const w = post[g] / tot;
    m += p * w;
    const prev = cum;
    cum += w;
    if (prev < 0.1 && cum >= 0.1) p10 = p;
    if (prev < 0.9 && cum >= 0.9) p90 = p;
    if (p >= 0.15) hi += w;
  }
  let v = 0;
  for (let g = 0; g < G; g++) v += (((g + 0.5) / G - m) ** 2 * post[g]) / tot;
  const conc = clamp((m * (1 - m)) / Math.max(v, 1e-6) - 1, 2, 5000);
  const expectedSoFar = prior.mean * rr * F * lot.head;
  const note = `Day ${lot.daysOnFeed} on feed: ${lot.casesToDate} pulls observed vs ${expectedSoFar.toFixed(1)} expected from the arrival prediction (${Math.round(F * 100)}% of cases normally appear by now). Risk updated ${m > prior.mean ? "upward" : "downward"} from ${(prior.mean * 100).toFixed(1)}% to ${(m * 100).toFixed(1)}%.`;
  return { risk: { ...prior, mean: m, p10, p90, concentration: conc, probHighRisk: hi }, note };
}

// ── Validation ───────────────────────────────────────────────────────────────

export function auc(scores: number[], labels: boolean[]): { auc: number; roc: { fpr: number; tpr: number }[] } {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const P = labels.filter(Boolean).length;
  const N = labels.length - P;
  let tp = 0;
  let fp = 0;
  let area = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  const roc = [{ fpr: 0, tpr: 0 }];
  // Tied scores move the curve in one diagonal step (otherwise a binary score's AUC depends on row order).
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    if (labels[i]) tp++;
    else fp++;
    if (k + 1 < idx.length && scores[idx[k + 1]] === scores[i]) continue;
    const fpr = fp / N;
    const tpr = tp / P;
    area += (fpr - prevFpr) * (tpr + prevTpr) / 2;
    prevFpr = fpr;
    prevTpr = tpr;
    roc.push({ fpr, tpr });
  }
  const step = Math.max(1, Math.floor(roc.length / 80));
  return { auc: area, roc: roc.filter((_, i) => i % step === 0 || i === roc.length - 1) };
}

export type Trainer = (lots: HistoricalLot[]) => FittedModel;

/** Binomial deviance per head (log loss on the lot-count scale). */
export function binomDeviance(scores: ArrayLike<number>, lots: { brdTreated45: number; head: number }[]): number {
  let ll = 0;
  let hd = 0;
  lots.forEach((l, i) => {
    const p = clamp(scores[i], 1e-6, 1 - 1e-6);
    ll -= l.brdTreated45 * Math.log(p) + (l.head - l.brdTreated45) * Math.log(1 - p);
    hd += l.head;
  });
  return ll / hd;
}

/** Temporal validation: train on lots before `splitDate`, test on lots after it. Works for any model family. */
export function validate(
  lots: HistoricalLot[],
  splitDate: string,
  cutoff = 0.15,
  trainer: Trainer = (t) => trainModel(t, { bootstraps: 20 }),
): { model: FittedModel; metrics: ModelMetrics } {
  const train = lots.filter((l) => l.arrivalDate < splitDate);
  const test = lots.filter((l) => l.arrivalDate >= splitDate);
  const model = trainer(train);
  // Predict observed morbidity under the treatment actually given, as the yard would have seen it.
  const Xt = test.map((l) => featurize(l, l.metaphylaxisGiven ? (l.metaphylaxisDrug as "premium" | "economy") : "none"));
  const scores = Xt.map((x) => invLogit(etaOf(model, x)));
  const pHigh = Xt.map((x, i) => probAbove(memberEtas(model, x).map(invLogit), model.concentration, cutoff, 300, 911 + i));
  const labels = test.map((l) => l.morbidity45 >= cutoff);
  const { auc: a, roc } = auc(scores, labels);
  const buyer: number[] = test.map((l) => (l.buyerHighRisk ? 1 : 0));
  const aucBuyer = auc(buyer, labels).auc;
  const tpB = test.filter((l, i) => labels[i] && l.buyerHighRisk).length;
  const fpB = test.filter((l, i) => !labels[i] && l.buyerHighRisk).length;
  const P = labels.filter(Boolean).length;
  const N = labels.length - P;
  let brier = 0;
  test.forEach((l, i) => (brier += (scores[i] - l.morbidity45) ** 2));
  // Calibration by decile of predicted risk (head-weighted).
  const order = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const calibration: ModelMetrics["calibration"] = [];
  let ece = 0;
  const totHead = test.reduce((s, l) => s + l.head, 0);
  for (let d = 0; d < 10; d++) {
    const ids = order.slice(Math.floor((d * order.length) / 10), Math.floor(((d + 1) * order.length) / 10));
    const head = ids.reduce((s, i) => s + test[i].head, 0);
    const pr = ids.reduce((s, i) => s + scores[i] * test[i].head, 0) / head;
    const ob = ids.reduce((s, i) => s + test[i].brdTreated45, 0) / head;
    calibration.push({ predicted: pr, observed: ob, n: ids.length });
    ece += (Math.abs(pr - ob) * head) / totHead;
  }
  // Operating point: threshold that flags the same share of lots as the order buyers do.
  const flagShare = buyer.reduce((a, b) => a + b, 0) / buyer.length;
  const thr = quantile([...scores].sort((a, b) => a - b), 1 - flagShare);
  const tp = test.filter((_, i) => labels[i] && scores[i] >= thr).length;
  const fp = test.filter((_, i) => !labels[i] && scores[i] >= thr).length;
  const linear = model.coef.length > 0 && !model.components;
  const coefTable = linear
    ? FEATURES.map((f, j) => {
        const vals = model.ensemble.map((b) => b[j + 1]).sort((a, b) => a - b);
        return { name: f.name, label: f.label, coef: model.coef[j + 1], lo: quantile(vals, 0.05), hi: quantile(vals, 0.95) };
      })
    : [];
  const jPrem = FEATURES.findIndex((f) => f.name === "meta_premium");
  const jEco = FEATURES.findIndex((f) => f.name === "meta_economy");
  // Model-agnostic learned treatment effect: average predicted risk if treated ÷ if untreated.
  const marginalRR = (j: number) => {
    let a = 0;
    let b = 0;
    for (const x of Xt) {
      const x0 = Float64Array.from(x);
      x0[jPrem] = 0;
      x0[jEco] = 0;
      const x1 = Float64Array.from(x0);
      x1[j] = 1;
      a += invLogit(etaOf(model, x1));
      b += invLogit(etaOf(model, x0));
    }
    return a / b;
  };
  const logLoss = binomDeviance(scores, test);
  // Permutation importance by risk-factor group (two shuffles, averaged).
  const rng = mulberry32(4242);
  const importance = GROUP_IDX.filter((g) => g.group !== "Metaphylaxis given").map(({ group, idx }) => {
    let inc = 0;
    for (let rep = 0; rep < 2; rep++) {
      const perm = test.map((_, i) => i);
      for (let i = perm.length - 1; i > 0; i--) {
        const k = Math.floor(rng() * (i + 1));
        [perm[i], perm[k]] = [perm[k], perm[i]];
      }
      const sp = Xt.map((x, i) => {
        const xp = Float64Array.from(x);
        for (const j of idx) xp[j] = Xt[perm[i]][j];
        return invLogit(etaOf(model, xp));
      });
      inc += (binomDeviance(sp, test) - logLoss) / 2;
    }
    return { group, value: inc };
  });
  const metrics: ModelMetrics = {
    split: `Train: arrivals before ${splitDate} (${train.length} lots) · Test: ${splitDate} onward (${test.length} lots)`,
    nTest: test.length,
    auc: a,
    aucBuyer,
    brier: brier / test.length,
    calibration,
    roc,
    rocBuyer: { fpr: fpB / N, tpr: tpB / P },
    sensitivity: tp / P,
    specificity: 1 - fp / N,
    ppv: tp / Math.max(1, tp + fp),
    coefTable,
    metaRREstimate: linear
      ? { premium: Math.exp(model.coef[jPrem + 1]), economy: Math.exp(model.coef[jEco + 1]) }
      : { premium: marginalRR(jPrem), economy: marginalRR(jEco) },
    logLoss,
    ece,
    importance,
    scores: scores.map((v) => +v.toFixed(5)),
    pHigh: pHigh.map((v) => +v.toFixed(4)),
  };
  return { model, metrics };
}
