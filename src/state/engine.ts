import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { CURRENT_LOTS, PRIORS } from "../data";
import type { FittedModel, ModelKind } from "../engine/model";
import type { Params } from "../engine/params";
import type { ZooOptions } from "../engine/zoo";
import type { HistoricalLot, LotArrival, LotAssessment, Yard, YardId } from "../engine/types";
import { YARDS } from "../engine/yards";
import type { ConsensusRow, WorkerRequest, WorkerResponse } from "../workers/engine.worker";
import { useActiveModel } from "./models";
import { useApp } from "./store";

interface EngineState {
  status: "idle" | "running" | "ready" | "error";
  progress: number;
  assessments: LotAssessment[];
  byId: Record<string, LotAssessment>;
  ms: number;
  error?: string;
}

export const useEngine = create<EngineState>(() => ({ status: "idle", progress: 0, assessments: [], byId: {}, ms: 0 }));

let worker: Worker | null = null;
let reqId = 0;
const trainResolvers = new Map<number, { resolve: (m: FittedModel) => void; reject: (e: Error) => void; progress?: (f: number) => void }>();
const consensusResolvers = new Map<number, (rows: ConsensusRow[]) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../workers/engine.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === "progress" && m.id === reqId) useEngine.setState({ progress: m.done / m.total });
      if (m.type === "assessed" && m.id === reqId)
        useEngine.setState({
          status: "ready",
          progress: 1,
          assessments: m.assessments,
          byId: Object.fromEntries(m.assessments.map((a) => [a.lot.lotId, a])),
          ms: m.ms,
        });
      if (m.type === "trainProgress") trainResolvers.get(m.id)?.progress?.(m.frac);
      if (m.type === "trained") {
        trainResolvers.get(m.id)?.resolve(m.model);
        trainResolvers.delete(m.id);
      }
      if (m.type === "consensus") {
        consensusResolvers.get(m.id)?.(m.rows);
        consensusResolvers.delete(m.id);
      }
      if (m.type === "error") {
        const t = trainResolvers.get(m.id);
        if (t) {
          t.reject(new Error(m.message));
          trainResolvers.delete(m.id);
        } else useEngine.setState({ status: "error", error: m.message });
      }
    };
  }
  return worker;
}

let sideId = 100000;

/** Train (and optionally temporally validate) any model family in the worker. */
export function trainInWorker(
  history: HistoricalLot[],
  kind: ModelKind,
  options: ZooOptions = {},
  validate = false,
  progress?: (f: number) => void,
  components?: Partial<Record<ModelKind, FittedModel>>,
): Promise<FittedModel> {
  const id = ++sideId;
  return new Promise((resolve, reject) => {
    trainResolvers.set(id, { resolve, reject, progress });
    getWorker().postMessage({ type: "train", id, history, kind, options, validate, components } satisfies WorkerRequest);
  });
}

/** Run one lot through several models and report each model's risk and recommended option. */
export function consensusInWorker(lot: LotArrival, params: Params, models: FittedModel[]): Promise<ConsensusRow[]> {
  const id = ++sideId;
  return new Promise((resolve) => {
    consensusResolvers.set(id, resolve);
    getWorker().postMessage({ type: "consensus", id, lot, params, models, priors: PRIORS } satisfies WorkerRequest);
  });
}

/** All lots the dashboard knows about: bundled snapshot + manager-entered/uploaded lots, with edits applied. */
export function useLots(): LotArrival[] {
  const added = useApp((s) => s.addedLots);
  const patches = useApp((s) => s.lotPatches);
  return useMemo(() => [...CURRENT_LOTS, ...added].map((l) => (patches[l.lotId] ? { ...l, ...patches[l.lotId] } : l)), [added, patches]);
}

export function useYards(): Yard[] {
  const ov = useApp((s) => s.yardOverrides);
  return useMemo(() => YARDS.map((y) => ({ ...y, ...ov[y.id] })), [ov]);
}

export function useYard(id: YardId): Yard {
  return useYards().find((y) => y.id === id)!;
}

/** Mount once: re-runs the engine (debounced) whenever lots, assumptions or the model change. */
export function useEngineDriver() {
  const lots = useLots();
  const params = useApp((s) => s.params);
  const { model, ready } = useActiveModel();
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const id = ++reqId;
      useEngine.setState({ status: "running", progress: 0 });
      getWorker().postMessage({ type: "assess", id, lots, params, model, priors: PRIORS } satisfies WorkerRequest);
    }, 220);
    return () => clearTimeout(t);
  }, [lots, params, model, ready]);
}
