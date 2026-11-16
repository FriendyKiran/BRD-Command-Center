/**
 * MODEL LAB BUILD: validates every risk-model family on the same temporal holdout, runs 5-fold
 * cross-validation and learning curves, and writes src/data/generated/evaluation.json, which the
 * Model Lab page turns into ROC/PR/calibration/decision curves, bootstrap CIs and threshold tables.
 * Usage: npm run zoo   (after npm run generate)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aucOf } from "../src/engine/evaluation";
import { featurize } from "../src/engine/features";
import { binomDeviance, etaOf, validate } from "../src/engine/model";
import { invLogit, mulberry32 } from "../src/engine/rng";
import type { HistoricalLot } from "../src/engine/types";
import { MODEL_SPECS, trainKind, VALIDATION_OPTIONS } from "../src/engine/zoo";

const ROOT = join(import.meta.dirname, "..");
const SPLIT = "2025-01-01";
const CUTOFF = 0.15;
const history = JSON.parse(readFileSync(join(ROOT, "src/data/generated/history.json"), "utf8")) as HistoricalLot[];
const test = history.filter((l) => l.arrivalDate >= SPLIT);
const train = history.filter((l) => l.arrivalDate < SPLIT);

const score = (m: ReturnType<typeof trainKind>, lots: HistoricalLot[]) =>
  lots.map((l) => invLogit(etaOf(m, featurize(l, l.metaphylaxisGiven ? (l.metaphylaxisDrug as "premium" | "economy") : "none"))));
const hiRisk = (lots: HistoricalLot[]) => lots.map((l) => l.morbidity45 >= CUTOFF);

// 5-fold cross-validation (random folds, seeded) — complements the temporal holdout.
const rng = mulberry32(5150);
const fold = history.map(() => Math.floor(rng() * 5));

const models = MODEL_SPECS.map((s) => {
  const opts = VALIDATION_OPTIONS[s.kind] ?? {};
  const t0 = performance.now();
  const { model, metrics } = validate(history, SPLIT, CUTOFF, (t) => trainKind(s.kind, t, opts));
  const ms = performance.now() - t0;
  const cv = [0, 1, 2, 3, 4].map((k) => {
    const tr = history.filter((_, i) => fold[i] !== k);
    const te = history.filter((_, i) => fold[i] === k);
    const m = trainKind(s.kind, tr, { ...opts, bootstraps: 2 });
    const sc = score(m, te);
    return { fold: k + 1, auc: aucOf(sc, hiRisk(te)), logLoss: binomDeviance(sc, te) };
  });
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = (xs: number[]) => Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1));
  // Learning curve: train on a random fraction of the pre-2025 lots, score the 2025 holdout.
  const lc = s.kind === "stack" ? [] : [0.1, 0.25, 0.5, 0.75, 1].map((f) => {
    const r = mulberry32(77);
    const sub = f === 1 ? train : train.filter(() => r() < f);
    const m = trainKind(s.kind, sub, { ...opts, bootstraps: 2 });
    const sc = score(m, test);
    return { fraction: f, lots: sub.length, auc: aucOf(sc, hiRisk(test)), logLoss: binomDeviance(sc, test) };
  });
  console.log(`${s.kind.padEnd(7)} holdout AUC ${metrics.auc.toFixed(3)} · CV AUC ${mean(cv.map((c) => c.auc)).toFixed(3)} ± ${sd(cv.map((c) => c.auc)).toFixed(3)} · ${(ms / 1000).toFixed(1)} s`);
  return {
    kind: s.kind,
    trainMs: model.trainMs,
    hyper: model.hyper,
    concentration: model.concentration,
    metrics,
    cv: { folds: cv, aucMean: mean(cv.map((c) => c.auc)), aucSd: sd(cv.map((c) => c.auc)), logLossMean: mean(cv.map((c) => c.logLoss)) },
    learningCurve: lc,
    tree: s.kind === "tree" ? model.trees!.point : undefined,
  };
});

const out = {
  split: SPLIT,
  cutoff: CUTOFF,
  trainLots: train.length,
  test: test.map((l) => ({ lotId: l.lotId, yardId: l.yardId, head: l.head, cases: l.brdTreated45, morbidity: l.morbidity45, highRisk: l.morbidity45 >= CUTOFF, buyer: l.buyerHighRisk })),
  models,
};
writeFileSync(join(ROOT, "src/data/generated/evaluation.json"), JSON.stringify(out));
console.log("wrote src/data/generated/evaluation.json");
