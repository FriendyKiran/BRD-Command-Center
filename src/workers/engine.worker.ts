/// <reference lib="webworker" />
import { assessLot, type FieldPriors } from "../engine/assess";
import { kindOf, validate, type FittedModel, type ModelKind } from "../engine/model";
import type { Params } from "../engine/params";
import type { HistoricalLot, LotArrival, LotAssessment } from "../engine/types";
import { trainKind, VALIDATION_OPTIONS, type ZooOptions } from "../engine/zoo";

/**
 * Off-main-thread engine: scores every lot (risk, 7 options × Monte Carlo, value of information),
 * trains any model family on demand, and compares models on a single lot, so sliders stay responsive.
 */
export interface ConsensusRow {
  kind: ModelKind;
  mean: number;
  p10: number;
  p90: number;
  probHighRisk: number;
  bestId: string;
  bestLabel: string;
  deltaVsSq: number;
  antimicrobial: boolean;
}

export type WorkerRequest =
  | { type: "assess"; id: number; lots: LotArrival[]; params: Params; model: FittedModel; priors: FieldPriors }
  | { type: "train"; id: number; history: HistoricalLot[]; kind: ModelKind; options: ZooOptions; validate: boolean; components?: Partial<Record<ModelKind, FittedModel>> }
  | { type: "consensus"; id: number; lot: LotArrival; params: Params; models: FittedModel[]; priors: FieldPriors };

export type WorkerResponse =
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "assessed"; id: number; assessments: LotAssessment[]; ms: number }
  | { type: "trainProgress"; id: number; frac: number }
  | { type: "trained"; id: number; model: FittedModel; ms: number }
  | { type: "consensus"; id: number; rows: ConsensusRow[] }
  | { type: "error"; id: number; message: string };

const post = (m: WorkerResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  const t0 = performance.now();
  try {
    if (req.type === "assess") {
      const out: LotAssessment[] = [];
      req.lots.forEach((lot, i) => {
        const a = assessLot(req.model, lot, req.params, { priors: req.priors });
        // Raw draws are not needed by the UI lists; drop them to keep the message small.
        for (const r of a.results) r.draws = new Float64Array(0);
        out.push(a);
        if (i % 25 === 0) post({ type: "progress", id: req.id, done: i, total: req.lots.length });
      });
      post({ type: "assessed", id: req.id, assessments: out, ms: performance.now() - t0 });
    } else if (req.type === "train") {
      const onProgress = (f: number) => post({ type: "trainProgress", id: req.id, frac: req.validate ? 0.5 + f / 2 : f });
      const metrics = req.validate
        ? validate(req.history, "2025-01-01", 0.15, (t) => trainKind(req.kind, t, { ...VALIDATION_OPTIONS[req.kind], ...req.options, onProgress: (f) => post({ type: "trainProgress", id: req.id, frac: f / 2 }) })).metrics
        : undefined;
      const model = trainKind(req.kind, req.history, { ...req.options, onProgress, components: req.components });
      if (metrics) model.metrics = metrics;
      post({ type: "trained", id: req.id, model, ms: performance.now() - t0 });
    } else if (req.type === "consensus") {
      const rows = req.models.map((m): ConsensusRow => {
        const a = assessLot(m, req.lot, req.params, { priors: req.priors, voi: false });
        const sq = a.results.find((r) => r.strategy.id === a.statusQuo.strategy.id) ?? a.statusQuo;
        return {
          kind: kindOf(m),
          mean: a.risk.mean,
          p10: a.risk.p10,
          p90: a.risk.p90,
          probHighRisk: a.risk.probHighRisk,
          bestId: a.best.strategy.id,
          bestLabel: a.best.strategy.label,
          // Same value basis as the rest of the dashboard (net return minus any stewardship/welfare weight).
          deltaVsSq: (a.best.objective - sq.objective) / req.lot.head,
          antimicrobial: a.best.strategy.antimicrobial !== "none",
        };
      });
      post({ type: "consensus", id: req.id, rows });
    }
  } catch (e) {
    post({ type: "error", id: req.id, message: e instanceof Error ? e.message : String(e) });
  }
};
