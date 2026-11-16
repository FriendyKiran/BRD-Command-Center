import { deathLoss, netReturn } from "./economics";
import type { Params } from "./params";
import { betaMeanConc, binomial, clamp, gammaPmf, mulberry32, quantile, type Rng, uniform } from "./rng";
import type { Distribution, LotArrival, RiskPrediction, Strategy, StrategyResult } from "./types";

export const HORIZON = 45;

/**
 * Per-draw uncertain quantities shared by every strategy (common random numbers), so that
 * differences between strategies reflect the strategy, not Monte Carlo noise.
 */
export interface DrawSet {
  n: number;
  pDet: Float64Array; // detected-scale incidence without metaphylaxis (from risk model)
  rrPremium: Float64Array;
  rrEconomy: Float64Array;
  seeds: Uint32Array;
}

export function makeDraws(risk: RiskPrediction, P: Params, n: number, seed: number): DrawSet {
  const rng = mulberry32(seed);
  const d: DrawSet = { n, pDet: new Float64Array(n), rrPremium: new Float64Array(n), rrEconomy: new Float64Array(n), seeds: new Uint32Array(n) };
  for (let i = 0; i < n; i++) {
    d.pDet[i] = betaMeanConc(rng, risk.mean, risk.concentration);
    d.rrPremium[i] = clamp(uniform(rng, P.metaPremiumRR - P.metaRRUncertainty, P.metaPremiumRR + P.metaRRUncertainty), 0.02, 1.2);
    d.rrEconomy[i] = clamp(uniform(rng, P.metaEconomyRR - P.metaRRUncertainty, P.metaEconomyRR + P.metaRRUncertainty), 0.02, 1.2);
    d.seeds[i] = (rng() * 4294967296) >>> 0;
  }
  return d;
}

export interface SimContext {
  /** Share of the lot's 45-day cases still ahead (1 for scheduled arrivals). */
  remainingFrac: number;
  /** Days on feed when the strategy starts (0 for arrivals). */
  startDay: number;
  /** Cases already treated (on-feed lots). */
  casesSoFar: number;
  /** Metaphylaxis already given at processing (on-feed lots). */
  priorMeta: boolean;
}

export const ARRIVAL_CONTEXT: SimContext = { remainingFrac: 1, startDay: 0, casesSoFar: 0, priorMeta: false };

const dist = (xs: Float64Array): Distribution => {
  const s = Float64Array.from(xs).sort();
  let m = 0;
  for (let i = 0; i < s.length; i++) m += s[i];
  return { mean: m / s.length, p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9) };
};

