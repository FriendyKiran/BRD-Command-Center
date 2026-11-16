import type { FieldPriors } from "../engine/assess";
import type { EvalLot } from "../engine/evaluation";
import type { FittedModel, ModelKind, ModelMetrics } from "../engine/model";
import type { TreeEnsemble } from "../engine/trees";
import type { HistoricalLot, LotArrival } from "../engine/types";
import type { WeatherData } from "../engine/weather";
import backtestJson from "./generated/backtest.json";
import currentJson from "./generated/current.json";
import metaJson from "./generated/meta.json";
import modelJson from "./generated/model.json";
import pricesJson from "./generated/prices.json";
import priorsJson from "./generated/priors.json";
import weatherJson from "./generated/weather.json";

/** Bundled, reproducible outputs of `npm run weather && npm run generate && npm run evaluate`. */
export const CURRENT_LOTS = currentJson as unknown as LotArrival[];
export const DEFAULT_MODEL = modelJson as unknown as FittedModel;
export const PRIORS = priorsJson as unknown as FieldPriors;
export const WEATHER = weatherJson as unknown as WeatherData;
export const META = metaJson as { seed: number; snapshot: string; historyStart: string; generatedAt: string; weatherCoverage: number };
export const PRICES = pricesJson as { source: string; url: string; series: Record<string, { date: string; usdPerLb: number }[]> };
export interface BacktestRow {
  policy: string;
  valuePerHead: number;
  /** Net value per head relative to the yards' current SOPs. */
  deltaPerHead: number;
  regimensPer100: number;
  bRdMortalityPct: number;
  incidencePct: number;
}
export const BACKTEST = backtestJson as unknown as {
  lots: number;
  head: number;
  agreement: number;
  /** Stewardship weight ($/regimen) the default tool policy used. */
  amuPenalty: number;
  policies: BacktestRow[];
  yards: { yard: string; deltaPerHead: number; amuChangePct: number }[];
  frontier: { amuPenalty: number; valuePerHead: number; regimensPer100: number; mortalityPct: number }[];
  /** Decision quality per risk model (value per head vs current SOPs), with no stewardship weight (0) and at the default (Def). */
  models: { kind: ModelKind; value0: number; regimens0: number; mortality0: number; agreement0: number; valueDef: number; regimensDef: number; mortalityDef: number; agreementDef: number }[];
  /** The same choices re-scored in worlds where the tool's assumptions are wrong. */
  stress: { id: string; label: string; detail: string; rows: BacktestRow[]; captured: number | null; toolBeatsSop: boolean; toolUsesLessAmu: boolean; toolFewerDeaths: boolean }[];
  /** Derivation of the default stewardship weight from pre-2025 lots. */
  stewardship: { derived: number; lots: number; derivation: { lambda: number; toolRegimens: number; sopRegimens: number }[] };
  note: string;
};
export const SNAPSHOT = META.snapshot;

/** History is large (~1.6 MB); load it on demand. */
let historyPromise: Promise<HistoricalLot[]> | null = null;
export function loadHistory(): Promise<HistoricalLot[]> {
  historyPromise ??= import("./generated/history.json").then((m) => m.default as unknown as HistoricalLot[]);
  return historyPromise;
}

export interface ZooResult {
  kind: ModelKind;
  trainMs: number;
  hyper: Record<string, number>;
  concentration: number;
  metrics: ModelMetrics;
  cv: { folds: { fold: number; auc: number; logLoss: number }[]; aucMean: number; aucSd: number; logLossMean: number };
  learningCurve: { fraction: number; lots: number; auc: number; logLoss: number }[];
  tree?: TreeEnsemble;
}
export interface Evaluation {
  split: string;
  cutoff: number;
  trainLots: number;
  test: EvalLot[];
  models: ZooResult[];
}

/** Model-lab results (all model families on the same holdout; ~200 kB); load on demand. */
let evalPromise: Promise<Evaluation> | null = null;
export function loadEvaluation(): Promise<Evaluation> {
  evalPromise ??= import("./generated/evaluation.json").then((m) => m.default as unknown as Evaluation);
  return evalPromise;
}
