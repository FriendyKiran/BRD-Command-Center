import { useEffect } from "react";
import { create } from "zustand";
import { DEFAULT_MODEL, loadHistory } from "../data";
import { kindOf, type FittedModel, type ModelKind } from "../engine/model";
import { trainInWorker } from "./engine";
import { storedModel, useApp } from "./store";

/**
 * In-memory cache of models trained on demand in the worker (tree ensembles are too large to
 * bundle or persist). Training is deterministic (seeded), so a reload reproduces the same model.
 */
interface ModelCache {
  trained: Partial<Record<ModelKind, FittedModel>>;
  training: Partial<Record<ModelKind, number>>; // progress 0–1
}

export const useModelCache = create<ModelCache>(() => ({ trained: { logit: DEFAULT_MODEL }, training: {} }));

const pending = new Map<ModelKind, Promise<FittedModel>>();

export function ensureModel(kind: ModelKind): Promise<FittedModel> {
  const have = useModelCache.getState().trained[kind];
  if (have) return Promise.resolve(have);
  if (!pending.has(kind)) {
    useModelCache.setState((s) => ({ training: { ...s.training, [kind]: 0 } }));
    const pr = loadHistory()
      .then((h) =>
        trainInWorker(h, kind, {}, false, (f) => useModelCache.setState((s) => ({ training: { ...s.training, [kind]: f } })), useModelCache.getState().trained),
      )
      .then((m) => {
        useModelCache.setState((s) => {
          const training = { ...s.training };
          delete training[kind];
          return { trained: { ...s.trained, [kind]: m }, training };
        });
        pending.delete(kind);
        return m;
      });
    pending.set(kind, pr);
  }
  return pending.get(kind)!;
}

/** The model the engine should use, training it first if needed. `ready` is false while training. */
export function useActiveModel(): { model: FittedModel; kind: ModelKind; ready: boolean; progress: number | undefined } {
  const kind = useApp((s) => s.modelKind);
  const stored = useApp(storedModel);
  const cached = useModelCache((s) => s.trained[kind]);
  const progress = useModelCache((s) => s.training[kind]);
  const model = stored ?? cached;
  useEffect(() => {
    if (!model) void ensureModel(kind);
  }, [kind, model]);
  return { model: model ?? DEFAULT_MODEL, kind: model ? kindOf(model) : "logit", ready: !!model, progress };
}