export function simulateStrategy(lot: LotArrival, draws: DrawSet, strategy: Strategy, P: Params, ctx: SimContext = ARRIVAL_CONTEXT): StrategyResult {
  const N = lot.head;
  const n = draws.n;
  const sens = strategy.surveillance === "enhanced" ? P.sensEnhanced : P.sensStandard;
  const cfrT = P.cfrTreated * (strategy.surveillance === "enhanced" ? P.earlyTreatmentCfrFactor : 1);
  const steer = lot.sex === "steer" || lot.sex === "bull";
  const base = netReturn({ placementWt: lot.weightLb, steer, trt1: 0, trt2: 0, trt3: 0, mortality: P.otherMortality }, P);
  const lossDeath = deathLoss(base, P);

  const morb = new Float64Array(n);
  const inc = new Float64Array(n);
  const mort = new Float64Array(n);
  const netH = new Float64Array(n);
  const lotV = new Float64Array(n);
  const amu = new Float64Array(n);
  const objective = new Float64Array(n);
  const treatCounts = new Float64Array(n);
  let metaDosesTot = 0;
  let therTot = 0;
  let premDosesTot = 0;

  for (let i = 0; i < n; i++) {
    const rng: Rng = mulberry32(draws.seeds[i]);
    const pTrue = clamp(draws.pDet[i] / P.sensStandard, 0, 0.95);
    let rr = 1;
    let metaDoses = 0;
    let premDoses = 0;
    let screenHead = 0;
    if (strategy.antimicrobial === "metaphylaxis-premium") {
      rr = draws.rrPremium[i];
      metaDoses = N;
      premDoses = N;
    } else if (strategy.antimicrobial === "metaphylaxis-economy") {
      rr = draws.rrEconomy[i];
      metaDoses = N;
    } else if (strategy.antimicrobial === "targeted-screen") {
      const febrile = clamp(0.04 + 0.55 * pTrue, 0.02, 0.6);
      const rrF = P.febrileCaseEnrichment;
      const caseShare = (febrile * rrF) / (febrile * rrF + 1 - febrile);
      rr = 1 - caseShare * (1 - draws.rrPremium[i]);
      metaDoses = Math.round(febrile * N);
      premDoses = metaDoses;
      screenHead = N;
    }
    // Late metaphylaxis on an on-feed lot only protects cases still ahead.
    const pAhead = pTrue * ctx.remainingFrac * (ctx.priorMeta && strategy.antimicrobial !== "none" ? Math.max(rr, 0.85) : rr);
    const aheadCases = binomial(rng, N, clamp(pAhead, 0, 1));
    const priorTrue = ctx.casesSoFar / Math.max(0.01, P.sensStandard);
    const cases = aheadCases + priorTrue;
    const detAhead = binomial(rng, aheadCases, sens);
    const detected = detAhead + ctx.casesSoFar;
    const r2 = binomial(rng, detected, P.retreatRate2);
    const r3 = binomial(rng, r2, P.retreatRate3);
    const deaths = binomial(rng, detAhead, cfrT) + binomial(rng, aheadCases - detAhead, P.cfrUndetected) + Math.round(ctx.casesSoFar * P.cfrTreated);
    const missedSurvivors = Math.max(0, aheadCases - detAhead - deaths);
    const diseaseLoss =
      detected * P.lostValuePerCase +
      r2 * P.retreatCost2 +
      r3 * P.retreatCost3 +
      missedSurvivors * (P.lostValuePerCase - P.treatmentCost) * P.missedCaseLossShare +
      deaths * lossDeath;
    const drug = strategy.antimicrobial === "metaphylaxis-premium" || strategy.antimicrobial === "targeted-screen" ? P.metaPremiumCost : P.metaEconomyCost;
    const extra =
      (metaDoses * drug + screenHead * P.screenCostPerHead) / N +
      (riderHoursTotal(strategy, N, P, ctx.startDay) * P.laborCostPerHour) / N -
      (riderHoursTotal({ ...strategy, surveillance: "standard" }, N, P, ctx.startDay) * P.laborCostPerHour) / N;
    const regimens = metaDoses + detected + r2 + r3;
    morb[i] = detected / N;
    inc[i] = cases / N;
    mort[i] = deaths / N;
    netH[i] = base.net - diseaseLoss / N - extra;
    lotV[i] = netH[i] * N;
    amu[i] = (regimens / N) * 100;
    objective[i] = lotV[i] - P.amuPenalty * regimens - P.deathPenalty * deaths;
    treatCounts[i] = detAhead + r2 + r3;
    metaDosesTot += metaDoses;
    premDosesTot += premDoses;
    therTot += detected + r2 + r3;
  }

  const metaR = metaDosesTot / n;
  const therR = therTot / n;
  const premR = premDosesTot / n;
  const { curve, curveP90 } = hospitalCurves(treatCounts, strategy, P, ctx);
  const riders = Array.from({ length: HORIZON + 1 }, (_, d) => (d < ctx.startDay ? 0 : riderHoursPerDay(strategy, N, P, d)));
  const chuteMin =
    strategy.antimicrobial === "targeted-screen"
      ? N * P.chuteMinPerHeadScreen + metaR * P.chuteMinPerHeadMeta
      : strategy.antimicrobial.startsWith("metaphylaxis")
        ? N * P.chuteMinPerHeadMeta * (ctx.startDay > 0 ? 4 : 1) // re-gathering cattle on feed costs more chute time
        : 0;
  const morbidity = dist(morb);
  let objSum = 0;
  for (let i = 0; i < n; i++) objSum += objective[i];
  const mortality = dist(mort);
  return {
    strategy,
    head: N,
    morbidity,
    trueIncidence: dist(inc),
    mortality,
    netReturnPerHead: dist(netH),
    lotValue: dist(lotV),
    directCostPerHead:
      ((strategy.antimicrobial === "metaphylaxis-economy" ? P.metaEconomyCost : P.metaPremiumCost) * metaR) / N +
      (strategy.antimicrobial === "targeted-screen" ? P.screenCostPerHead : 0) +
      (morbidity.mean * N * (1 + P.retreatRate2) * P.treatmentCost) / N,
    amuRegimensPer100: dist(amu),
    metaphylaxisRegimens: metaR,
    therapeuticRegimens: therR,
    criticallyImportantShare: (premR + P.ciaShareTherapeutic * therR) / Math.max(1e-9, metaR + therR),
    hospitalCurve: curve,
    hospitalCurveP90: curveP90,
    riderHoursPerDay: riders,
    chuteHours: chuteMin / 60,
    draws: objective,
    objective: objSum / n,
    deaths: mortality.mean * N,
  };
}

