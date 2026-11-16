import { objectiveMean } from "./assess";
import { HORIZON } from "./simulate";
import type { LotAssessment, StrategyResult, Yard } from "./types";

/**
 * PORTFOLIO PLANNER
 * Choose one option per lot to maximise expected value (economics − stewardship/welfare weights)
 * subject to binding yard constraints over the planning calendar:
 *   - hospital-pen head on each day ≤ capacity − baseline occupancy
 *   - pen-rider hours on each day ≤ available hours
 *   - chute hours on each arrival day ≤ available hours
 *   - total antimicrobial regimens ≤ stewardship cap (optional)
 * Method: start from each lot's unconstrained best; while any constraint is violated, apply the swap
 * with the smallest value loss per unit of violation removed (Lagrangian-style greedy repair); then a
 * hill-climbing pass that accepts any feasible improving swap. Shadow prices come from re-solving with
 * +10 % capacity.
 */
export interface Capacities {
  hospital: number; // head available for new BRD cases (capacity − baseline)
  riderHours: number; // per day
  chuteHours: number; // per day
  amuCap: number | null; // total regimens in the plan, null = no cap
}

export interface PlanInput {
  assessments: LotAssessment[];
  snapshot: string;
  days: number;
  caps: Capacities;
  /** Lots whose option is fixed by the manager (lotId → strategyId). */
  locked?: Record<string, string>;
}

export interface PlanResult {
  choice: Record<string, string>;
  value: number;
  statusQuoValue: number;
  hospital: number[];
  hospitalP90: number[];
  riders: number[];
  chute: number[];
  amu: number;
  amuStatusQuo: number;
  deaths: number;
  deathsStatusQuo: number;
  cases: number;
  casesStatusQuo: number;
  feasible: boolean;
  violations: string[];
  calendar: string[];
  hospitalStatusQuo: number[];
  ridersStatusQuo: number[];
}

const DAY = 86400000;

function offset(snapshot: string, date: string) {
  return Math.round((Date.parse(date) - Date.parse(snapshot)) / DAY);
}

function usage(a: LotAssessment, r: StrategyResult, snapshot: string, days: number) {
  const off = offset(snapshot, a.lot.arrivalDate);
  const hosp = new Float64Array(days);
  const hospP90 = new Float64Array(days);
  const ride = new Float64Array(days);
  const chute = new Float64Array(days);
  for (let dof = 0; dof <= HORIZON; dof++) {
    const t = off + dof;
    if (t < 0 || t >= days) continue;
    hosp[t] += r.hospitalCurve[dof];
    hospP90[t] += r.hospitalCurveP90[dof];
    ride[t] += r.riderHoursPerDay[dof];
  }
  const chuteDay = a.lot.status === "on-feed" ? 0 : off;
  if (chuteDay >= 0 && chuteDay < days) chute[chuteDay] += r.chuteHours;
  const regimens = r.metaphylaxisRegimens + r.therapeuticRegimens;
  return { hosp, hospP90, ride, chute, regimens };
}

type Usage = ReturnType<typeof usage>;

