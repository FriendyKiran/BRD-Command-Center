import { FEATURES, N_FEATURES } from "./features";
import { concentrationFrom, designMatrix, fitLogistic, linPred, modelBase, trainModel, type FittedModel, type ModelKind } from "./model";
import { mulberry32, normal } from "./rng";
import { binFeatures, ensembleEta, fitBooster, fitForest, fitSingleTree, type TreeEnsemble } from "./trees";
import type { HistoricalLot } from "./types";

/**
 * MODEL ZOO: alternative BRD risk models behind the same FittedModel interface, so the decision
 * engine, value-of-information, planner and validation work unchanged with any of them.
 * Every model predicts 45-day detected BRD morbidity for a lot and carries parameter uncertainty
 * (bootstrap refits or posterior draws) plus a beta-binomial term for lot-to-lot variation.
 */
export interface ModelSpec {
  kind: ModelKind;
  label: string;
  short: string;
  family: "Linear" | "Bayesian" | "Tree" | "Ensemble";
  description: string;
  uncertainty: string;
  strengths: string;
  cautions: string;
  /** Approximate in-browser training time, for the UI. */
  cost: "instant" | "seconds";
}

export const MODEL_SPECS: ModelSpec[] = [
  {
    kind: "logit",
    label: "Penalized logistic regression",
    short: "Logistic (L2)",
    family: "Linear",
    description: "Binomial GLM on all 35 arrival features, fit by Newton–Raphson with an L2 penalty. The default decision model.",
    uncertainty: "30 bootstrap refits + beta-binomial overdispersion",
    strengths: "Transparent coefficients, exact explanations, well-calibrated, adjusts for metaphylaxis given (confounding by indication).",
    cautions: "Assumes effects add on the log-odds scale; interactions must be specified by hand.",
    cost: "instant",
  },
  {
    kind: "bayes",
    label: "Bayesian logistic regression",
    short: "Bayesian logit",
    family: "Bayesian",
    description: "Same predictors with Normal(0, 1) priors on every effect; the posterior is approximated at its mode (Laplace) and inflated by the Pearson dispersion.",
    uncertainty: "200 posterior draws (Laplace × dispersion) + beta-binomial",
    strengths: "Uncertainty comes from the posterior, not resampling; priors shrink weakly supported effects; ready for informative priors from literature.",
    cautions: "Laplace approximation assumes a roughly Gaussian posterior; priors are generic, not elicited.",
    cost: "instant",
  },
  {
    kind: "rojas",
    label: "Logistic, Rojas et al. 2022 predictors",
    short: "Rojas-set logit",
    family: "Linear",
    description: "Logistic regression restricted to the predictors Rojas et al. had: arrival weight, sex, arrival quarter, cohort size, pen area and bunk space per head (plus yard and metaphylaxis adjustment).",
    uncertainty: "30 bootstrap refits + beta-binomial",
    strengths: "Benchmark: shows what richer arrival records (source, haul, vaccination, weather, buyer call) add.",
    cautions: "Ignores source, history and weather, so it cannot value missing records (value of information is always zero).",
    cost: "instant",
  },
  {
    kind: "tree",
    label: "Decision tree (CART)",
    short: "Decision tree",
    family: "Tree",
    description: "One depth-4 tree split on binomial deviance, with each leaf's pooled risk. Reads as a yard rule book.",
    uncertainty: "30 bootstrap trees + beta-binomial",
    strengths: "Fully readable rules; captures thresholds and interactions automatically.",
    cautions: "Coarse (≤ 16 risk levels) and unstable; Rojas et al. found trees the weakest of five algorithms (AUC 0.68).",
    cost: "instant",
  },
  {
    kind: "forest",
    label: "Random forest",
    short: "Random forest",
    family: "Tree",
    description: "150 head-weighted regression trees on lot morbidity, each grown on a bootstrap sample with 35 % of features tried per split.",
    uncertainty: "10 independently bootstrapped sub-forests + beta-binomial (κ from out-of-bag residuals)",
    strengths: "Captures non-linearity and interactions with little tuning; Rojas et al.'s best model (AUC 0.79).",
    cautions: "Averaging shrinks extreme risks toward the mean; explanations are approximate (ablation).",
    cost: "seconds",
  },
  {
    kind: "gbm",
    label: "Gradient-boosted trees",
    short: "Boosted trees",
    family: "Tree",
    description: "150 depth-3 trees boosted on the binomial deviance (Newton leaves, learning rate 0.06, 80 % row / 80 % feature subsampling).",
    uncertainty: "8 bootstrap boosters + beta-binomial (κ from out-of-bag residuals)",
    strengths: "Usually the strongest tabular learner; models interactions and thresholds while staying on the probability scale.",
    cautions: "Needs more data to beat a well-specified GLM; explanations are approximate (ablation).",
    cost: "seconds",
  },
  {
    kind: "stack",
    label: "Model average (logistic + forest + boosted)",
    short: "Model average",
    family: "Ensemble",
    description: "Equal-weight average on the log-odds scale of the penalized logistic, random-forest and boosted-tree models.",
    uncertainty: "Members combined draw-by-draw + beta-binomial",
    strengths: "Hedges against any single model's misspecification; usually the most stable choice.",
    cautions: "Slowest to train; no single set of coefficients to read.",
    cost: "seconds",
  },
];

