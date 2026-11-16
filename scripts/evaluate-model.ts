/**
 * POLICY BACKTEST (decision-quality evaluation, not just prediction accuracy).
 * 1. Train the risk model on arrivals before 2025-01-01 only.
 * 2. For every 2025 arrival, let the tool recommend an option using arrival-day information and the
 *    dashboard's DEFAULT assumptions.
 * 3. Score every policy's choice against the hidden truth from the generator (data/truth_audit_only.json):
 *    each lot's true BRD incidence AND its true response to each metaphylaxis class.
 * 4. Robustness: re-score the same choices in "worlds" where the tool's assumptions are wrong (weaker or
 *    stronger drugs, cheaper or dearer BRD cases, drug prices, market prices, surveillance, missed-case
 *    mortality). The tool is never told which world it is in.
 * 5. Stewardship default: derive the smallest $/regimen weight at which the tool's own expected antimicrobial
 *    use is no higher than the yards' SOPs, using pre-2025 lots only.
 * Writes src/data/generated/backtest.json (shown in the Model Lab) and prints a summary.
 * Usage: npm run evaluate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assessLot } from "../src/engine/assess";
import { PRICE_PRESETS } from "../src/engine/economics";
import { trainModel, type FittedModel } from "../src/engine/model";
import { DEFAULT_PARAMS, type Params } from "../src/engine/params";
import { makeDraws, simulateStrategy } from "../src/engine/simulate";
import type { TruthRecord } from "../src/engine/generator";
import type { HistoricalLot, RiskPrediction, Strategy } from "../src/engine/types";
import { STRATEGIES, STRATEGY_INDEX, statusQuoStrategy, YARD_INDEX } from "../src/engine/yards";
import { MODEL_SPECS, trainKind, VALIDATION_OPTIONS } from "../src/engine/zoo";

const ROOT = join(import.meta.dirname, "..");
const history = JSON.parse(readFileSync(join(ROOT, "src/data/generated/history.json"), "utf8")) as HistoricalLot[];
const truth = new Map((JSON.parse(readFileSync(join(ROOT, "data/truth_audit_only.json"), "utf8")) as TruthRecord[]).map((t) => [t.lotId, t]));

const train = history.filter((l) => l.arrivalDate < "2025-01-01");
const test = history.filter((l) => l.arrivalDate >= "2025-01-01");
const model = trainModel(train, { bootstraps: 20 });
const P: Params = DEFAULT_PARAMS;
const DRAWS = 200;
console.time("backtest");

// ── Stewardship default: smallest weight with expected antimicrobial use ≤ SOP (pre-2025 lots, model's own predictions) ──
const derivLots = train.filter((l) => l.arrivalDate >= "2024-01-01");
function expectedUse(lambda: number) {
  let tool = 0;
  let sop = 0;
  for (const lot of derivLots) {
    const a = assessLot(model, { ...lot, status: "scheduled" }, { ...P, amuPenalty: lambda }, { voi: false, draws: DRAWS });
    tool += a.best.metaphylaxisRegimens + a.best.therapeuticRegimens;
    sop += a.statusQuo.metaphylaxisRegimens + a.statusQuo.therapeuticRegimens;
  }
  return { lambda, toolRegimens: tool, sopRegimens: sop };
}
const derivation = [0, 1, 2, 3, 4, 5, 6, 8, 10].map(expectedUse);
const derived = derivation.find((d) => d.toolRegimens <= d.sopRegimens)?.lambda ?? 10;
console.log(`stewardship weight derived from ${derivLots.length} lots of 2024: $${derived}/regimen (default in params.ts: $${P.amuPenalty})`);
if (derived !== P.amuPenalty) console.warn(`!! params.ts amuPenalty (${P.amuPenalty}) differs from the derived value (${derived}); update it.`);

// ── Worlds: how the truth may differ from the tool's assumptions ──
type Lot = HistoricalLot;
interface World {
  id: string;
  label: string;
  detail: string;
  params?: Partial<Params>;
  /** Transform of each lot's true risk ratio (1 = no effect). */
  rr?: (rr: number) => number;
}
const weaker = (k: number) => (rr: number) => Math.min(1, 1 - (1 - rr) * k);
const WORLDS: World[] = [
  { id: "base", label: "As assumed (base case)", detail: "Default economics; each lot's true risk and true drug response from the generator." },
  { id: "rrWeak", label: "Metaphylaxis 30 % less effective", detail: "Each lot's risk reduction from either drug class is 30 % smaller than in the truth file.", rr: weaker(0.7) },
  { id: "rrStrong", label: "Metaphylaxis 30 % more effective", detail: "Each lot's risk reduction is 30 % larger.", rr: weaker(1.3) },
  { id: "caseHalf", label: "BRD case costs half as much", detail: "Lost value per case $75.59 instead of $151.18.", params: { lostValuePerCase: P.lostValuePerCase / 2 } },
  { id: "caseDouble", label: "BRD case costs twice as much", detail: "Lost value per case $302.36.", params: { lostValuePerCase: P.lostValuePerCase * 2 } },
  { id: "drugDear", label: "Drugs 50 % dearer", detail: "Metaphylaxis and treatment costs × 1.5.", params: { metaPremiumCost: P.metaPremiumCost * 1.5, metaEconomyCost: P.metaEconomyCost * 1.5, treatmentCost: P.treatmentCost * 1.5 } },
  { id: "market2025", label: "October 2025 market prices", detail: "USDA ERS feeder and fed-cattle prices instead of Weber's simulation prices.", params: { ...PRICE_PRESETS.ers2025.values } },
  { id: "survWeak", label: "Enhanced surveillance barely helps", detail: "Detection 70 % (not 80 %) and almost no case-fatality benefit (× 0.95).", params: { sensEnhanced: 0.7, earlyTreatmentCfrFactor: 0.95 } },
  { id: "missedDeadly", label: "Missed cases twice as deadly", detail: "Case fatality of undetected cases 20 % instead of 10 %.", params: { cfrUndetected: 0.2 } },
  {
    id: "pessimistic",
    label: "Pessimistic for metaphylaxis",
    detail: "Drugs 30 % less effective, cases half as costly and drugs 50 % dearer, all at once.",
    rr: weaker(0.7),
    params: { lostValuePerCase: P.lostValuePerCase / 2, metaPremiumCost: P.metaPremiumCost * 1.5, metaEconomyCost: P.metaEconomyCost * 1.5, treatmentCost: P.treatmentCost * 1.5 },
  },
];

