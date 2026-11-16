import { predictRisk, updateWithObserved, type FittedModel } from "./model";
import type { Params } from "./params";
import { gammaPmf, hashSeed } from "./rng";
import { ARRIVAL_CONTEXT, makeDraws, simulateStrategy, type SimContext } from "./simulate";
import type { HistoricalLot, LotArrival, LotAssessment, SourceType, Strategy, StrategyResult, TriState } from "./types";
import { STRATEGIES, STRATEGY_INDEX, statusQuoStrategy, YARD_INDEX } from "./yards";

/** Paired simulations per lot. One shared count so every page (lists, lot page, demo, summary, model consensus) ranks options identically. */
export const DECISION_DRAWS = 400;

export interface AssessOptions {
  draws?: number;
  /** Compute value of information for missing fields (more expensive). */
  voi?: boolean;
  priors?: FieldPriors;
}

/** Empirical distribution of missing fields among KNOWN records, per yard (used for value of information). */
export type FieldPriors = Record<string, { vaccinated: number; weaned: number; source: Record<SourceType, number>; nSources: [number, number][] }>;

export function fieldPriors(history: HistoricalLot[]): FieldPriors {
  const out: FieldPriors = {};
  for (const yard of Object.keys(YARD_INDEX)) {
    const ys = history.filter((l) => l.yardId === yard);
    const vk = ys.filter((l) => l.vaccinated !== "unknown");
    const wk = ys.filter((l) => l.weaned !== "unknown");
    const sk = ys.filter((l) => l.source != null);
    const src = { ranch_direct: 0, preconditioned: 0, auction_single: 0, auction_multi: 0 } as Record<SourceType, number>;
    sk.forEach((l) => (src[l.source as SourceType] += 1 / sk.length));
    const ns = ys.filter((l) => l.nSources != null).map((l) => l.nSources as number);
    const bins: [number, number][] = [
      [1, ns.filter((v) => v <= 1).length / ns.length],
      [3, ns.filter((v) => v > 1 && v <= 4).length / ns.length],
      [9, ns.filter((v) => v > 4).length / ns.length],
    ];
    out[yard] = {
      vaccinated: vk.filter((l) => l.vaccinated === "yes").length / Math.max(1, vk.length),
      weaned: wk.filter((l) => l.weaned === "yes").length / Math.max(1, wk.length),
      source: src,
      nSources: bins,
    };
  }
  return out;
}

/** Options that make sense for a lot depend on whether it is still arriving or already on feed. */
export function candidateStrategies(lot: LotArrival): Strategy[] {
  if (lot.status !== "on-feed") return STRATEGIES;
  const prior = lot.processedWith ? STRATEGY_INDEX[lot.processedWith] : null;
  const ids = prior && prior.antimicrobial.startsWith("metaphylaxis") ? ["none-std", "none-enh"] : ["none-std", "none-enh", "screen-std", "prem-std"];
  return ids.map((id) => STRATEGY_INDEX[id]);
}

export function simContextFor(lot: LotArrival, P: Params): SimContext {
  if (lot.status !== "on-feed" || lot.daysOnFeed == null) return ARRIVAL_CONTEXT;
  const prior = lot.processedWith ? STRATEGY_INDEX[lot.processedWith] : null;
  const priorMeta = !!prior && prior.antimicrobial.startsWith("metaphylaxis");
  const pmf = gammaPmf(P.onsetShape, P.onsetScale, 45);
  const shift = priorMeta ? Math.round(P.metaOnsetDelay) : 0;
  let F = 0;
  for (let i = 0; i <= Math.min(45, lot.daysOnFeed - shift); i++) F += pmf[i];
  return { remainingFrac: Math.max(0, 1 - F), startDay: Math.min(45, lot.daysOnFeed), casesSoFar: lot.casesToDate ?? 0, priorMeta };
}

function riskFor(model: FittedModel, lot: LotArrival, P: Params) {
  const prior = predictRisk(model, lot, P.highRiskCutoff);
  if (lot.status !== "on-feed") return { risk: prior, note: undefined, priorMean: prior.mean };
  const ps = lot.processedWith ? STRATEGY_INDEX[lot.processedWith] : null;
  const metaGiven = !!ps && ps.antimicrobial.startsWith("metaphylaxis");
  const rr = !ps ? 1 : ps.antimicrobial === "metaphylaxis-premium" ? P.metaPremiumRR : ps.antimicrobial === "metaphylaxis-economy" ? P.metaEconomyRR : 1;
  const { risk, note } = updateWithObserved(prior, lot, rr, { shape: P.onsetShape, scale: P.onsetScale, metaDelay: P.metaOnsetDelay, metaGiven });
  return { risk, note, priorMean: prior.mean };
}