export function planPortfolio(input: PlanInput): PlanResult {
  const { assessments, snapshot, days, caps } = input;
  const U: Usage[][] = assessments.map((a) => a.results.map((r) => usage(a, r, snapshot, days)));
  const V: number[][] = assessments.map((a) => a.results.map((r) => objectiveMean(r)));
  const choice = assessments.map((a, i) => {
    const locked = input.locked?.[a.lot.lotId];
    if (locked) {
      const k = a.results.findIndex((r) => r.strategy.id === locked);
      if (k >= 0) return k;
    }
    return V[i].indexOf(Math.max(...V[i]));
  });
  const isLocked = assessments.map((a) => !!input.locked?.[a.lot.lotId]);

  const totals = () => {
    const hosp = new Float64Array(days);
    const ride = new Float64Array(days);
    const chute = new Float64Array(days);
    let amu = 0;
    choice.forEach((k, i) => {
      const u = U[i][k];
      for (let t = 0; t < days; t++) {
        hosp[t] += u.hosp[t];
        ride[t] += u.ride[t];
        chute[t] += u.chute[t];
      }
      amu += u.regimens;
    });
    return { hosp, ride, chute, amu };
  };

  const violation = (T: ReturnType<typeof totals>) => {
    let v = 0;
    for (let t = 0; t < days; t++) {
      v += Math.max(0, T.hosp[t] - caps.hospital) / Math.max(1, caps.hospital);
      v += Math.max(0, T.ride[t] - caps.riderHours) / Math.max(1, caps.riderHours);
      v += Math.max(0, T.chute[t] - caps.chuteHours) / Math.max(1, caps.chuteHours);
    }
    if (caps.amuCap != null) v += (Math.max(0, T.amu - caps.amuCap) / Math.max(1, caps.amuCap)) * 10;
    return v;
  };

  const violationIfSwap = (T: ReturnType<typeof totals>, i: number, k: number) => {
    const from = U[i][choice[i]];
    const to = U[i][k];
    let v = 0;
    for (let t = 0; t < days; t++) {
      v += Math.max(0, T.hosp[t] - from.hosp[t] + to.hosp[t] - caps.hospital) / Math.max(1, caps.hospital);
      v += Math.max(0, T.ride[t] - from.ride[t] + to.ride[t] - caps.riderHours) / Math.max(1, caps.riderHours);
      v += Math.max(0, T.chute[t] - from.chute[t] + to.chute[t] - caps.chuteHours) / Math.max(1, caps.chuteHours);
    }
    if (caps.amuCap != null) v += (Math.max(0, T.amu - from.regimens + to.regimens - caps.amuCap) / Math.max(1, caps.amuCap)) * 10;
    return v;
  };

  // Greedy repair.
  for (let iter = 0; iter < 2000; iter++) {
    const T = totals();
    const v0 = violation(T);
    if (v0 < 1e-9) break;
    let bestMove: [number, number] | null = null;
    let bestRatio = Infinity;
    for (let i = 0; i < assessments.length; i++) {
      if (isLocked[i]) continue;
      for (let k = 0; k < U[i].length; k++) {
        if (k === choice[i]) continue;
        const dv = v0 - violationIfSwap(T, i, k);
        if (dv <= 1e-9) continue;
        const loss = Math.max(0, V[i][choice[i]] - V[i][k]);
        const ratio = loss / dv;
        if (ratio < bestRatio) {
          bestRatio = ratio;
          bestMove = [i, k];
        }
      }
    }
    if (!bestMove) break;
    choice[bestMove[0]] = bestMove[1];
  }

  // Improvement pass: accept value-improving swaps that keep violation from increasing.
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < assessments.length; i++) {
      if (isLocked[i]) continue;
      const T = totals();
      const v0 = violation(T);
      for (let k = 0; k < U[i].length; k++) {
        if (k === choice[i] || V[i][k] <= V[i][choice[i]] + 1) continue;
        if (violationIfSwap(T, i, k) <= v0 + 1e-9) {
          choice[i] = k;
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }

  const T = totals();
  const hospP90 = new Array(days).fill(0);
  choice.forEach((k, i) => U[i][k].hospP90.forEach((v, t) => (hospP90[t] += v)));
  const sqIdx = assessments.map((a) => Math.max(0, a.results.findIndex((r) => r.strategy.id === a.statusQuo.strategy.id)));
  const hospSQ = new Array(days).fill(0);
  const rideSQ = new Array(days).fill(0);
  sqIdx.forEach((k, i) => {
    U[i][k].hosp.forEach((v, t) => (hospSQ[t] += v));
    U[i][k].ride.forEach((v, t) => (rideSQ[t] += v));
  });
  const violations: string[] = [];
  const maxH = Math.max(...T.hosp);
  const maxR = Math.max(...T.ride);
  const maxC = Math.max(...T.chute);
  if (maxH > caps.hospital + 0.5) violations.push(`Hospital pens over capacity on peak day (${maxH.toFixed(0)} vs ${caps.hospital.toFixed(0)} head).`);
  if (maxR > caps.riderHours + 0.1) violations.push(`Pen-rider hours exceed availability on peak day (${maxR.toFixed(1)} vs ${caps.riderHours} h).`);
  if (maxC > caps.chuteHours + 0.1) violations.push(`Chute time exceeds availability on peak arrival day (${maxC.toFixed(1)} vs ${caps.chuteHours} h).`);
  if (caps.amuCap != null && T.amu > caps.amuCap + 0.5) violations.push(`Antimicrobial regimens exceed the stewardship cap (${T.amu.toFixed(0)} vs ${caps.amuCap}).`);

  const sum = (f: (a: LotAssessment, r: StrategyResult) => number, idx: number[]) => idx.reduce((s, k, i) => s + f(assessments[i], assessments[i].results[k]), 0);
  const calendar = Array.from({ length: days }, (_, t) => new Date(Date.parse(snapshot) + t * DAY).toISOString().slice(0, 10));
  return {
    choice: Object.fromEntries(choice.map((k, i) => [assessments[i].lot.lotId, assessments[i].results[k].strategy.id])),
    value: choice.reduce((s, k, i) => s + V[i][k], 0),
    statusQuoValue: sqIdx.reduce((s, k, i) => s + V[i][k], 0),
    hospital: Array.from(T.hosp),
    hospitalP90: hospP90,
    riders: Array.from(T.ride),
    chute: Array.from(T.chute),
    amu: T.amu,
    amuStatusQuo: sqIdx.reduce((s, k, i) => s + U[i][k].regimens, 0),
    deaths: sum((a, r) => r.mortality.mean * a.lot.head, choice),
    deathsStatusQuo: sum((a, r) => r.mortality.mean * a.lot.head, sqIdx),
    cases: sum((a, r) => r.trueIncidence.mean * a.lot.head, choice),
    casesStatusQuo: sum((a, r) => r.trueIncidence.mean * a.lot.head, sqIdx),
    feasible: violations.length === 0,
    violations,
    calendar,
    hospitalStatusQuo: hospSQ,
    ridersStatusQuo: rideSQ,
  };
}

export interface ShadowPrices {
  hospitalPerHead: number;
  riderPerHour: number;
  amuPerRegimen: number | null;
}

/** Marginal value of relaxing each constraint by 10 % ($ per unit). */
export function shadowPrices(input: PlanInput, base: PlanResult): ShadowPrices {
  const c = input.caps;
  const h = planPortfolio({ ...input, caps: { ...c, hospital: c.hospital * 1.1 } });
  const r = planPortfolio({ ...input, caps: { ...c, riderHours: c.riderHours * 1.1 } });
  const a = c.amuCap != null ? planPortfolio({ ...input, caps: { ...c, amuCap: c.amuCap * 1.1 } }) : null;
  return {
    hospitalPerHead: Math.max(0, (h.value - base.value) / Math.max(1, c.hospital * 0.1)),
    riderPerHour: Math.max(0, (r.value - base.value) / Math.max(0.1, c.riderHours * 0.1)),
    amuPerRegimen: a && c.amuCap ? Math.max(0, (a.value - base.value) / Math.max(1, c.amuCap * 0.1)) : null,
  };
}

export function yardCapacities(yard: Yard, amuCap: number | null = null): Capacities {
  return {
    hospital: yard.hospitalPenHead - yard.hospitalBaseline,
    riderHours: yard.riderHoursPerDay,
    chuteHours: yard.chuteHoursPerDay,
    amuCap,
  };
}