export const MODEL_SPEC: Record<ModelKind, ModelSpec> = Object.fromEntries(MODEL_SPECS.map((s) => [s.kind, s])) as Record<ModelKind, ModelSpec>;

/** Predictors available to Rojas et al. 2022 (Table 2), plus the yard and treatment-given adjustments. */
const ROJAS_FEATURES = new Set(["wt_below", "wt_below_sq", "wt_above", "sex_heifer", "sex_mixed", "sex_bull", "q1", "q3", "q4", "log_head", "crowding", "bunk_short", "yard_ll", "yard_cv", "yard_ar", "meta_premium", "meta_economy"]);
const ROJAS_MASK = FEATURES.map((f) => ROJAS_FEATURES.has(f.name));

export interface ZooOptions {
  seed?: number;
  lambda?: number;
  bootstraps?: number;
  rounds?: number;
  depth?: number;
  trees?: number;
  onProgress?: (frac: number) => void;
  /** Reuse already-trained components when building the model average. */
  components?: Partial<Record<ModelKind, FittedModel>>;
}

const bootWeights = (rng: () => number, N: number) => {
  const w = new Array(N).fill(0);
  for (let i = 0; i < N; i++) w[Math.floor(rng() * N)]++;
  return w;
};

/** Out-of-bag log-odds: average over members that did not see the lot (falls back to the point fit). */
function oobEtas(X: Float64Array[], point: TreeEnsemble, boot: { e: TreeEnsemble; w: number[] }[]) {
  return X.map((x, i) => {
    let s = 0;
    let k = 0;
    for (const b of boot)
      if (b.w[i] === 0) {
        s += ensembleEta(b.e, x);
        k++;
      }
    return k ? s / k : ensembleEta(point, x);
  });
}

function trainRojas(lots: HistoricalLot[], o: ZooOptions): FittedModel {
  const t0 = performance.now();
  const { X, y, n } = designMatrix(lots);
  const Xm = X.map((x) => Float64Array.from(x, (v, j) => (ROJAS_MASK[j] ? v : 0)));
  const lambda = o.lambda ?? 2;
  const B = o.bootstraps ?? 30;
  const rng = mulberry32(o.seed ?? 11);
  const coef = fitLogistic(Xm, y, n, lambda);
  const ensemble: number[][] = [];
  for (let b = 0; b < B; b++) {
    ensemble.push(fitLogistic(Xm, y, n, lambda, bootWeights(rng, X.length)));
    o.onProgress?.((b + 1) / B);
  }
  // Masked-out features have exactly-zero coefficients, so scoring the full feature vector is safe.
  return {
    kind: "rojas",
    version: "brd-rojas-logit-1.0",
    ...modelBase(lots, X),
    coef,
    ensemble,
    concentration: concentrationFrom(Xm.map((x) => linPred(coef, x)), y, n, ROJAS_FEATURES.size + 1),
    lambda,
    hyper: { lambda, bootstraps: B, predictors: ROJAS_FEATURES.size },
    trainMs: performance.now() - t0,
  };
}

/** Cholesky factor of a symmetric positive-definite matrix (lower triangular). */
function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
  return L;
}

/** Inverse of an SPD matrix via Gauss–Jordan (p ≈ 36). */
function invert(A: Float64Array[]): number[][] {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c || M[r][c] === 0) continue;
      const f = M[r][c];
      for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row) => row.slice(n));
}

function trainBayes(lots: HistoricalLot[], o: ZooOptions): FittedModel {
  const t0 = performance.now();
  const { X, y, n } = designMatrix(lots);
  const priorPrecision = o.lambda ?? 1; // Normal(0, 1) on every effect
  const Hout: Float64Array[][] = [];
  const coef = fitLogistic(X, y, n, priorPrecision, undefined, Hout);
  const H = Hout[0];
  // Quasi-likelihood dispersion φ: the binomial posterior is too narrow for overdispersed lots.
  let pearson = 0;
  for (let i = 0; i < X.length; i++) {
    const mu = 1 / (1 + Math.exp(-linPred(coef, X[i])));
    pearson += (y[i] - n[i] * mu) ** 2 / Math.max(1e-9, n[i] * mu * (1 - mu));
  }
  const phi = Math.max(1, pearson / (X.length - N_FEATURES - 1));
  const cov = invert(H).map((row) => row.map((v) => v * phi));
  const L = cholesky(cov);
  const rng = mulberry32(o.seed ?? 13);
  const D = o.bootstraps ?? 200;
  const ensemble: number[][] = [];
  for (let d = 0; d < D; d++) {
    const z = coef.map(() => normal(rng));
    ensemble.push(coef.map((c, i) => c + L[i].reduce((s, l, k) => (k <= i ? s + l * z[k] : s), 0)));
  }
  o.onProgress?.(1);
  return {
    kind: "bayes",
    version: "brd-bayes-laplace-1.0",
    ...modelBase(lots, X),
    coef,
    ensemble,
    concentration: concentrationFrom(X.map((x) => linPred(coef, x)), y, n),
    lambda: priorPrecision,
    hyper: { priorSd: 1 / Math.sqrt(priorPrecision), draws: D, dispersion: +phi.toFixed(2) },
    trainMs: performance.now() - t0,
  };
}

