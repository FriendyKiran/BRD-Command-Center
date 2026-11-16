import { clamp, invLogit, logit } from "./rng";

/**
 * TREE LEARNER shared by the decision tree, random forest and gradient-boosted models.
 * Histogram-based, second-order (Newton) splitting: every model supplies a gradient g and hessian h
 * per lot, so one learner covers binomial boosting (g = n·p − y, h = n·p·(1 − p)) and head-weighted
 * regression forests (g = −n·m, h = n). Trees are stored as flat arrays so they survive
 * structured cloning to and from the Web Worker.
 */
export interface Tree {
  /** Split feature per node; −1 marks a leaf. */
  f: number[];
  /** Threshold: go left when x[f] ≤ t. */
  t: number[];
  l: number[];
  r: number[];
  /** Leaf value (log-odds increment for boosting, probability for bagging). */
  v: number[];
  /** Training weight (head) reaching the node; used for display and importance. */
  w: number[];
}

export interface TreeEnsemble {
  /** boost: eta = base + lr·Σ leaf; bag: p = mean leaf, eta = logit(p). */
  mode: "boost" | "bag";
  base: number;
  lr: number;
  trees: Tree[];
}

export function treeValue(t: Tree, x: ArrayLike<number>): number {
  let i = 0;
  while (t.f[i] >= 0) i = x[t.f[i]] <= t.t[i] ? t.l[i] : t.r[i];
  return t.v[i];
}

export function ensembleEta(e: TreeEnsemble, x: ArrayLike<number>): number {
  let s = 0;
  for (const t of e.trees) s += treeValue(t, x);
  if (e.mode === "boost") return e.base + e.lr * s;
  return logit(clamp(s / e.trees.length, 1e-4, 1 - 1e-4));
}

export interface Binned {
  bins: Uint8Array[];
  cuts: number[][];
}

/** Quantile-bin each feature (≤ maxBins bins). Split "bin ≤ b" is equivalent to "x ≤ cuts[b]". */
export function binFeatures(X: Float64Array[], maxBins = 32): Binned {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const bins: Uint8Array[] = [];
  const cuts: number[][] = [];
  for (let j = 0; j < p; j++) {
    const vals = Float64Array.from(X, (x) => x[j]).sort();
    const uniq: number[] = [];
    for (const v of vals) if (uniq.length === 0 || v !== uniq[uniq.length - 1]) uniq.push(v);
    let c: number[];
    if (uniq.length <= maxBins) c = uniq.slice(0, -1);
    else {
      c = [];
      for (let k = 1; k < maxBins; k++) {
        const v = vals[Math.floor((k * n) / maxBins)];
        if (v < uniq[uniq.length - 1] && (c.length === 0 || v > c[c.length - 1])) c.push(v);
      }
    }
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const v = X[i][j];
      let lo = 0;
      let hi = c.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (v <= c[mid]) hi = mid;
        else lo = mid + 1;
      }
      b[i] = lo;
    }
    bins.push(b);
    cuts.push(c);
  }
  return { bins, cuts };
}

export interface GrowOptions {
  maxDepth: number;
  /** Minimum hessian (≈ head for forests, ≈ expected-case variance for boosting) in each child. */
  minChildHess: number;
  lambda: number;
  /** Fraction of features considered at each node (random-forest style). */
  colsample: number;
  rng: () => number;
  minGain?: number;
  /** Optional exact leaf value (e.g. the leaf's pooled log-odds for a single tree). */
  leaf?: (rows: Int32Array) => number;
  /** Per-row weight recorded on nodes (defaults to h). */
  weight?: Float64Array;
}

export function growTree(B: Binned, rows: Int32Array, g: Float64Array, h: Float64Array, o: GrowOptions): Tree {
  const tree: Tree = { f: [], t: [], l: [], r: [], v: [], w: [] };
  const p = B.bins.length;
  const HG = new Float64Array(64);
  const HH = new Float64Array(64);
  const feats = Array.from({ length: p }, (_, j) => j);

  const node = (idx: Int32Array, depth: number): number => {
    const id = tree.f.length;
    tree.f.push(-1);
    tree.t.push(0);
    tree.l.push(-1);
    tree.r.push(-1);
    tree.v.push(0);
    let G = 0;
    let H = 0;
    let W = 0;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      G += g[i];
      H += h[i];
      W += o.weight ? o.weight[i] : h[i];
    }
    tree.w.push(W);
    const asLeaf = () => {
      tree.v[id] = o.leaf ? o.leaf(idx) : -G / (H + o.lambda);
      return id;
    };
    if (depth >= o.maxDepth || H < 2 * o.minChildHess) return asLeaf();
    const parent = (G * G) / (H + o.lambda);
    let bestGain = o.minGain ?? 1e-9;
    let bestF = -1;
    let bestB = -1;
    for (let j = 0; j < p; j++) {
      const k = j + Math.floor(o.rng() * (p - j));
      [feats[j], feats[k]] = [feats[k], feats[j]];
    }
    const nTry = Math.max(1, Math.round(p * o.colsample));
    for (let q = 0; q < nTry; q++) {
      const f = feats[q];
      const nb = B.cuts[f].length + 1;
      if (nb < 2) continue;
      HG.fill(0, 0, nb);
      HH.fill(0, 0, nb);
      const bf = B.bins[f];
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        HG[bf[i]] += g[i];
        HH[bf[i]] += h[i];
      }
      let GL = 0;
      let HL = 0;
      for (let b = 0; b < nb - 1; b++) {
        GL += HG[b];
        HL += HH[b];
        const HR = H - HL;
        if (HL < o.minChildHess || HR < o.minChildHess) continue;
        const GR = G - GL;
        const gain = (GL * GL) / (HL + o.lambda) + (GR * GR) / (HR + o.lambda) - parent;
        if (gain > bestGain) {
          bestGain = gain;
          bestF = f;
          bestB = b;
        }
      }
    }
    if (bestF < 0) return asLeaf();
    const bf = B.bins[bestF];
    let nl = 0;
    for (let k = 0; k < idx.length; k++) if (bf[idx[k]] <= bestB) nl++;
    const left = new Int32Array(nl);
    const right = new Int32Array(idx.length - nl);
    let a = 0;
    let c = 0;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      if (bf[i] <= bestB) left[a++] = i;
      else right[c++] = i;
    }
    tree.f[id] = bestF;
    tree.t[id] = B.cuts[bestF][bestB];
    tree.l[id] = node(left, depth + 1);
    tree.r[id] = node(right, depth + 1);
    return id;
  };
  node(rows, 0);
  return tree;
}

