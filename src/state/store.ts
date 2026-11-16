import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_MODEL } from "../data";
import { PRICE_PRESETS } from "../engine/economics";
import { kindOf, LINEAR_KINDS, type FittedModel, type ModelKind } from "../engine/model";
import { DEFAULT_PARAMS, type ParamKey, type Params } from "../engine/params";
import type { LotArrival, Yard, YardId } from "../engine/types";

export type CapacityKey = "hospitalPenHead" | "hospitalBaseline" | "riderHoursPerDay" | "chuteHoursPerDay";

export interface VetReview {
  status: "pending" | "approved" | "modified" | "declined";
  reviewer: string;
  note: string;
  strategyId: string;
  date: string;
}

interface AppState {
  params: Params;
  pricePreset: keyof typeof PRICE_PRESETS | "custom";
  setParam: (k: ParamKey, v: number) => void;
  resetParams: () => void;
  applyPreset: (id: keyof typeof PRICE_PRESETS) => void;

  yardOverrides: Partial<Record<YardId, Partial<Pick<Yard, CapacityKey>>>>;
  setCapacity: (yard: YardId, k: CapacityKey, v: number) => void;
  amuCap: Partial<Record<YardId, number | null>>;
  setAmuCap: (yard: YardId, v: number | null) => void;

  addedLots: LotArrival[];
  addLots: (lots: LotArrival[]) => void;
  removeLot: (id: string) => void;
  lotPatches: Record<string, Partial<LotArrival>>;
  patchLot: (id: string, patch: Partial<LotArrival>) => void;
  clearPatch: (id: string) => void;

  reviews: Record<string, VetReview>;
  setReview: (id: string, r: VetReview) => void;
  locks: Record<string, string>;
  setLock: (lotId: string, strategyId: string | null) => void;

  /** Risk model the decision engine uses. */
  modelKind: ModelKind;
  setModelKind: (k: ModelKind) => void;
  /** A model retrained in the browser (overrides the bundled/cached model of the same kind). */
  customModel: FittedModel | null;
  setCustomModel: (m: FittedModel | null) => void;

  theme: "light" | "dark";
  toggleTheme: () => void;
  tourDone: boolean;
  setTourDone: (v: boolean) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      params: { ...DEFAULT_PARAMS },
      pricePreset: "weber",
      setParam: (k, v) =>
        set((s) => ({
          params: { ...s.params, [k]: v },
          pricePreset: ["fedPrice", "feederPrice550", "feederPrice700", "feederPrice850"].includes(k) ? "custom" : s.pricePreset,
        })),
      resetParams: () => set({ params: { ...DEFAULT_PARAMS }, pricePreset: "weber" }),
      applyPreset: (id) => set((s) => ({ params: { ...s.params, ...PRICE_PRESETS[id].values }, pricePreset: id })),

      yardOverrides: {},
      setCapacity: (yard, k, v) => set((s) => ({ yardOverrides: { ...s.yardOverrides, [yard]: { ...s.yardOverrides[yard], [k]: v } } })),
      amuCap: {},
      setAmuCap: (yard, v) => set((s) => ({ amuCap: { ...s.amuCap, [yard]: v } })),

      addedLots: [],
      addLots: (lots) =>
        set((s) => {
          const ids = new Set(lots.map((l) => l.lotId));
          return { addedLots: [...s.addedLots.filter((l) => !ids.has(l.lotId)), ...lots] };
        }),
      removeLot: (id) => set((s) => ({ addedLots: s.addedLots.filter((l) => l.lotId !== id) })),
      lotPatches: {},
      patchLot: (id, patch) => set((s) => ({ lotPatches: { ...s.lotPatches, [id]: { ...s.lotPatches[id], ...patch } } })),
      clearPatch: (id) =>
        set((s) => {
          const next = { ...s.lotPatches };
          delete next[id];
          return { lotPatches: next };
        }),

      reviews: {},
      setReview: (id, r) => set((s) => ({ reviews: { ...s.reviews, [id]: r } })),
      locks: {},
      setLock: (lotId, strategyId) =>
        set((s) => {
          const next = { ...s.locks };
          if (strategyId) next[lotId] = strategyId;
          else delete next[lotId];
          return { locks: next };
        }),

      modelKind: "logit",
      setModelKind: (k) => set({ modelKind: k }),
      customModel: null,
      setCustomModel: (m) => set({ customModel: m }),

      theme: "light",
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      tourDone: false,
      setTourDone: (v) => set({ tourDone: v }),
    }),
    {
      name: "brd-command-center-v1",
      // v2: stewardship weight became a derived default ($0 → $3/regimen) and confidence settings were added.
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as Partial<AppState>;
        if (version < 2 && s.params) s.params = { ...s.params, amuPenalty: DEFAULT_PARAMS.amuPenalty };
        return s as AppState;
      },
      // Fill any parameter added since the state was saved, so older sessions never see undefined values.
      merge: (persisted, current) => {
        const s = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...s, params: { ...DEFAULT_PARAMS, ...s.params } };
      },
      partialize: (s) => ({
        params: s.params,
        pricePreset: s.pricePreset,
        yardOverrides: s.yardOverrides,
        amuCap: s.amuCap,
        addedLots: s.addedLots,
        lotPatches: s.lotPatches,
        reviews: s.reviews,
        locks: s.locks,
        theme: s.theme,
        tourDone: s.tourDone,
        modelKind: s.modelKind,
        // Tree ensembles are too large for localStorage; they are retrained on load instead.
        customModel: s.customModel && LINEAR_KINDS.includes(kindOf(s.customModel)) ? s.customModel : null,
      }),
    },
  ),
);

/** The retrained model if it matches the selected kind, else the bundled default for logistic (other kinds come from useActiveModel). */
export const storedModel = (s: AppState): FittedModel | null =>
  s.customModel && kindOf(s.customModel) === s.modelKind ? s.customModel : s.modelKind === "logit" ? DEFAULT_MODEL : null;
