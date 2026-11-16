import { clamp, invLogit, logit, mulberry32 } from "./rng";

/**
 * EVALUATION SUITE: model-agnostic metrics computed from holdout predictions.
 * Used by the in-app Model Lab and by scripts/generate-data.ts. Lots are the unit of analysis;
 * "high-risk" = 45-day morbidity ≥ the cutoff (Rojas et al. 2022 use 15 %).
 */
export interface EvalLot {
  lotId: string;
  yardId: string;
  head: number;
  cases: number;
  morbidity: number;
  highRisk: boolean;
  buyer: boolean;
}

/** Mann–Whitney AUC with tie handling. */
export function aucOf(scores: ArrayLike<number>, labels: boolean[], idx?: number[]): number {
  const ids = idx ?? Array.from({ length: labels.length }, (_, i) => i);
  const sorted = [...ids].sort((a, b) => scores[a] - scores[b]);
  let rankSumPos = 0;
  let nPos = 0;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && scores[sorted[j + 1]] === scores[sorted[i]]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++)
      if (labels[sorted[k]]) {
        rankSumPos += rank;
        nPos++;
      }
    i = j + 1;
  }
  const nNeg = sorted.length - nPos;
  if (!nPos || !nNeg) return NaN;
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

const pctile = (xs: number[], q: number) => {
  const s = [...xs].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return s[clamp(Math.floor(q * (s.length - 1)), 0, s.length - 1)];
};

/**
 * Paired bootstrap over lots: AUC 95 % CI per model, and the AUC difference vs a reference model
 * with its CI and a two-sided bootstrap p-value. Resampling lots jointly keeps the comparison paired.
 */
export function bootstrapAuc(scoresByModel: Record<string, ArrayLike<number>>, labels: boolean[], reference: string, B = 400, seed = 99) {
  const keys = Object.keys(scoresByModel);
  const rng = mulberry32(seed);
  const n = labels.length;
  const samples: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]));
  for (let b = 0; b < B; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(rng() * n));
    for (const k of keys) samples[k].push(aucOf(scoresByModel[k], labels, idx));
  }
  return Object.fromEntries(
    keys.map((k) => {
      const diffs = samples[k].map((v, b) => v - samples[reference][b]);
      const below = diffs.filter((d) => d <= 0).length / B;
      const above = diffs.filter((d) => d >= 0).length / B;
      return [
        k,
        {
          lo: pctile(samples[k], 0.025),
          hi: pctile(samples[k], 0.975),
          diff: aucOf(scoresByModel[k], labels) - aucOf(scoresByModel[reference], labels),
          diffLo: pctile(diffs, 0.025),
          diffHi: pctile(diffs, 0.975),
          p: k === reference ? 1 : Math.min(1, 2 * Math.min(below, above)),
        },
      ];
    }),
  ) as Record<string, { lo: number; hi: number; diff: number; diffLo: number; diffHi: number; p: number }>;
}