/** Outcome of every option for one lot in one world (simulated against the lot's true risk and response). */
function scoreAll(lot: Lot, w: World) {
  const t = truth.get(lot.lotId)!;
  const rr = w.rr ?? ((x: number) => x);
  const Pw: Params = { ...P, ...w.params, metaPremiumRR: rr(t.rrPremiumTrue), metaEconomyRR: rr(t.rrEconomyTrue), metaRRUncertainty: 0 };
  const risk: RiskPrediction = { mean: Math.min(0.95, t.trueIncidenceNoMeta * Pw.sensStandard), p10: 0, p90: 0, concentration: 1e6, probHighRisk: 0, contributions: [], ood: [], missing: [] };
  const draws = makeDraws(risk, Pw, 300, 99);
  const out: Record<string, { value: number; regimens: number; deaths: number; cases: number }> = {};
  for (const s of STRATEGIES) {
    const r = simulateStrategy({ ...lot, status: "scheduled" }, draws, s, Pw);
    out[s.id] = { value: r.lotValue.mean, regimens: r.metaphylaxisRegimens + r.therapeuticRegimens, deaths: r.deaths, cases: r.trueIncidence.mean * lot.head };
  }
  return out;
}

// ── Choices: made once, with default assumptions and arrival-day information only ──
type Policy = "tool" | "toolEconomic" | "statusQuo" | "blanket" | "none" | "buyerFlag" | "oracle";
const choose = (m: FittedModel, lot: Lot, lambda: number) => assessLot(m, { ...lot, status: "scheduled" }, { ...P, amuPenalty: lambda }, { voi: false, draws: DRAWS }).best.strategy;
const choices = test.map((lot) => ({
  lot,
  c: {
    tool: choose(model, lot, P.amuPenalty),
    toolEconomic: choose(model, lot, 0),
    statusQuo: statusQuoStrategy(YARD_INDEX[lot.yardId], lot),
    blanket: STRATEGY_INDEX["prem-std"],
    none: STRATEGY_INDEX["none-std"],
    buyerFlag: lot.buyerHighRisk ? STRATEGY_INDEX["prem-std"] : STRATEGY_INDEX["none-std"],
  } as Record<Exclude<Policy, "oracle">, Strategy>,
}));
const head = test.reduce((s, l) => s + l.head, 0);
const agree = choices.filter((x) => x.c.tool.id === x.c.statusQuo.id).length;

