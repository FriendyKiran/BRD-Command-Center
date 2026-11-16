import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { overview, qualityChecks, ratio, riskProfiles, spearmanMatrix } from "./eda";
import { aucOf, bootstrapAuc, calibrationFit, decisionCurve, prCurve, thresholdStats } from "./evaluation";
import { generateData } from "./generator";
import { etaOf, groupContributions, predictRisk, validate } from "./model";
import { featurize } from "./features";
import type { WeatherData } from "./weather";
import { MODEL_SPECS, trainKind } from "./zoo";

const weather = JSON.parse(readFileSync(join(import.meta.dirname, "../data/generated/weather.json"), "utf8")) as WeatherData;
const data = generateData(weather);
const train = data.history.filter((l) => l.arrivalDate < "2025-01-01");
const test = data.history.filter((l) => l.arrivalDate >= "2025-01-01");

describe("model zoo", () => {
  const models = Object.fromEntries(MODEL_SPECS.map((s) => [s.kind, trainKind(s.kind, train, { bootstraps: 3, rounds: 60, trees: 30 })]));
  it.each(MODEL_SPECS.map((s) => s.kind))("%s ranks holdout lots well above chance", (kind) => {
    const m = models[kind];
    const scores = test.map((l) => etaOf(m, featurize(l, l.metaphylaxisGiven ? (l.metaphylaxisDrug as "premium" | "economy") : "none")));
    expect(aucOf(scores, test.map((l) => l.highRisk))).toBeGreaterThan(0.65);
  });
  it("every model gives a coherent risk prediction with an interval", () => {
    const lot = data.current[0];
    for (const m of Object.values(models)) {
      const r = predictRisk(m, lot);
      expect(r.mean).toBeGreaterThan(0);
      expect(r.mean).toBeLessThan(1);
      expect(r.p10).toBeLessThanOrEqual(r.p90);
      expect(r.contributions.length).toBeGreaterThan(5);
    }
  });
  it("ablation explanations equal exact coefficients for linear models", () => {
    const m = models.logit;
    const x = featurize(data.current[3], "none");
    const exact = groupContributions(m, x);
    const ablate = groupContributions({ ...m, components: [m], weights: [1] }, x);
    exact.forEach((e, i) => expect(ablate[i].value).toBeCloseTo(e.value, 8));
  });
  it("the Rojas-predictor model ignores vaccination and source", () => {
    const m = models.rojas;
    const lot = data.current[0];
    const a = predictRisk(m, { ...lot, vaccinated: "no", source: "auction_multi" }).mean;
    const b = predictRisk(m, { ...lot, vaccinated: "yes", source: "preconditioned" }).mean;
    expect(a).toBeCloseTo(b, 10);
  });
  it("validation reports holdout scores and importance for tree models", () => {
    const { metrics } = validate(data.history, "2025-01-01", 0.15, (t) => trainKind("tree", t, { bootstraps: 2 }));
    expect(metrics.scores!.length).toBe(test.length);
    expect(metrics.importance!.length).toBeGreaterThan(8);
    expect(metrics.coefTable.length).toBe(0);
  });
});

describe("evaluation metrics", () => {
  const labels = [true, true, false, false, false, true, false, false];
  const perfect = [0.9, 0.8, 0.1, 0.2, 0.3, 0.7, 0.05, 0.15];
  it("AUC is 1 for a perfect ranking and 0.5 for ties", () => {
    expect(aucOf(perfect, labels)).toBe(1);
    expect(aucOf(perfect.map(() => 0.5), labels)).toBe(0.5);
  });
  it("average precision is 1 for a perfect ranking", () => {
    expect(prCurve(perfect, labels).ap).toBeCloseTo(1, 10);
  });
  it("confusion matrix adds up", () => {
    const s = thresholdStats(perfect, labels, 0.5);
    expect(s.tp + s.fp + s.tn + s.fn).toBe(labels.length);
    expect(s.sensitivity).toBe(1);
  });
  it("decision curve: treat-all net benefit is prevalence at threshold 0", () => {
    expect(decisionCurve(perfect, labels, [1e-9])[0].all).toBeCloseTo(3 / 8, 6);
  });
  it("bootstrap CI brackets the point estimate", () => {
    const b = bootstrapAuc({ a: perfect, b: perfect.map((v, i) => (i % 2 ? v : 1 - v)) }, labels, "a", 200);
    expect(b.a.lo).toBeLessThanOrEqual(1);
    expect(b.b.diff).toBeLessThan(0);
  });
  it("a perfectly calibrated forecast has slope ≈ 1 and intercept ≈ 0", () => {
    const lots = Array.from({ length: 400 }, (_, i) => {
      const p = 0.02 + (i % 20) * 0.01;
      return { lotId: String(i), yardId: "x", head: 10000, cases: Math.round(p * 10000), morbidity: p, highRisk: p >= 0.15, buyer: false };
    });
    const c = calibrationFit(lots.map((l) => l.morbidity), lots);
    expect(c.slope).toBeCloseTo(1, 1);
    expect(Math.abs(c.citl)).toBeLessThan(0.02);
  });
});

describe("EDA", () => {
  it("overview matches the calibration targets", () => {
    const o = overview(data.history);
    expect(o.morbidity).toBeGreaterThan(0.05);
    expect(o.morbidityLo).toBeLessThan(o.morbidity);
  });
  it("ratio CI covers the rate and profiles cover every lot", () => {
    const r = ratio(data.history);
    expect(r.lo).toBeLessThan(r.rate);
    for (const p of riskProfiles(data.history)) expect(p.cells.reduce((s, c) => s + c.lots, 0)).toBe(data.history.length);
  });
  it("integrity checks pass on generated data", () => {
    expect(qualityChecks(data.history).filter((c) => c.severity === "error")).toHaveLength(0);
  });
  it("correlation matrix is symmetric with unit diagonal", () => {
    const m = spearmanMatrix(data.history);
    const get = (a: string, b: string) => m.cells.find((c) => c.a === a && c.b === b)!.rho;
    expect(get("weight", "weight")).toBe(1);
    expect(get("weight", "morbidity")).toBeCloseTo(get("morbidity", "weight"), 10);
    expect(get("weight", "morbidity")).toBeLessThan(0);
  });
});
