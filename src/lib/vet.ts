import type { Antimicrobial, Strategy } from "../engine/types";

/**
 * How much veterinary attention a recommendation needs. The yard's SOP is itself a vet-approved
 * standing protocol, so a recommendation with the same antimicrobial plan is covered by it; anything
 * that changes drug use is routed for review, with escalations first. Every option involving
 * antimicrobials can still be reviewed on the lot page.
 */
export type VetNeed = "none" | "protocol" | "escalate" | "reduce" | "withdraw";

/** Antimicrobial intensity, for deciding whether a change escalates or reduces drug use. */
const LEVEL: Record<Antimicrobial, number> = { none: 0, "targeted-screen": 1, "metaphylaxis-economy": 2, "metaphylaxis-premium": 3 };

export function vetNeed(recommended: Strategy, sop: Strategy): VetNeed {
  const r = recommended.antimicrobial;
  const s = sop.antimicrobial;
  if (r === s) return r === "none" ? "none" : "protocol";
  if (r === "none") return "withdraw";
  return LEVEL[r] > LEVEL[s] ? "escalate" : "reduce";
}

export const VET_NEED: Record<VetNeed, { label: string; tone: "neutral" | "good" | "warn" | "info"; title: string; queue: boolean }> = {
  escalate: {
    label: "needs review",
    tone: "warn",
    title: "Adds or escalates antimicrobial use beyond the yard's SOP: the veterinarian must approve before processing.",
    queue: true,
  },
  reduce: {
    label: "review: less drug",
    tone: "info",
    title: "Uses less or a lower-class antimicrobial than the SOP: the veterinarian should confirm the change.",
    queue: true,
  },
  withdraw: {
    label: "review: no drug",
    tone: "info",
    title: "Withholds the metaphylaxis the SOP would give: the veterinarian should confirm, with surveillance in place.",
    queue: true,
  },
  protocol: {
    label: "SOP protocol",
    tone: "neutral",
    title: "Same antimicrobial plan as the yard's vet-approved SOP, so it is covered by the standing protocol. The vet can still review it.",
    queue: false,
  },
  none: { label: "no drugs", tone: "neutral", title: "No antimicrobials in the recommendation or the SOP.", queue: false },
};
