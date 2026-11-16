import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assessLot, fieldPriors } from "./assess";
import { netReturn } from "./economics";
import { FEATURES } from "./features";
import { generateData } from "./generator";
import { predictRisk, trainModel, updateWithObserved } from "./model";
import { planPortfolio, yardCapacities } from "./optimize";
import { DEFAULT_PARAMS as P } from "./params";
import { binomial, gammaPmf, mulberry32 } from "./rng";
import type { WeatherData } from "./weather";
import { YARD_INDEX } from "./yards";

const weather = JSON.parse(readFileSync(join(import.meta.dirname, "../data/generated/weather.json"), "utf8")) as WeatherData;
const data = generateData(weather);
const model = trainModel(data.history, { bootstraps: 8 });

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("binomial mean is close to n·p", () => {
    const r = mulberry32(3);
    let s = 0;
    for (let i = 0; i < 4000; i++) s += binomial(r, 200, 0.12);
    expect(s / 4000).toBeGreaterThan(22.5);
    expect(s / 4000).toBeLessThan(25.5);
  });
  it("onset pmf sums to one", () => {
    expect(gammaPmf(2.2, 6, 45).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

describe("synthetic data calibration", () => {
  it("is reproducible", () => {
    expect(generateData(weather).history.length).toBe(data.history.length);
  });
  it("the low-risk yard resembles Rojas et al. 2022 (≈6 % morbidity, ≈11 % high-risk cohorts)", () => {
    const cv = data.history.filter((l) => l.yardId === "cimarron");
    const head = cv.reduce((s, l) => s + l.head, 0);
    const morb = cv.reduce((s, l) => s + l.brdTreated45, 0) / head;
    expect(morb).toBeGreaterThan(0.04);
    expect(morb).toBeLessThan(0.09);
    const hr = cv.filter((l) => l.highRisk).length / cv.length;
    expect(hr).toBeGreaterThan(0.06);
    expect(hr).toBeLessThan(0.16);
  });
});

describe("economics (Weber et al. 2024)", () => {
  it("more treated cattle lower net return when mortality rises with them", () => {
    const healthy = netReturn({ placementWt: 700, steer: true, trt1: 0, trt2: 0, trt3: 0, mortality: 0.01 }, P).net;
    const sick = netReturn({ placementWt: 700, steer: true, trt1: 40, trt2: 10, trt3: 5, mortality: 0.06 }, P).net;
    expect(sick).toBeLessThan(healthy);
  });
});

describe("risk model", () => {
  it("learns literature-consistent directions", () => {
    const names = ["src_auction_multi", "vacc_no", "wean_no", "wt_below", "meta_premium"];
    const c = (n: string) => model.coef[FEATURES.findIndex((f) => f.name === n) + 1];
    expect(c(names[0])).toBeGreaterThan(0);
    expect(c(names[1])).toBeGreaterThan(0);
    expect(c(names[2])).toBeGreaterThan(0);
    expect(c(names[3])).toBeGreaterThan(0);
    expect(c(names[4])).toBeLessThan(0);
  });
  it("lightweight commingled calves score riskier than preconditioned yearlings", () => {
    const base = data.current[0];
    const risky = predictRisk(model, { ...base, weightLb: 420, source: "auction_multi", nSources: 10, vaccinated: "no", weaned: "no" });
    const safe = predictRisk(model, { ...base, weightLb: 820, source: "preconditioned", nSources: 1, vaccinated: "yes", weaned: "yes" });
    expect(risky.mean).toBeGreaterThan(safe.mean * 2);
    expect(risky.p10).toBeLessThan(risky.mean);
    expect(risky.p90).toBeGreaterThan(risky.mean);
  });
  it("updates on-feed risk toward the pulls observed so far", () => {
    const lot = { ...data.current[0], status: "on-feed" as const, daysOnFeed: 20, head: 150 };
    const prior = predictRisk(model, lot);
    const onset = { shape: 2.2, scale: 6, metaDelay: 7, metaGiven: false };
    const expected = prior.mean * 0.8 * lot.head; // ≈ 80 % of cases appear by day 20
    const up = updateWithObserved(prior, { ...lot, casesToDate: Math.round(expected * 1.6) }, 1, onset).risk;
    const down = updateWithObserved(prior, { ...lot, casesToDate: Math.round(expected * 0.4) }, 1, onset).risk;
    expect(up.mean).toBeGreaterThan(prior.mean);
    expect(down.mean).toBeLessThan(prior.mean);
  });
});

describe("decisions", () => {
  const priors = fieldPriors(data.history);
  it("recommends metaphylaxis for a very high-risk lot and not for a very low-risk one", () => {
    const base = { ...data.current.find((l) => l.status === "scheduled")! };
    const hi = assessLot(model, { ...base, weightLb: 400, source: "auction_multi", nSources: 12, vaccinated: "no", weaned: "no", buyerHighRisk: true }, P, { voi: false });
    const lo = assessLot(model, { ...base, weightLb: 850, source: "preconditioned", nSources: 1, vaccinated: "yes", weaned: "yes", buyerHighRisk: false }, P, { voi: false });
    expect(hi.best.strategy.antimicrobial).toMatch(/metaphylaxis/);
    expect(lo.best.strategy.antimicrobial).not.toMatch(/metaphylaxis/);
  });
  it("a stewardship weight reduces antimicrobial regimens", () => {
    const lots = data.current.filter((l) => l.status === "scheduled").slice(0, 25);
    const reg = (amuPenalty: number) =>
      lots.map((l) => assessLot(model, l, { ...P, amuPenalty }, { voi: false, draws: 150 })).reduce((s, a) => s + a.best.metaphylaxisRegimens + a.best.therapeuticRegimens, 0);
    expect(reg(40)).toBeLessThan(reg(0));
  });
  it("the planner respects an antimicrobial cap when one is feasible", () => {
    const as = data.current.filter((l) => l.yardId === "cimarron").map((l) => assessLot(model, l, P, { voi: false, draws: 120, priors }));
    const free = planPortfolio({ assessments: as, snapshot: data.meta.snapshot, days: 60, caps: { ...yardCapacities(YARD_INDEX.cimarron), hospital: 1e6, riderHours: 1e6, chuteHours: 1e6 } });
    const cap = Math.round(free.amu * 0.8);
    const capped = planPortfolio({ assessments: as, snapshot: data.meta.snapshot, days: 60, caps: { hospital: 1e6, riderHours: 1e6, chuteHours: 1e6, amuCap: cap } });
    expect(capped.amu).toBeLessThanOrEqual(cap + 1);
    expect(capped.value).toBeLessThanOrEqual(free.value + 1e-6);
  });
});