function riderHoursPerDay(s: Strategy, N: number, P: Params, d: number) {
  const enhanced = s.surveillance === "enhanced" && d < 28;
  return (N / 1000) * (enhanced ? P.riderHoursPer1000Enh : P.riderHoursPer1000Std);
}

function riderHoursTotal(s: Strategy, N: number, P: Params, startDay: number) {
  let t = 0;
  for (let d = startDay; d <= HORIZON; d++) t += riderHoursPerDay(s, N, P, d);
  return t;
}

function hospitalCurves(treatCounts: Float64Array, s: Strategy, P: Params, ctx: SimContext) {
  const shift = s.antimicrobial.startsWith("metaphylaxis") ? Math.round(P.metaOnsetDelay) : s.antimicrobial === "targeted-screen" ? Math.round(P.metaOnsetDelay / 2) : 0;
  const pmf = gammaPmf(P.onsetShape, P.onsetScale, HORIZON);
  const onset = new Array(HORIZON + 1).fill(0);
  for (let d = 0; d <= HORIZON; d++) {
    const day = Math.max(ctx.startDay, d + (ctx.startDay > 0 ? 0 : shift));
    if (day <= HORIZON && d >= (ctx.startDay > 0 ? ctx.startDay : 0)) onset[day] += pmf[d];
  }
  const tot = onset.reduce((a, b) => a + b, 0) || 1;
  const sorted = Float64Array.from(treatCounts).sort();
  let meanT = 0;
  for (const v of treatCounts) meanT += v / treatCounts.length;
  const p90T = quantile(sorted, 0.9);
  const stay = Math.max(1, Math.round(P.hospitalDaysPerTreatment));
  const curve = new Array(HORIZON + 1).fill(0);
  for (let d = 0; d <= HORIZON; d++) {
    const w = onset[d] / tot;
    for (let k = 0; k < stay && d + k <= HORIZON; k++) curve[d + k] += w * meanT;
  }
  const scale = meanT > 0 ? p90T / meanT : 1;
  // On-feed lots: cattle pulled in the last few days are still in the hospital pens today.
  const existing = new Array(HORIZON + 1).fill(0);
  if (ctx.startDay > 0 && ctx.casesSoFar > 0) {
    const pShift = ctx.priorMeta ? Math.round(P.metaOnsetDelay) : 0;
    let seen = 0;
    for (let d = 0; d < ctx.startDay; d++) seen += d - pShift >= 0 ? pmf[d - pShift] : 0;
    for (let d = Math.max(0, ctx.startDay - stay + 1); d < ctx.startDay; d++) {
      const w = d - pShift >= 0 && seen > 0 ? pmf[d - pShift] / seen : 0;
      for (let k = ctx.startDay; k < d + stay && k <= HORIZON; k++) existing[k] += w * ctx.casesSoFar;
    }
  }
  return { curve: curve.map((v, d) => v + existing[d]), curveP90: curve.map((v, d) => v * scale + existing[d]) };
}