// Pre-score every option in every world once; policies then just look up their choice.
const scored = WORLDS.map((w) => choices.map((x) => scoreAll(x.lot, w)));
type Tot = { value: number; regimens: number; deaths: number; cases: number };
const zero = (): Tot => ({ value: 0, regimens: 0, deaths: 0, cases: 0 });
function totals(wi: number) {
  const t = { tool: zero(), toolEconomic: zero(), statusQuo: zero(), blanket: zero(), none: zero(), buyerFlag: zero(), oracle: zero() } as Record<Policy, Tot>;
  choices.forEach((x, i) => {
    const s = scored[wi][i];
    const add = (p: Policy, id: string) => {
      t[p].value += s[id].value;
      t[p].regimens += s[id].regimens;
      t[p].deaths += s[id].deaths;
      t[p].cases += s[id].cases;
    };
    for (const p of Object.keys(x.c) as Exclude<Policy, "oracle">[]) add(p, x.c[p].id);
    // Perfect information: the most valuable option for this lot in this world (an upper bound no real tool can reach).
    add("oracle", Object.entries(s).sort((a, b) => b[1].value - a[1].value)[0][0]);
  });
  return t;
}
const row = (p: Policy, t: Record<Policy, Tot>) => ({
  policy: p,
  valuePerHead: t[p].value / head,
  deltaPerHead: (t[p].value - t.statusQuo.value) / head,
  regimensPer100: (t[p].regimens / head) * 100,
  bRdMortalityPct: (t[p].deaths / head) * 100,
  incidencePct: (t[p].cases / head) * 100,
});

const base = totals(0);
const POLICIES: Policy[] = ["statusQuo", "blanket", "none", "buyerFlag", "toolEconomic", "tool", "oracle"];
const rows = POLICIES.map((p) => row(p, base));
console.log(`2025 holdout: ${test.length} lots, ${head} head; tool agrees with SOP on ${((agree / test.length) * 100).toFixed(0)} % of lots`);
console.table(rows.map((r) => ({ policy: r.policy, dPerHead: r.deltaPerHead.toFixed(2), regimensPer100: r.regimensPer100.toFixed(1), mortalityPct: r.bRdMortalityPct.toFixed(2), incidencePct: r.incidencePct.toFixed(1) })));

const stress = WORLDS.map((w, wi) => {
  const t = totals(wi);
  const r = POLICIES.map((p) => row(p, t));
  const get = (p: Policy) => r.find((x) => x.policy === p)!;
  const gap = get("oracle").deltaPerHead;
  return {
    id: w.id,
    label: w.label,
    detail: w.detail,
    rows: r,
    /** Share of the perfect-information gain over the SOP that the tool captures. */
    captured: gap > 0 ? get("tool").deltaPerHead / gap : null,
    toolBeatsSop: get("tool").deltaPerHead > 0,
    toolUsesLessAmu: get("tool").regimensPer100 <= get("statusQuo").regimensPer100,
    toolFewerDeaths: get("tool").bRdMortalityPct <= get("statusQuo").bRdMortalityPct,
  };
});
console.table(
  stress.map((s) => {
    const g = (p: Policy) => s.rows.find((x) => x.policy === p)!;
    return {
      world: s.id,
      tool: g("tool").deltaPerHead.toFixed(2),
      toolEcon: g("toolEconomic").deltaPerHead.toFixed(2),
      buyer: g("buyerFlag").deltaPerHead.toFixed(2),
      blanket: g("blanket").deltaPerHead.toFixed(2),
      oracle: g("oracle").deltaPerHead.toFixed(2),
      captured: s.captured == null ? "—" : `${(s.captured * 100).toFixed(0)}%`,
      amu: `${g("tool").regimensPer100.toFixed(0)} vs ${g("statusQuo").regimensPer100.toFixed(0)}`,
      deaths: `${g("tool").bRdMortalityPct.toFixed(2)} vs ${g("statusQuo").bRdMortalityPct.toFixed(2)}`,
    };
  }),
);

