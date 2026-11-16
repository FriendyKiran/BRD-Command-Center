import type { EvidenceKind } from "./types";

/**
 * Every number the decision engine uses lives here, with its provenance.
 * kind = "observed"  → taken directly from a cited source or from real public data
 *        "estimated" → fitted by this tool from (synthetic) records
 *        "assumed"   → a team assumption; editable in the Assumptions page and covered by sensitivity analysis
 */
export interface ParamDef {
  key: ParamKey;
  label: string;
  group: ParamGroup;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  kind: EvidenceKind;
  source: string;
  note?: string;
}

export type ParamGroup =
  | "Market & prices"
  | "Treatment & metaphylaxis"
  | "Disease course"
  | "Surveillance & labor"
  | "Stewardship & welfare"
  | "Feeding-period economics"
  | "Decision confidence";

export type ParamKey =
  | "fedPrice"
  | "feederPrice550"
  | "feederPrice700"
  | "feederPrice850"
  | "cornPrice"
  | "yardagePerDay"
  | "interestRate"
  | "shrink"
  | "finishWeightSteer"
  | "finishWeightSlope"
  | "finishWeightHeifer"
  | "metaPremiumCost"
  | "metaEconomyCost"
  | "metaPremiumRR"
  | "metaEconomyRR"
  | "metaRRUncertainty"
  | "screenCostPerHead"
  | "treatmentCost"
  | "lostValuePerCase"
  | "retreatCost2"
  | "retreatCost3"
  | "missedCaseLossShare"
  | "febrileCaseEnrichment"
  | "retreatRate2"
  | "retreatRate3"
  | "cfrTreated"
  | "cfrUndetected"
  | "otherMortality"
  | "earlyTreatmentCfrFactor"
  | "ciaShareTherapeutic"
  | "onsetShape"
  | "onsetScale"
  | "metaOnsetDelay"
  | "hospitalDaysPerTreatment"
  | "sensStandard"
  | "sensEnhanced"
  | "riderHoursPer1000Std"
  | "riderHoursPer1000Enh"
  | "laborCostPerHour"
  | "chuteMinPerHeadScreen"
  | "chuteMinPerHeadMeta"
  | "amuPenalty"
  | "deathPenalty"
  | "highRiskCutoff"
  | "cullRate550"
  | "cullRate700"
  | "cullRate850"
  | "confFlipMaterial"
  | "confValueMaterial"
  | "confFlipRelevant"
  | "confValueRelevant"
  | "confCloseCall";

const R = "Rojas et al. 2022, Pathogens 11:442";
const W = "Weber et al. 2024, AAEA poster (TAMU/K-State)";
const JP = "Johnson & Pendell 2017, Front. Vet. Sci. 4:189";
const NAHMS = "USDA APHIS NAHMS 2019, Antimicrobial Use & Stewardship on U.S. Feedlots, 2017";
const MGMT = "Management setting, not a biological parameter: it changes how confidence is labelled, never which option is recommended";