function runAll(model: FittedModel, lot: LotArrival, P: Params, nDraws: number) {
  const { risk, note, priorMean } = riskFor(model, lot, P);
  // On-feed lots: the risk is already posterior; the remaining-case fraction is handled by the context.
  const draws = makeDraws(risk, P, nDraws, hashSeed(lot.lotId));
  const ctx = simContextFor(lot, P);
  const results = candidateStrategies(lot).map((s) => simulateStrategy(lot, draws, s, P, ctx));
  return { risk, note, results, priorMean };
}

const objMean = (r: StrategyResult) => r.objective;

export function bestOf(results: StrategyResult[]): StrategyResult {
  return results.reduce((a, b) => (objMean(b) > objMean(a) ? b : a));
}

export function assessLot(model: FittedModel, lot: LotArrival, P: Params, opts: AssessOptions = {}): LotAssessment {
  const nDraws = opts.draws ?? DECISION_DRAWS;
  const { risk, note, results, priorMean } = runAll(model, lot, P, nDraws);
  const best = bestOf(results);
  const yard = YARD_INDEX[lot.yardId];
  const sqStrategy =
    lot.status === "on-feed" ? STRATEGY_INDEX["none-std"] : statusQuoStrategy(yard, { weightLb: lot.weightLb, source: lot.source, buyerHighRisk: lot.buyerHighRisk });
  const statusQuo = results.find((r) => r.strategy.id === sqStrategy.id) ?? results[0];

  // EVPI (risk uncertainty only): E[max_s V_s] − max_s E[V_s], using paired draws.
  let evMax = 0;
  for (let i = 0; i < nDraws; i++) {
    let m = -Infinity;
    for (const r of results) m = Math.max(m, r.draws[i]);
    evMax += m / nDraws;
  }
  const evpiLot = Math.max(0, evMax - objMean(best));

  // Decision robustness: how often the recommended option beats the runner-up on paired draws.
  const sorted = [...results].sort((a, b) => objMean(b) - objMean(a));
  const runnerUp = sorted[1];
  let wins = 0;
  for (let i = 0; i < nDraws; i++) if (best.draws[i] >= runnerUp.draws[i]) wins++;
  const pBest = wins / nDraws;
  // Antimicrobial-plan robustness: how often the recommendation beats the best-ranked option with a
  // different antimicrobial plan on paired draws. This is what a close call is about; a tie between
  // surveillance levels on the same drug plan is a free choice, not a risk.
  const rival = sorted.find((r) => r.strategy.antimicrobial !== best.strategy.antimicrobial);
  let drugWins = 0;
  if (rival) for (let i = 0; i < nDraws; i++) if (best.draws[i] >= rival.draws[i]) drugWins++;
  const pDrug = rival ? drugWins / nDraws : 1;

  // Value of information for each missing field: E_v[max_s E[V_s | v]] − max_s E[V_s].
  const infoValue: LotAssessment["infoValue"] = [];
  if (opts.voi !== false && opts.priors) {
    const pr = opts.priors[lot.yardId];
    const scenarios: { field: string; label: string; alts: { patch: Partial<LotArrival>; p: number }[] }[] = [];
    if (lot.vaccinated === "unknown")
      scenarios.push({ field: "vaccinated", label: "Vaccination history", alts: [{ patch: { vaccinated: "yes" as TriState }, p: pr.vaccinated }, { patch: { vaccinated: "no" as TriState }, p: 1 - pr.vaccinated }] });
    if (lot.weaned === "unknown")
      scenarios.push({ field: "weaned", label: "Weaning status", alts: [{ patch: { weaned: "yes" as TriState }, p: pr.weaned }, { patch: { weaned: "no" as TriState }, p: 1 - pr.weaned }] });
    if (lot.source == null)
      scenarios.push({ field: "source", label: "Cattle source", alts: (Object.entries(pr.source) as [SourceType, number][]).filter(([, p]) => p > 0).map(([s, p]) => ({ patch: { source: s }, p })) });
    if (lot.nSources == null)
      scenarios.push({ field: "nSources", label: "Number of sources", alts: pr.nSources.filter(([, p]) => p > 0).map(([v, p]) => ({ patch: { nSources: v }, p })) });
    for (const sc of scenarios) {
      let ev = 0;
      let evCurrent = 0;
      let flip = 0;
      for (const alt of sc.alts) {
        const r = runAll(model, { ...lot, ...alt.patch }, P, Math.max(150, nDraws / 2)).results;
        // Best choice if we knew the value, vs. the current recommendation valued under the same scenario
        // (pairing both on the same scenario removes Monte Carlo level shifts).
        const bAlt = bestOf(r);
        ev += alt.p * objMean(bAlt);
        evCurrent += alt.p * objMean(r.find((x) => x.strategy.id === best.strategy.id) ?? r[0]);
        if (bAlt.strategy.id !== best.strategy.id) flip += alt.p;
      }
      infoValue.push({ field: sc.field, label: sc.label, value: Math.max(0, ev - evCurrent), flipProb: flip });
    }
    infoValue.sort((a, b) => b.value - a.value);
  }

  // Confidence is about the DECISION, not the data: imperfect records or a wide risk interval only
  // lower confidence when they could change which antimicrobial plan the lot gets.
  // Without value-of-information analysis, fall back to a missing-field count.
  const voiDone = opts.voi !== false && !!opts.priors;
  const perHead = (v: { value: number }) => v.value / lot.head;
  const material = voiDone ? infoValue.find((v) => v.flipProb >= P.confFlipMaterial && perHead(v) >= P.confValueMaterial) : undefined;
  const relevant = voiDone ? infoValue.find((v) => v !== material && v.flipProb >= P.confFlipRelevant && perHead(v) >= P.confValueRelevant) : undefined;
  const materialGap = voiDone ? !!material : risk.missing.length >= 3;
  // A tie only matters when the top two options differ in antimicrobial use; a tie between, say,
  // premium metaphylaxis with and without enhanced surveillance is a free choice for the manager.
  const drugDiffers = best.strategy.antimicrobial !== runnerUp.strategy.antimicrobial;
  const closeCall = !!rival && pDrug < P.confCloseCall;
  const width = risk.p90 - risk.p10;

  const reasons: string[] = [];
  if (risk.ood.length) reasons.push(...risk.ood);
  if (material)
    reasons.push(`Knowing ${material.label.toLowerCase()} would change the recommendation with ${Math.round(material.flipProb * 100)}% probability (worth ≈ $${perHead(material).toFixed(2)}/head).`);
  if (closeCall)
    reasons.push(`Close call on antimicrobial use: "${best.strategy.short}" beats the best option with a different antimicrobial plan ("${rival!.strategy.short}") in only ${Math.round(pDrug * 100)}% of simulations${width > 0.25 ? `, across a wide risk range (${(risk.p10 * 100).toFixed(0)}–${(risk.p90 * 100).toFixed(0)}%)` : ""}.`);
  if (relevant)
    reasons.push(`${relevant.label} is unknown and could change the recommendation (${Math.round(relevant.flipProb * 100)}% chance, worth ≈ $${perHead(relevant).toFixed(2)}/head).`);

  const insufficient = risk.ood.length > 0 || materialGap;
  const caution = !insufficient && (closeCall || !!relevant);

  // Context that does not lower confidence, stated so the manager sees it was considered.
  if (!insufficient && !caution) reasons.push(
      rival
        ? `Recommendation is robust: it beats the best option with a different antimicrobial plan ("${rival.strategy.short}") in ${Math.round(pDrug * 100)}% of simulations.`
        : "Recommendation is robust: every option uses the same antimicrobial plan.",
    );
  if (pBest < P.confCloseCall && !drugDiffers)
    reasons.push(`"${runnerUp.strategy.short}" is almost as good and uses the same antimicrobial plan (it differs only in surveillance), so either is acceptable.`);
  if (risk.missing.length > 0 && !(voiDone ? material || relevant : materialGap))
    reasons.push(`${risk.missing.length} arrival field${risk.missing.length > 1 ? "s are" : " is"} unknown (${risk.missing.join(", ")})${voiDone ? ", but none would change this recommendation" : ""}.`);
  if (width > 0.25 && !closeCall) reasons.push(`The risk range is wide (${(risk.p10 * 100).toFixed(0)}–${(risk.p90 * 100).toFixed(0)}%), but the recommendation holds across it.`);

  return {
    lot,
    risk,
    results,
    best,
    statusQuo,
    evpiLot,
    infoValue,
    confidence: insufficient ? "insufficient" : caution ? "caution" : "confident",
    confidenceReasons: reasons,
    posteriorNote: note,
    arrivalRiskMean: priorMean,
  };
}

export const objectiveMean = objMean;
