import type { LotArrival, MetaphylaxisDrug } from "./types";

/**
 * Feature engineering shared by training and scoring. Only information available on arrival day
 * is used. Missing values are imputed and flagged rather than dropped, because incomplete records
 * are the norm (and the dashboard must say so).
 */
export interface FeatureSpec {
  name: string;
  group: FeatureGroup;
  label: string;
}

export type FeatureGroup =
  | "Arrival weight"
  | "Source & commingling"
  | "Transport stress"
  | "Vaccination history"
  | "Weaning status"
  | "Sex"
  | "Arrival season"
  | "Arrival weather"
  | "Pen & bunk space"
  | "Order-buyer risk call"
  | "Lot size"
  | "Yard"
  | "Metaphylaxis given";

export const FEATURES: FeatureSpec[] = [
  { name: "wt_below", group: "Arrival weight", label: "cwt below 800 lb" },
  { name: "wt_below_sq", group: "Arrival weight", label: "(cwt below 800 lb)²" },
  { name: "wt_above", group: "Arrival weight", label: "cwt above 800 lb" },
  { name: "src_precond", group: "Source & commingling", label: "Preconditioned" },
  { name: "src_auction_single", group: "Source & commingling", label: "Auction, single source" },
  { name: "src_auction_multi", group: "Source & commingling", label: "Auction, commingled" },
  { name: "src_unknown", group: "Source & commingling", label: "Source unknown" },
  { name: "log_sources", group: "Source & commingling", label: "log(1 + no. of sources)" },
  { name: "sources_missing", group: "Source & commingling", label: "No. of sources unknown" },
  { name: "haul_250", group: "Transport stress", label: "Haul distance (per 250 mi)" },
  { name: "shrink_over4", group: "Transport stress", label: "Shrink above 4 %" },
  { name: "haul_missing", group: "Transport stress", label: "Haul record missing" },
  { name: "vacc_no", group: "Vaccination history", label: "Not vaccinated" },
  { name: "vacc_unknown", group: "Vaccination history", label: "Vaccination unknown" },
  { name: "wean_no", group: "Weaning status", label: "Not weaned ≥ 45 d" },
  { name: "wean_unknown", group: "Weaning status", label: "Weaning unknown" },
  { name: "sex_heifer", group: "Sex", label: "Heifers" },
  { name: "sex_mixed", group: "Sex", label: "Mixed sex" },
  { name: "sex_bull", group: "Sex", label: "Bulls" },
  { name: "q1", group: "Arrival season", label: "Jan–Mar arrival" },
  { name: "q3", group: "Arrival season", label: "Jul–Sep arrival" },
  { name: "q4", group: "Arrival season", label: "Oct–Dec arrival" },
  { name: "swing_over15", group: "Arrival weather", label: "Day-to-day high swing > 15 °F" },
  { name: "cold", group: "Arrival weather", label: "Low below 15 °F" },
  { name: "wet", group: "Arrival weather", label: "> 0.75 in rain/snow in arrival week" },
  { name: "wx_missing", group: "Arrival weather", label: "Weather unavailable" },
  { name: "crowding", group: "Pen & bunk space", label: "m²/head below 16" },
  { name: "bunk_short", group: "Pen & bunk space", label: "cm bunk/head below 25" },
  { name: "buyer_high", group: "Order-buyer risk call", label: "Buyer flagged high risk" },
  { name: "log_head", group: "Lot size", label: "log(head)" },
  { name: "yard_ll", group: "Yard", label: "Llano Estacado" },
  { name: "yard_cv", group: "Yard", label: "Cimarron Valley" },
  { name: "yard_ar", group: "Yard", label: "Arkansas River" },
  { name: "meta_premium", group: "Metaphylaxis given", label: "Premium metaphylaxis given" },
  { name: "meta_economy", group: "Metaphylaxis given", label: "Economy metaphylaxis given" },
];

export const N_FEATURES = FEATURES.length;
export const FEATURE_GROUPS: FeatureGroup[] = Array.from(new Set(FEATURES.map((f) => f.group)));

const IMPUTE = { nSources: 2, haulMiles: 450, shrinkPct: 4.5 };

export function featurize(lot: LotArrival, meta: MetaphylaxisDrug | "none" = "none"): Float64Array {
  const x = new Float64Array(N_FEATURES);
  const below = Math.max(0, (800 - lot.weightLb) / 100);
  const month = new Date(lot.arrivalDate).getUTCMonth();
  const q = Math.floor(month / 3) + 1;
  const ns = lot.nSources ?? IMPUTE.nSources;
  const haul = lot.haulMiles ?? IMPUTE.haulMiles;
  const shrink = lot.shrinkPct ?? IMPUTE.shrinkPct;
  const wxMissing = lot.tempSwingF == null;
  const v = [
    below,
    below * below,
    Math.max(0, (lot.weightLb - 800) / 100),
    lot.source === "preconditioned" ? 1 : 0,
    lot.source === "auction_single" ? 1 : 0,
    lot.source === "auction_multi" ? 1 : 0,
    lot.source == null ? 1 : 0,
    Math.log1p(ns),
    lot.nSources == null ? 1 : 0,
    haul / 250,
    Math.max(0, shrink - 4),
    lot.haulMiles == null ? 1 : 0,
    lot.vaccinated === "no" ? 1 : 0,
    lot.vaccinated === "unknown" ? 1 : 0,
    lot.weaned === "no" ? 1 : 0,
    lot.weaned === "unknown" ? 1 : 0,
    lot.sex === "heifer" ? 1 : 0,
    lot.sex === "mixed" ? 1 : 0,
    lot.sex === "bull" ? 1 : 0,
    q === 1 ? 1 : 0,
    q === 3 ? 1 : 0,
    q === 4 ? 1 : 0,
    wxMissing ? 0 : Math.max(0, (lot.tempSwingF ?? 0) - 15),
    lot.minTempF != null && lot.minTempF < 15 ? 1 : 0,
    lot.precipIn != null && lot.precipIn > 0.75 ? 1 : 0,
    wxMissing ? 1 : 0,
    Math.max(0, 16 - lot.penAreaM2PerHead),
    Math.max(0, 25 - lot.bunkCmPerHead),
    lot.buyerHighRisk ? 1 : 0,
    Math.log(Math.max(1, lot.head)),
    lot.yardId === "llano" ? 1 : 0,
    lot.yardId === "cimarron" ? 1 : 0,
    lot.yardId === "arkansas-river" ? 1 : 0,
    meta === "premium" ? 1 : 0,
    meta === "economy" ? 1 : 0,
  ];
  for (let i = 0; i < N_FEATURES; i++) x[i] = v[i];
  return x;
}

/** Which decision-relevant fields are missing for a lot (drives the confidence flag and value-of-information). */
export function missingFields(lot: LotArrival): { field: keyof LotArrival; label: string }[] {
  const out: { field: keyof LotArrival; label: string }[] = [];
  if (lot.source == null) out.push({ field: "source", label: "Cattle source" });
  if (lot.vaccinated === "unknown") out.push({ field: "vaccinated", label: "Vaccination history" });
  if (lot.weaned === "unknown") out.push({ field: "weaned", label: "Weaning status" });
  if (lot.nSources == null) out.push({ field: "nSources", label: "Number of sources" });
  if (lot.haulMiles == null) out.push({ field: "haulMiles", label: "Haul distance" });
  if (lot.tempSwingF == null) out.push({ field: "tempSwingF", label: "Arrival weather" });
  return out;
}