/** Precision–recall curve and average precision (step-wise, no interpolation). */
export function prCurve(scores: ArrayLike<number>, labels: boolean[]) {
  const idx = Array.from({ length: labels.length }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const P = labels.filter(Boolean).length;
  let tp = 0;
  let fp = 0;
  let ap = 0;
  const pts: { recall: number; precision: number }[] = [];
  for (const i of idx) {
    if (labels[i]) {
      tp++;
      ap += tp / (tp + fp) / P;
    } else fp++;
    pts.push({ recall: tp / P, precision: tp / (tp + fp) });
  }
  const step = Math.max(1, Math.floor(pts.length / 90));
  return { ap, prevalence: P / labels.length, curve: pts.filter((_, i) => i % step === 0 || i === pts.length - 1) };
}

export interface ThresholdStats {
  threshold: number;
  flagged: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  sensitivity: number;
  specificity: number;
  ppv: number;
  npv: number;
  f1: number;
  accuracy: number;
  youden: number;
}

export function thresholdStats(scores: ArrayLike<number>, labels: boolean[], thr: number): ThresholdStats {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  labels.forEach((y, i) => {
    const f = scores[i] >= thr;
    if (f && y) tp++;
    else if (f) fp++;
    else if (y) fn++;
    else tn++;
  });
  const sens = tp / Math.max(1, tp + fn);
  const spec = tn / Math.max(1, tn + fp);
  const ppv = tp / Math.max(1, tp + fp);
  return {
    threshold: thr,
    flagged: (tp + fp) / labels.length,
    tp,
    fp,
    tn,
    fn,
    sensitivity: sens,
    specificity: spec,
    ppv,
    npv: tn / Math.max(1, tn + fn),
    f1: (2 * ppv * sens) / Math.max(1e-9, ppv + sens),
    accuracy: (tp + tn) / labels.length,
    youden: sens + spec - 1,
  };
}

/** Threshold that maximises Youden's J. */
export function youdenThreshold(scores: ArrayLike<number>, labels: boolean[]): ThresholdStats {
  const cands = Array.from(new Set(Array.from(scores))).sort((a, b) => a - b);
  const step = Math.max(1, Math.floor(cands.length / 200));
  let best = thresholdStats(scores, labels, cands[0]);
  for (let i = 0; i < cands.length; i += step) {
    const s = thresholdStats(scores, labels, cands[i]);
    if (s.youden > best.youden) best = s;
  }
  return best;
}

/**
 * Decision-curve analysis (Vickers & Elkin 2006): net benefit of acting on lots whose
 * P(high-risk) ≥ pt, vs acting on all or none. Net benefit = TP/N − FP/N · pt/(1 − pt).
 */
export function decisionCurve(prob: ArrayLike<number>, labels: boolean[], thresholds: number[]) {
  const N = labels.length;
  const prev = labels.filter(Boolean).length / N;
  return thresholds.map((pt) => {
    let tp = 0;
    let fp = 0;
    labels.forEach((y, i) => {
      if (prob[i] >= pt) {
        if (y) tp++;
        else fp++;
      }
    });
    const odds = pt / (1 - pt);
    return { pt, model: tp / N - (fp / N) * odds, all: prev - (1 - prev) * odds, none: 0 };
  });
}

/** Brier score of P(high-risk) for the binary event, and its skill vs predicting the prevalence. */
export function brierBinary(prob: ArrayLike<number>, labels: boolean[]) {
  const prev = labels.filter(Boolean).length / labels.length;
  let b = 0;
  labels.forEach((y, i) => (b += (prob[i] - (y ? 1 : 0)) ** 2));
  b /= labels.length;
  const ref = prev * (1 - prev);
  return { brier: b, skill: 1 - b / ref };
}

/** Brier skill on lot morbidity vs a constant (holdout-mean) forecast. */
export function brierSkillMorbidity(scores: ArrayLike<number>, lots: EvalLot[]) {
  const m = lots.reduce((s, l) => s + l.morbidity, 0) / lots.length;
  let b = 0;
  let r = 0;
  lots.forEach((l, i) => {
    b += (scores[i] - l.morbidity) ** 2;
    r += (m - l.morbidity) ** 2;
  });
  return { brier: b / lots.length, skill: 1 - b / r };
}

/**
 * Logistic recalibration on lot counts: logit(observed) = a + b·logit(predicted).
 * Slope b < 1 → predictions too extreme (overfit); calibration-in-the-large a (with b fixed at 1) ≠ 0 → biased overall.
 */
export function calibrationFit(scores: ArrayLike<number>, lots: EvalLot[]) {
  const z = lots.map((_, i) => logit(clamp(scores[i], 1e-5, 1 - 1e-5)));
  let a = 0;
  let b = 1;
  for (let it = 0; it < 50; it++) {
    let g0 = 0;
    let g1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    lots.forEach((l, i) => {
      const mu = invLogit(a + b * z[i]);
      const r = l.cases - l.head * mu;
      const v = l.head * mu * (1 - mu);
      g0 += r;
      g1 += r * z[i];
      h00 += v;
      h01 += v * z[i];
      h11 += v * z[i] * z[i];
    });
    const det = h00 * h11 - h01 * h01;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a += da;
    b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-9) break;
  }
  let c = 0;
  for (let it = 0; it < 50; it++) {
    let g = 0;
    let h = 0;
    lots.forEach((l, i) => {
      const mu = invLogit(c + z[i]);
      g += l.cases - l.head * mu;
      h += l.head * mu * (1 - mu);
    });
    c += g / h;
    if (Math.abs(g / h) < 1e-10) break;
  }
  return { slope: b, intercept: a, citl: c };
}

/** Cumulative gains: share of high-risk lots captured when flagging the top k % by score. */
export function gainsCurve(scores: ArrayLike<number>, labels: boolean[], steps = 20) {
  const idx = Array.from({ length: labels.length }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const P = labels.filter(Boolean).length;
  const out = [{ share: 0, captured: 0 }];
  for (let s = 1; s <= steps; s++) {
    const k = Math.round((s / steps) * idx.length);
    let c = 0;
    for (let i = 0; i < k; i++) if (labels[idx[i]]) c++;
    out.push({ share: s / steps, captured: c / P });
  }
  return out;
}

/** AUC and morbidity calibration within each yard (subgroup performance / fairness across operations). */
export function subgroupMetrics(scores: ArrayLike<number>, lots: EvalLot[]) {
  const groups = Array.from(new Set(lots.map((l) => l.yardId)));
  return groups.map((g) => {
    const idx = lots.map((l, i) => (l.yardId === g ? i : -1)).filter((i) => i >= 0);
    const labels = lots.map((l) => l.highRisk);
    const head = idx.reduce((s, i) => s + lots[i].head, 0);
    return {
      group: g,
      lots: idx.length,
      positives: idx.filter((i) => labels[i]).length,
      auc: aucOf(scores, labels, idx),
      predicted: idx.reduce((s, i) => s + scores[i] * lots[i].head, 0) / head,
      observed: idx.reduce((s, i) => s + lots[i].cases, 0) / head,
    };
  });
}

/** Head-weighted calibration by decile of predicted risk. */
export function calibrationDeciles(scores: ArrayLike<number>, lots: EvalLot[], bins = 10) {
  const order = lots.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  return Array.from({ length: bins }, (_, d) => {
    const ids = order.slice(Math.floor((d * order.length) / bins), Math.floor(((d + 1) * order.length) / bins));
    const head = ids.reduce((s, i) => s + lots[i].head, 0);
    return {
      predicted: ids.reduce((s, i) => s + scores[i] * lots[i].head, 0) / head,
      observed: ids.reduce((s, i) => s + lots[i].cases, 0) / head,
      n: ids.length,
    };
  });
}

/** ROC points for charting (down-sampled). */
export function rocCurve(scores: ArrayLike<number>, labels: boolean[]) {
  const idx = Array.from({ length: labels.length }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const P = labels.filter(Boolean).length;
  const N = labels.length - P;
  let tp = 0;
  let fp = 0;
  const pts = [{ fpr: 0, tpr: 0 }];
  for (const i of idx) {
    if (labels[i]) tp++;
    else fp++;
    pts.push({ fpr: fp / N, tpr: tp / P });
  }
  const step = Math.max(1, Math.floor(pts.length / 90));
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
}