// Per yard (base world, default tool vs SOP).
const byYard: Record<string, { head: number; tool: number; sq: number; toolAmu: number; sqAmu: number }> = {};
choices.forEach((x, i) => {
  const y = (byYard[x.lot.yardId] ??= { head: 0, tool: 0, sq: 0, toolAmu: 0, sqAmu: 0 });
  const s = scored[0][i];
  y.head += x.lot.head;
  y.tool += s[x.c.tool.id].value;
  y.sq += s[x.c.statusQuo.id].value;
  y.toolAmu += s[x.c.tool.id].regimens;
  y.sqAmu += s[x.c.statusQuo.id].regimens;
});
const yards = Object.entries(byYard).map(([id, y]) => ({ yard: id, deltaPerHead: (y.tool - y.sq) / y.head, amuChangePct: ((y.toolAmu - y.sqAmu) / y.sqAmu) * 100 }));
console.table(yards);

// Stewardship frontier (base world): the tool re-run with increasing $ weight per antimicrobial regimen.
const baseIndex = new Map(choices.map((x, i) => [x.lot.lotId, i]));
function scorePolicy(pick: (lot: Lot) => Strategy) {
  let v = 0, reg = 0, d = 0, same = 0;
  for (const x of choices) {
    const s = pick(x.lot);
    const o = scored[0][baseIndex.get(x.lot.lotId)!][s.id];
    v += o.value; reg += o.regimens; d += o.deaths;
    if (s.id === x.c.statusQuo.id) same++;
  }
  return { delta: (v - base.statusQuo.value) / head, valuePerHead: v / head, regimensPer100: (reg / head) * 100, mortalityPct: (d / head) * 100, agreement: same / test.length };
}
const frontier = [...new Set([0, 2, P.amuPenalty, 5, 10, 20, 35, 60])].sort((a, b) => a - b).map((pen) => {
  const r = scorePolicy((lot) => choose(model, lot, pen));
  return { amuPenalty: pen, valuePerHead: r.valuePerHead, regimensPer100: r.regimensPer100, mortalityPct: r.mortalityPct };
});
console.table(frontier.map((f) => ({ ...f, valuePerHead: f.valuePerHead.toFixed(2), regimensPer100: f.regimensPer100.toFixed(1), mortalityPct: f.mortalityPct.toFixed(2) })));

// Decision quality by risk model (base world), with no stewardship weight and with the default.
const models = MODEL_SPECS.map((s) => {
  const m = s.kind === "logit" ? model : trainKind(s.kind, train, VALIDATION_OPTIONS[s.kind] ?? {});
  const econ = scorePolicy((lot) => choose(m, lot, 0));
  const def = scorePolicy((lot) => choose(m, lot, P.amuPenalty));
  return {
    kind: s.kind,
    value0: econ.delta, regimens0: econ.regimensPer100, mortality0: econ.mortalityPct, agreement0: econ.agreement,
    valueDef: def.delta, regimensDef: def.regimensPer100, mortalityDef: def.mortalityPct, agreementDef: def.agreement,
  };
});
console.table(models.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? v.toFixed(2) : v]))));
console.timeEnd("backtest");

writeFileSync(
  join(ROOT, "src/data/generated/backtest.json"),
  JSON.stringify(
    {
      lots: test.length,
      head,
      agreement: agree / test.length,
      amuPenalty: P.amuPenalty,
      policies: rows,
      yards,
      frontier,
      models,
      stress,
      stewardship: { derived, lots: derivLots.length, derivation },
      strategies: STRATEGIES.length,
      note: "Scored against the hidden generator truth (each lot's true risk and true drug response); model trained on pre-2025 arrivals only.",
    },
    null,
    1,
  ),
);