export const PARAM_DEFS: ParamDef[] = [
  // ── Market & prices ────────────────────────────────────────────────────────
  { key: "fedPrice", label: "Fed cattle price", group: "Market & prices", value: 1.2628, min: 0.9, max: 2.8, step: 0.01, unit: "$/lb live", kind: "observed", source: W, note: "Weber simulation constant (FP). Raise toward current-market levels to stress-test." },
  { key: "feederPrice550", label: "Feeder price, 550 lb calves", group: "Market & prices", value: 1.7397, min: 1.0, max: 4.5, step: 0.01, unit: "$/lb", kind: "observed", source: W },
  { key: "feederPrice700", label: "Feeder price, 700 lb calves", group: "Market & prices", value: 1.557, min: 1.0, max: 4.2, step: 0.01, unit: "$/lb", kind: "observed", source: W },
  { key: "feederPrice850", label: "Feeder price, 850 lb yearlings", group: "Market & prices", value: 1.4558, min: 1.0, max: 4.0, step: 0.01, unit: "$/lb", kind: "observed", source: W },
  { key: "cornPrice", label: "Feed (corn) price", group: "Market & prices", value: 0.0923, min: 0.05, max: 0.2, step: 0.001, unit: "$/lb", kind: "observed", source: W },
  { key: "yardagePerDay", label: "Yardage", group: "Feeding-period economics", value: 0.4, min: 0.2, max: 0.8, step: 0.01, unit: "$/head/day", kind: "observed", source: W, note: "YC = 0.40 × DOF" },
  { key: "interestRate", label: "Annual interest rate", group: "Feeding-period economics", value: 0.05, min: 0.02, max: 0.12, step: 0.005, unit: "fraction", kind: "observed", source: W },
  { key: "shrink", label: "Marketing shrink", group: "Feeding-period economics", value: 0.04, min: 0.02, max: 0.06, step: 0.005, unit: "fraction", kind: "observed", source: W },
  { key: "finishWeightSteer", label: "Finished weight, steers (700 lb placement)", group: "Feeding-period economics", value: 1285, min: 1150, max: 1600, step: 5, unit: "lb", kind: "estimated", source: "Calibrated so the healthy-pen baseline reproduces Weber et al. 2024 net returns for untreated pens (finished-weight mean is not printed in the poster)" },
  { key: "finishWeightSlope", label: "Finished weight change per lb of placement weight", group: "Feeding-period economics", value: 0.29, min: 0, max: 1, step: 0.01, unit: "lb/lb", kind: "estimated", source: "Calibrated jointly with finished weight against Weber et al. 2024 (550/700/850 lb results)" },
  { key: "finishWeightHeifer", label: "Finished weight, heifers", group: "Feeding-period economics", value: 1190, min: 1050, max: 1450, step: 5, unit: "lb", kind: "assumed", source: "Team assumption (≈ 110 lb lighter than steers)" },
  { key: "cullRate550", label: "Chronic cull rate, 550 lb placements", group: "Feeding-period economics", value: 0.0226, min: 0, max: 0.06, step: 0.001, unit: "fraction", kind: "observed", source: W },
  { key: "cullRate700", label: "Chronic cull rate, 700 lb placements", group: "Feeding-period economics", value: 0.0079, min: 0, max: 0.04, step: 0.001, unit: "fraction", kind: "observed", source: W },
  { key: "cullRate850", label: "Chronic cull rate, 850 lb placements", group: "Feeding-period economics", value: 0.005, min: 0, max: 0.03, step: 0.001, unit: "fraction", kind: "observed", source: W },

  // ── Treatment & metaphylaxis ───────────────────────────────────────────────
  { key: "metaPremiumCost", label: "Metaphylaxis cost, premium class", group: "Treatment & metaphylaxis", value: 23.6, min: 10, max: 45, step: 0.1, unit: "$/head", kind: "observed", source: R + " (value originates from NAHMS 2011 cost of one respiratory treatment)", note: "Rojas reuses the NAHMS 2011 per-treatment cost as the metaphylaxis cost; replace with current invoice prices." },
  { key: "metaEconomyCost", label: "Metaphylaxis cost, economy class", group: "Treatment & metaphylaxis", value: 9.5, min: 3, max: 25, step: 0.1, unit: "$/head", kind: "assumed", source: "Team assumption (shorter-acting class, e.g., tetracycline); verify with yard invoices" },
  { key: "metaPremiumRR", label: "BRD risk ratio with premium metaphylaxis", group: "Treatment & metaphylaxis", value: 0.5, min: 0.2, max: 0.9, step: 0.01, unit: "ratio", kind: "assumed", source: "Rojas et al. 2022 assume 50 % metaphylaxis efficacy (an assumption, not a measured effect). The fitted model re-estimates it from yard records (Model page).", note: "1.0 = no effect. Wide range explored in sensitivity analysis." },
  { key: "metaEconomyRR", label: "BRD risk ratio with economy metaphylaxis", group: "Treatment & metaphylaxis", value: 0.65, min: 0.3, max: 1, step: 0.01, unit: "ratio", kind: "assumed", source: "Team assumption" },
  { key: "metaRRUncertainty", label: "Efficacy uncertainty (± on risk ratio)", group: "Treatment & metaphylaxis", value: 0.1, min: 0, max: 0.3, step: 0.01, unit: "± ratio", kind: "assumed", source: "Team assumption: risk ratio drawn uniformly within ± this band in every Monte Carlo draw" },
  { key: "screenCostPerHead", label: "Chute-side temperature screen", group: "Treatment & metaphylaxis", value: 1.5, min: 0, max: 6, step: 0.1, unit: "$/head", kind: "assumed", source: "Team assumption (thermometer, extra chute time)" },
  { key: "treatmentCost", label: "Cost per individual BRD treatment", group: "Treatment & metaphylaxis", value: 23.6, min: 5, max: 60, step: 0.1, unit: "$/regimen", kind: "observed", source: "NAHMS 2011 average respiratory treatment cost, via " + JP + " and " + R, note: "Used only to itemise drug spend; Weber's VCPH equation already prices treatment into net return." },
  { key: "lostValuePerCase", label: "Lost value per BRD case (treated once)", group: "Treatment & metaphylaxis", value: 151.18, min: 40, max: 400, step: 1, unit: "$/case", kind: "observed", source: R + ", citing the Texas A&M Ranch to Rail summary: medicine cost + lost efficiency, gain and sale value of a sick vs healthy animal" },
  { key: "retreatCost2", label: "Added cost of a 2nd treatment", group: "Treatment & metaphylaxis", value: 16.92, min: 0, max: 80, step: 0.5, unit: "$/case", kind: "estimated", source: "Derived from Weber et al. 2024 VCPH coefficients: (0.5113 − 0.3421) × 100" },
  { key: "retreatCost3", label: "Added cost of a 3rd treatment", group: "Treatment & metaphylaxis", value: 50.13, min: 0, max: 150, step: 0.5, unit: "$/case", kind: "estimated", source: "Derived from Weber et al. 2024 VCPH coefficients: (1.0126 − 0.5113) × 100" },
  { key: "missedCaseLossShare", label: "Performance loss of a missed survivor vs a treated case", group: "Treatment & metaphylaxis", value: 1.25, min: 0.5, max: 2, step: 0.05, unit: "×", kind: "assumed", source: "Team assumption: a missed case avoids drug cost but its performance loss (per-case loss − treatment cost) is larger when untreated" },
  { key: "febrileCaseEnrichment", label: "Relative risk of BRD, febrile vs afebrile arrivals", group: "Treatment & metaphylaxis", value: 2.5, min: 1, max: 6, step: 0.1, unit: "×", kind: "assumed", source: "Team assumption: arrivals ≥ 104 °F are this many times more likely to become clinical cases" },

  // ── Disease course ─────────────────────────────────────────────────────────
  { key: "retreatRate2", label: "Share of treated cattle re-treated (2nd)", group: "Disease course", value: 0.149, min: 0.05, max: 0.5, step: 0.005, unit: "fraction", kind: "observed", source: JP + ", Fig. 1 (NAHMS 2011): 14.9 % retreated after first treatment" },
  { key: "retreatRate3", label: "Share of re-treated cattle treated a 3rd time", group: "Disease course", value: 0.12, min: 0.02, max: 0.5, step: 0.005, unit: "fraction", kind: "observed", source: JP + ", Fig. 1 (NAHMS 2011): 12.0 % retreated after second treatment" },
  { key: "cfrTreated", label: "Case fatality, detected & treated", group: "Disease course", value: 0.065, min: 0.01, max: 0.2, step: 0.005, unit: "fraction", kind: "estimated", source: JP + ", Fig. 1 (NAHMS 2011) treatment-outcome tree: 4.0 % / 13.3 % / 30.5 % die after 1st / 2nd / 3rd treatment ⇒ ≈ 6.5 % of treated cattle overall" },
  { key: "cfrUndetected", label: "Case fatality, missed cases", group: "Disease course", value: 0.1, min: 0.02, max: 0.5, step: 0.01, unit: "fraction", kind: "assumed", source: "Team assumption (no source quantifies mortality of missed BRD; many missed cases are mild). Calibrated so overall BRD mortality ≈ 1.1 % (Johnson & Pendell 2017 baseline 1.12 %)" },
  { key: "otherMortality", label: "Non-BRD death loss, whole feeding period", group: "Disease course", value: 0.008, min: 0, max: 0.03, step: 0.001, unit: "fraction", kind: "assumed", source: "Team assumption; NAHMS 2019 reports 1.2–2.3 % all-cause feedlot death loss (BRD is 50–80 % of deaths)" },
  { key: "earlyTreatmentCfrFactor", label: "Case-fatality multiplier with enhanced surveillance", group: "Surveillance & labor", value: 0.85, min: 0.5, max: 1, step: 0.01, unit: "×", kind: "assumed", source: "Team assumption: earlier pulls → better treatment response" },
  { key: "ciaShareTherapeutic", label: "Share of individual treatments using highest-priority classes", group: "Stewardship & welfare", value: 0.5, min: 0, max: 1, step: 0.05, unit: "fraction", kind: "assumed", source: "Team assumption; NAHMS 2019 lists macrolides and fluoroquinolones among common BRD treatments (drug-class share for individual BRD treatment not reported)" },
  { key: "onsetShape", label: "Onset timing: gamma shape", group: "Disease course", value: 2.2, min: 1, max: 5, step: 0.1, unit: "", kind: "assumed", source: "Team assumption: most first treatments in the first 2–3 weeks on feed" },
  { key: "onsetScale", label: "Onset timing: gamma scale", group: "Disease course", value: 6, min: 2, max: 12, step: 0.5, unit: "days", kind: "assumed", source: "Team assumption (mean ≈ 13 days on feed)" },
  { key: "metaOnsetDelay", label: "Onset delay after metaphylaxis", group: "Disease course", value: 7, min: 0, max: 14, step: 1, unit: "days", kind: "assumed", source: "Team assumption (post-metaphylactic interval)" },
  { key: "hospitalDaysPerTreatment", label: "Hospital-pen days per treatment", group: "Disease course", value: 3, min: 1, max: 7, step: 0.5, unit: "days", kind: "assumed", source: "Team assumption" },
  { key: "highRiskCutoff", label: "High-risk lot definition", group: "Disease course", value: 0.15, min: 0.05, max: 0.3, step: 0.01, unit: "45-d morbidity", kind: "observed", source: R, note: "Cohorts with ≥15 % BRD morbidity in 45 DOF are high-risk." },

  // ── Surveillance & labor ───────────────────────────────────────────────────
  { key: "sensStandard", label: "Detection sensitivity, standard pen riding", group: "Surveillance & labor", value: 0.62, min: 0.3, max: 0.95, step: 0.01, unit: "fraction", kind: "observed", source: "Visual/DART diagnosis sensitivity 62–67 % (Timsit et al. 2016 meta-analysis, as cited in Adekunle & Kaniyamattam 2026)" },
  { key: "sensEnhanced", label: "Detection sensitivity, enhanced surveillance", group: "Surveillance & labor", value: 0.8, min: 0.4, max: 0.99, step: 0.01, unit: "fraction", kind: "assumed", source: "Team assumption (2×/day riding + temperature on pulls)" },
  { key: "riderHoursPer1000Std", label: "Rider hours / 1,000 head / day, standard", group: "Surveillance & labor", value: 1.0, min: 0.3, max: 3, step: 0.1, unit: "h", kind: "assumed", source: "Team assumption" },
  { key: "riderHoursPer1000Enh", label: "Rider hours / 1,000 head / day, enhanced", group: "Surveillance & labor", value: 2.2, min: 0.5, max: 5, step: 0.1, unit: "h", kind: "assumed", source: "Team assumption" },
  { key: "laborCostPerHour", label: "Labor cost", group: "Surveillance & labor", value: 22, min: 12, max: 45, step: 1, unit: "$/h", kind: "assumed", source: "Team assumption (loaded wage)" },
  { key: "chuteMinPerHeadScreen", label: "Chute minutes / head, temperature screen", group: "Surveillance & labor", value: 0.6, min: 0.1, max: 2, step: 0.1, unit: "min", kind: "assumed", source: "Team assumption" },
  { key: "chuteMinPerHeadMeta", label: "Chute minutes / head, metaphylaxis injection", group: "Surveillance & labor", value: 0.25, min: 0.05, max: 1, step: 0.05, unit: "min", kind: "assumed", source: "Team assumption (processing already happens; injection is incremental)" },

  // ── Stewardship & welfare ─────────────────────────────────────────────────
  {
    key: "amuPenalty",
    label: "Stewardship weight per antimicrobial regimen",
    group: "Stewardship & welfare",
    value: 3,
    min: 0,
    max: 60,
    step: 1,
    unit: "$/regimen",
    kind: "estimated",
    source:
      "Derived, not chosen: the smallest weight at which the tool's own expected antimicrobial use on the 2024 lots is no higher than the yards' current SOPs (scripts/evaluate-model.ts). It is the price of leadership's commitment to accountable use: no more antibiotics than today. " +
      NAHMS,
    note: "Set to 0 for pure economics; raise it to cut antimicrobial use further (see the frontier in the Yard Planner).",
  },
  { key: "deathPenalty", label: "Welfare weight per BRD death (beyond market loss)", group: "Stewardship & welfare", value: 0, min: 0, max: 2000, step: 25, unit: "$/death", kind: "assumed", source: "Management preference (0 = pure economics). " + JP + " discusses losses beyond direct costs." },

  // ── Decision confidence (management settings: when to act, when to pick up the phone) ──
  { key: "confFlipMaterial", label: "\"Need info\": chance a missing record flips the decision", group: "Decision confidence", value: 0.3, min: 0.1, max: 0.6, step: 0.05, unit: "probability", kind: "assumed", source: MGMT, note: "A lot is flagged \"information insufficient\" when learning one missing record would change the recommendation at least this often…" },
  { key: "confValueMaterial", label: "\"Need info\": value of learning that record", group: "Decision confidence", value: 1, min: 0.1, max: 5, step: 0.05, unit: "$/head", kind: "assumed", source: MGMT, note: "…and is worth at least this much: about the cost of a phone call to the order buyer, spread over the lot." },
  { key: "confFlipRelevant", label: "\"Caution\": chance a missing record flips the decision", group: "Decision confidence", value: 0.15, min: 0.05, max: 0.5, step: 0.05, unit: "probability", kind: "assumed", source: MGMT },
  { key: "confValueRelevant", label: "\"Caution\": value of learning that record", group: "Decision confidence", value: 0.25, min: 0.05, max: 3, step: 0.05, unit: "$/head", kind: "assumed", source: MGMT },
  { key: "confCloseCall", label: "\"Caution\": close call between antimicrobial plans", group: "Decision confidence", value: 0.6, min: 0.5, max: 0.8, step: 0.01, unit: "win share", kind: "assumed", source: MGMT, note: "The recommended plan must beat the best plan with different antimicrobial use in at least this share of paired simulations to count as robust." },
];

export type Params = Record<ParamKey, number>;

export const DEFAULT_PARAMS: Params = Object.fromEntries(PARAM_DEFS.map((p) => [p.key, p.value])) as Params;

export const PARAM_INDEX: Record<ParamKey, ParamDef> = Object.fromEntries(PARAM_DEFS.map((p) => [p.key, p])) as Record<
  ParamKey,
  ParamDef
>;

export const PARAM_GROUPS: ParamGroup[] = [
  "Treatment & metaphylaxis",
  "Disease course",
  "Surveillance & labor",
  "Stewardship & welfare",
  "Market & prices",
  "Feeding-period economics",
  "Decision confidence",
];
