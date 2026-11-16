import { useMemo } from "react";
import { SNAPSHOT } from "../data";
import { planPortfolio, shadowPrices, yardCapacities, type PlanInput, type PlanResult, type ShadowPrices } from "../engine/optimize";
import type { LotAssessment, YardId } from "../engine/types";
import { useEngine, useYards } from "./engine";
import { useApp } from "./store";

export const PLAN_DAYS = 60;

export interface YardPlan {
  yardId: YardId;
  assessments: LotAssessment[];
  input: PlanInput;
  plan: PlanResult;
}

/** Optimised plans for every yard (fast: greedy repair on precomputed option results). */
export function usePlans(): Record<YardId, YardPlan> | null {
  const assessments = useEngine((s) => s.assessments);
  const yards = useYards();
  const locks = useApp((s) => s.locks);
  const amuCap = useApp((s) => s.amuCap);
  return useMemo(() => {
    if (!assessments.length) return null;
    const out = {} as Record<YardId, YardPlan>;
    for (const y of yards) {
      const as = assessments.filter((a) => a.lot.yardId === y.id);
      const input: PlanInput = { assessments: as, snapshot: SNAPSHOT, days: PLAN_DAYS, caps: yardCapacities(y, amuCap[y.id] ?? null), locked: locks };
      out[y.id] = { yardId: y.id, assessments: as, input, plan: planPortfolio(input) };
    }
    return out;
  }, [assessments, yards, locks, amuCap]);
}

export function useShadow(p: YardPlan | undefined): ShadowPrices | null {
  return useMemo(() => (p ? shadowPrices(p.input, p.plan) : null), [p]);
}