type TreeFitter = (w: number[], rng: () => number) => TreeEnsemble;

function trainTrees(lots: HistoricalLot[], kind: "tree" | "forest" | "gbm", o: ZooOptions): FittedModel {
  const t0 = performance.now();
  const { X, y, n } = designMatrix(lots);
  const Bn = binFeatures(X, 32);
  const rng = mulberry32(o.seed ?? (kind === "tree" ? 17 : kind === "forest" ? 19 : 23));
  const depth = o.depth ?? (kind === "tree" ? 4 : kind === "forest" ? 8 : 3);
  let fit: TreeFitter;
  let B: number;
  let hyper: Record<string, number>;
  if (kind === "tree") {
    fit = (w, r) => fitSingleTree(Bn, y, n, w, { depth, minChildHead: 2500, rng: r });
    B = o.bootstraps ?? 30;
    hyper = { depth, minLeafHead: 2500, bootstraps: B };
  } else if (kind === "forest") {
    const T = o.trees ?? 150;
    B = o.bootstraps ?? 10;
    const sub = Math.max(10, Math.round(T / 6));
    fit = (w, r) => fitForest(Bn, y, n, w, { trees: w.every((v) => v === 1) ? T : sub, depth, minChildHead: 900, colsample: 0.35, rng: r });
    hyper = { trees: T, depth, minLeafHead: 900, featureFraction: 0.35, subForests: B, subForestTrees: sub };
  } else {
    const rounds = o.rounds ?? 150;
    B = o.bootstraps ?? 8;
    fit = (w, r) => fitBooster(X, Bn, y, n, w, { rounds, lr: 0.06, depth, lambda: 1, minChildHess: 25, subsample: 0.8, colsample: 0.8, rng: r });
    hyper = { rounds, depth, learningRate: 0.06, subsample: 0.8, featureFraction: 0.8, bootstraps: B };
  }
  const point = fit(new Array(X.length).fill(1), rng);
  o.onProgress?.(1 / (B + 1));
  const boot: { e: TreeEnsemble; w: number[] }[] = [];
  for (let b = 0; b < B; b++) {
    const w = bootWeights(rng, X.length);
    boot.push({ e: fit(w, rng), w });
    o.onProgress?.((b + 2) / (B + 1));
  }
  const oob = oobEtas(X, point, boot);
  return {
    kind,
    version: `brd-${kind}-1.0`,
    ...modelBase(lots, X),
    coef: [],
    ensemble: [],
    trees: { point, boot: boot.map((b) => b.e) },
    concentration: concentrationFrom(oob, y, n, 1),
    lambda: 0,
    hyper,
    trainMs: performance.now() - t0,
  };
}

function trainStack(lots: HistoricalLot[], o: ZooOptions): FittedModel {
  const t0 = performance.now();
  const parts: ModelKind[] = ["logit", "forest", "gbm"];
  const components = parts.map((k, i) => {
    const pre = o.components?.[k];
    const m = pre && pre.trainedOn.lots === lots.length && pre.trainedOn.to === lots.map((l) => l.arrivalDate).sort().at(-1) ? pre : trainKind(k, lots, { seed: o.seed });
    o.onProgress?.((i + 1) / parts.length);
    return m;
  });
  const weights = parts.map(() => 1 / parts.length);
  const { X } = designMatrix(lots);
  return {
    kind: "stack",
    version: "brd-average-1.0",
    ...modelBase(lots, X),
    coef: [],
    ensemble: [],
    components,
    weights,
    // Conservative: keep the largest unexplained lot-to-lot variation (smallest κ) among the members.
    concentration: Math.min(...components.map((c) => c.concentration)),
    lambda: 0,
    hyper: { members: parts.length },
    trainMs: performance.now() - t0,
  };
}

/** Train any model family on historical lots. */
export function trainKind(kind: ModelKind, lots: HistoricalLot[], o: ZooOptions = {}): FittedModel {
  switch (kind) {
    case "logit":
      return trainModel(lots, { lambda: o.lambda, bootstraps: o.bootstraps, seed: o.seed, onProgress: o.onProgress });
    case "bayes":
      return trainBayes(lots, o);
    case "rojas":
      return trainRojas(lots, o);
    case "stack":
      return trainStack(lots, o);
    default:
      return trainTrees(lots, kind, o);
  }
}

/** Lighter settings for validation runs and cross-validation folds. */
export const VALIDATION_OPTIONS: Partial<Record<ModelKind, ZooOptions>> = {
  logit: { bootstraps: 20 },
  rojas: { bootstraps: 20 },
  tree: { bootstraps: 20 },
  forest: { bootstraps: 6 },
  gbm: { bootstraps: 5 },
};