// ── Model fitters ────────────────────────────────────────────────────────────

export interface BoostOptions {
  rounds: number;
  lr: number;
  depth: number;
  lambda: number;
  minChildHess: number;
  subsample: number;
  colsample: number;
  rng: () => number;
}

/** Binomial gradient boosting (Newton leaves) on lot counts y of n, with row weights w. */
export function fitBooster(X: Float64Array[], B: Binned, y: number[], n: number[], w: number[], o: BoostOptions): TreeEnsemble {
  const N = X.length;
  let sy = 0;
  let sn = 0;
  for (let i = 0; i < N; i++) {
    sy += w[i] * y[i];
    sn += w[i] * n[i];
  }
  const base = logit(clamp(sy / sn, 1e-4, 1 - 1e-4));
  const eta = new Float64Array(N).fill(base);
  const g = new Float64Array(N);
  const h = new Float64Array(N);
  const trees: Tree[] = [];
  const active: number[] = [];
  for (let r = 0; r < o.rounds; r++) {
    active.length = 0;
    for (let i = 0; i < N; i++) {
      if (w[i] === 0 || o.rng() >= o.subsample) continue;
      const pr = invLogit(eta[i]);
      g[i] = w[i] * (n[i] * pr - y[i]);
      h[i] = w[i] * n[i] * pr * (1 - pr);
      active.push(i);
    }
    const t = growTree(B, Int32Array.from(active), g, h, { maxDepth: o.depth, minChildHess: o.minChildHess, lambda: o.lambda, colsample: o.colsample, rng: o.rng });
    trees.push(t);
    for (let i = 0; i < N; i++) eta[i] += o.lr * treeValue(t, X[i]);
  }
  return { mode: "boost", base, lr: o.lr, trees };
}

export interface ForestOptions {
  trees: number;
  depth: number;
  minChildHead: number;
  colsample: number;
  rng: () => number;
}

/** Random forest of head-weighted regression trees on lot morbidity; each tree on its own bootstrap. */
export function fitForest(B: Binned, y: number[], n: number[], w: number[], o: ForestOptions): TreeEnsemble {
  const N = y.length;
  const pool: number[] = [];
  const cum: number[] = [];
  let tot = 0;
  for (let i = 0; i < N; i++)
    if (w[i] > 0) {
      tot += w[i];
      pool.push(i);
      cum.push(tot);
    }
  const trees: Tree[] = [];
  const g = new Float64Array(N);
  const h = new Float64Array(N);
  for (let t = 0; t < o.trees; t++) {
    const c = new Float64Array(N);
    for (let k = 0; k < pool.length; k++) {
      const u = o.rng() * tot;
      let lo = 0;
      let hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] >= u) hi = mid;
        else lo = mid + 1;
      }
      c[pool[lo]]++;
    }
    const rows: number[] = [];
    for (let i = 0; i < N; i++)
      if (c[i] > 0) {
        g[i] = -c[i] * y[i];
        h[i] = c[i] * n[i];
        rows.push(i);
      }
    trees.push(growTree(B, Int32Array.from(rows), g, h, { maxDepth: o.depth, minChildHess: o.minChildHead, lambda: 0, colsample: o.colsample, rng: o.rng }));
  }
  return { mode: "bag", base: 0, lr: 1, trees };
}

/** Single CART-style tree on binomial deviance with exact (pooled log-odds) leaves. */
export function fitSingleTree(B: Binned, y: number[], n: number[], w: number[], o: { depth: number; minChildHead: number; rng: () => number }): TreeEnsemble {
  const N = y.length;
  let sy = 0;
  let sn = 0;
  for (let i = 0; i < N; i++) {
    sy += w[i] * y[i];
    sn += w[i] * n[i];
  }
  const p0 = sy / sn;
  const base = logit(p0);
  const g = new Float64Array(N);
  const h = new Float64Array(N);
  const head = new Float64Array(N);
  const rows: number[] = [];
  for (let i = 0; i < N; i++) {
    if (w[i] === 0) continue;
    g[i] = w[i] * (n[i] * p0 - y[i]);
    h[i] = w[i] * n[i] * p0 * (1 - p0);
    head[i] = w[i] * n[i];
    rows.push(i);
  }
  // h is proportional to head here, so the minimum child size is expressed in head.
  const tree = growTree(B, Int32Array.from(rows), g, h, {
    maxDepth: o.depth,
    minChildHess: o.minChildHead * p0 * (1 - p0),
    lambda: 0,
    colsample: 1,
    rng: o.rng,
    weight: head,
    leaf: (idx) => {
      let a = 0;
      let b = 0;
      for (const i of idx) {
        a += w[i] * y[i];
        b += w[i] * n[i];
      }
      return logit((a + 2 * p0) / (b + 2)) - base;
    },
  });
  return { mode: "boost", base, lr: 1, trees: [tree] };
}
