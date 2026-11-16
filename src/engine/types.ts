/** Core domain types shared by the generator, model, simulator, optimizer and UI. */

export type YardId = "palo-duro" | "llano" | "cimarron" | "arkansas-river";

export type Sex = "steer" | "heifer" | "mixed" | "bull";
export type SourceType = "ranch_direct" | "preconditioned" | "auction_single" | "auction_multi";
export type TriState = "yes" | "no" | "unknown";

/** How each value entered the system. Shown on every assumption so the user can tell them apart. */
export type EvidenceKind = "observed" | "estimated" | "assumed";

export interface SopRule {
  /** Plain-language statement of the yard's current operating approach. */
  summary: string;
  metaphylaxisIfWeightBelow: number | null;
  metaphylaxisIfSource: SourceType[];
  metaphylaxisIfBuyerHighRisk: boolean;
  drug: MetaphylaxisDrug;
  surveillance: Surveillance;
}

export interface Yard {
  id: YardId;
  name: string;
  town: string;
  state: "TX" | "KS";
  lon: number;
  lat: number;
  weatherStation: string;
  capacityHead: number;
  hospitalPenHead: number;
  /** Hospital head-days already committed to cattle outside the 45-day window. */
  hospitalBaseline: number;
  penRiders: number;
  /** Receiving-crew pen-rider hours per day available for cattle in their first 45 days on feed. */
  riderHoursPerDay: number;
  chuteHoursPerDay: number;
  /** Profile used by the synthetic generator (also shown in the UI as the yard's cattle mix). */
  profile: YardProfile;
  sop: SopRule;
  /** Short description of what makes this yard operationally different. */
  character: string;
}

export interface YardProfile {
  lotsPerYear: number;
  sourceMix: Record<SourceType, number>;
  weightMean: number;
  weightSd: number;
  haulMean: number;
  sexMix: Record<Sex, number>;
  missing: { vaccination: number; weaned: number; nSources: number; haul: number; source: number };
  yardEffect: number;
}

/** Information available about an arrival lot on the day the decision must be made. */
export interface LotArrival {
  lotId: string;
  yardId: YardId;
  arrivalDate: string; // ISO yyyy-mm-dd
  head: number;
  sex: Sex;
  weightLb: number;
  source: SourceType | null;
  nSources: number | null;
  haulMiles: number | null;
  shrinkPct: number | null;
  vaccinated: TriState;
  weaned: TriState;
  buyerHighRisk: boolean;
  /** Real NOAA weather at the yard's station around arrival (null when unavailable). */
  tempSwingF: number | null;
  precipIn: number | null;
  minTempF: number | null;
  penAreaM2PerHead: number;
  bunkCmPerHead: number;
  /** Optional chute-side screening result: share of head ≥ 104 °F rectal temperature. */
  febrilePct: number | null;
  /** Observed BRD first-treatments to date (for lots already on feed). */
  casesToDate: number | null;
  /** Days on feed at the snapshot date (null for scheduled arrivals). */
  daysOnFeed: number | null;
  status: "history" | "on-feed" | "scheduled";
  /** Strategy already applied at processing (on-feed lots only). */
  processedWith: string | null;
  notes?: string;
}

/** Historical outcome record (training data). Not known at decision time. */
export interface LotOutcome {
  metaphylaxisGiven: boolean;
  metaphylaxisDrug: MetaphylaxisDrug | "none";
  brdTreated45: number; // first treatments in 45 DOF (clinically detected)
  treated2x: number;
  treated3x: number;
  brdDeaths45: number;
  otherDeaths45: number;
  morbidity45: number; // brdTreated45 / head
  highRisk: boolean; // morbidity45 ≥ 15 % (Rojas et al. 2022 definition)
}

export type HistoricalLot = LotArrival & LotOutcome;

export type MetaphylaxisDrug = "premium" | "economy";
export type Antimicrobial = "none" | "metaphylaxis-premium" | "metaphylaxis-economy" | "targeted-screen";
export type Surveillance = "standard" | "enhanced";

export interface Strategy {
  id: string;
  antimicrobial: Antimicrobial;
  surveillance: Surveillance;
  label: string;
  short: string;
}

export interface RiskPrediction {
  /** Expected 45-day clinical BRD incidence without metaphylaxis (detected-case scale). */
  mean: number;
  p10: number;
  p90: number;
  /** Beta concentration describing total uncertainty (model + lot-to-lot). */
  concentration: number;
  probHighRisk: number;
  contributions: { feature: string; label: string; value: number }[];
  ood: string[];
  missing: string[];
}

export interface Distribution {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface StrategyResult {
  strategy: Strategy;
  head: number;
  morbidity: Distribution; // detected first treatments / head
  trueIncidence: Distribution;
  mortality: Distribution; // BRD deaths / head
  netReturnPerHead: Distribution; // USD / head over the feeding period
  lotValue: Distribution; // USD for whole lot
  directCostPerHead: number;
  amuRegimensPer100: Distribution;
  metaphylaxisRegimens: number;
  therapeuticRegimens: number;
  criticallyImportantShare: number;
  hospitalCurve: number[]; // expected head in hospital by day on feed 0..H
  hospitalCurveP90: number[];
  riderHoursPerDay: number[];
  chuteHours: number;
  /** Expected objective (USD lot value − stewardship/welfare weights). */
  objective: number;
  /** Expected BRD deaths in the lot. */
  deaths: number;
  /** Raw per-draw objective values (USD) for value-of-information work; emptied before crossing the worker boundary. */
  draws: Float64Array;
}

export interface LotAssessment {
  lot: LotArrival;
  risk: RiskPrediction;
  results: StrategyResult[];
  best: StrategyResult;
  statusQuo: StrategyResult;
  evpiLot: number;
  infoValue: { field: string; label: string; value: number; flipProb: number }[];
  confidence: "confident" | "caution" | "insufficient";
  confidenceReasons: string[];
  posteriorNote?: string;
  /** Arrival-day (prior) risk for on-feed lots, before updating with pulls to date. */
  arrivalRiskMean: number;
}
