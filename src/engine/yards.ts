import type { Strategy, Yard, YardId } from "./types";

/**
 * Four fictional yards. Locations, cattle mixes, capacities and SOPs are team-defined so that the
 * demonstration contains meaningful operating differences (cattle risk mix, labor, hospital space,
 * record completeness, current metaphylaxis policy). Weather is real NOAA data from the nearest
 * first-order station.
 */
export const YARDS: Yard[] = [
  {
    id: "palo-duro",
    name: "Palo Duro Feedyard",
    town: "Hereford",
    state: "TX",
    lon: -102.397,
    lat: 34.815,
    weatherStation: "Amarillo (USW00023047)",
    capacityHead: 42000,
    hospitalPenHead: 560,
    hospitalBaseline: 60,
    penRiders: 8,
    riderHoursPerDay: 16,
    chuteHoursPerDay: 18,
    character: "Buys lightweight, commingled sale-barn calves hauled from the Southeast. Highest risk mix and the largest hospital; in the fall run, pen-rider time still binds.",
    profile: {
      lotsPerYear: 330,
      sourceMix: { ranch_direct: 0.12, preconditioned: 0.1, auction_single: 0.28, auction_multi: 0.5 },
      weightMean: 565,
      weightSd: 85,
      haulMean: 820,
      sexMix: { steer: 0.5, heifer: 0.25, mixed: 0.15, bull: 0.1 },
      missing: { vaccination: 0.3, weaned: 0.35, nSources: 0.2, haul: 0.04, source: 0.03 },
      yardEffect: -0.05,
    },
    sop: {
      summary: "Premium metaphylaxis for every lot under 600 lb or from multi-source auctions; standard pen riding.",
      metaphylaxisIfWeightBelow: 600,
      metaphylaxisIfSource: ["auction_multi"],
      metaphylaxisIfBuyerHighRisk: true,
      drug: "premium",
      surveillance: "standard",
    },
  },
  {
    id: "llano",
    name: "Llano Estacado Feeders",
    town: "Lubbock",
    state: "TX",
    lon: -101.86,
    lat: 33.62,
    weatherStation: "Lubbock (USW00023042)",
    capacityHead: 24000,
    hospitalPenHead: 200,
    hospitalBaseline: 30,
    penRiders: 4,
    riderHoursPerDay: 8.5,
    chuteHoursPerDay: 12,
    character: "Mixed cattle sources and a thin crew. Its weight-only SOP leaves heavy, buyer-flagged lots untreated.",
    profile: {
      lotsPerYear: 210,
      sourceMix: { ranch_direct: 0.28, preconditioned: 0.2, auction_single: 0.3, auction_multi: 0.22 },
      weightMean: 640,
      weightSd: 100,
      haulMean: 480,
      sexMix: { steer: 0.55, heifer: 0.3, mixed: 0.1, bull: 0.05 },
      missing: { vaccination: 0.35, weaned: 0.4, nSources: 0.25, haul: 0.05, source: 0.05 },
      yardEffect: 0.0,
    },
    sop: {
      summary: "Economy metaphylaxis only for lots under 550 lb; standard pen riding.",
      metaphylaxisIfWeightBelow: 550,
      metaphylaxisIfSource: [],
      metaphylaxisIfBuyerHighRisk: false,
      drug: "economy",
      surveillance: "standard",
    },
  },
  {
    id: "cimarron",
    name: "Cimarron Valley Cattle Co.",
    town: "Dodge City",
    state: "KS",
    lon: -100.017,
    lat: 37.753,
    weatherStation: "Dodge City (USW00013985)",
    capacityHead: 52000,
    hospitalPenHead: 230,
    hospitalBaseline: 50,
    penRiders: 9,
    riderHoursPerDay: 18,
    chuteHoursPerDay: 20,
    character: "Mostly ranch-direct and preconditioned yearlings off wheat pasture. Low risk, good records.",
    profile: {
      lotsPerYear: 360,
      sourceMix: { ranch_direct: 0.45, preconditioned: 0.33, auction_single: 0.15, auction_multi: 0.07 },
      weightMean: 790,
      weightSd: 90,
      haulMean: 260,
      sexMix: { steer: 0.6, heifer: 0.32, mixed: 0.06, bull: 0.02 },
      missing: { vaccination: 0.12, weaned: 0.15, nSources: 0.1, haul: 0.02, source: 0.01 },
      yardEffect: -0.1,
    },
    sop: {
      summary: "Metaphylaxis only when the order buyer flags a lot as high risk; standard pen riding.",
      metaphylaxisIfWeightBelow: null,
      metaphylaxisIfSource: [],
      metaphylaxisIfBuyerHighRisk: true,
      drug: "premium",
      surveillance: "standard",
    },
  },
  {
    id: "arkansas-river",
    name: "Arkansas River Feedyard",
    town: "Garden City",
    state: "KS",
    lon: -100.873,
    lat: 37.971,
    weatherStation: "Garden City (USW00023064)",
    capacityHead: 30000,
    hospitalPenHead: 220,
    hospitalBaseline: 40,
    penRiders: 5,
    riderHoursPerDay: 9.5,
    chuteHoursPerDay: 12,
    character: "Recently acquired; incomplete arrival records and a blanket-metaphylaxis habit. Pen-rider time binds and the hospital runs near full.",
    profile: {
      lotsPerYear: 240,
      sourceMix: { ranch_direct: 0.3, preconditioned: 0.18, auction_single: 0.27, auction_multi: 0.25 },
      weightMean: 680,
      weightSd: 110,
      haulMean: 420,
      sexMix: { steer: 0.5, heifer: 0.35, mixed: 0.12, bull: 0.03 },
      missing: { vaccination: 0.55, weaned: 0.5, nSources: 0.45, haul: 0.15, source: 0.2 },
      yardEffect: 0.05,
    },
    sop: {
      summary: "Premium metaphylaxis for every lot under 725 lb regardless of history; standard pen riding.",
      metaphylaxisIfWeightBelow: 725,
      metaphylaxisIfSource: [],
      metaphylaxisIfBuyerHighRisk: true,
      drug: "premium",
      surveillance: "standard",
    },
  },
];

export const YARD_INDEX: Record<YardId, Yard> = Object.fromEntries(YARDS.map((y) => [y.id, y])) as Record<YardId, Yard>;

export const STRATEGIES: Strategy[] = [
  { id: "none-std", antimicrobial: "none", surveillance: "standard", label: "No metaphylaxis · standard pull-and-treat", short: "Pull & treat" },
  { id: "none-enh", antimicrobial: "none", surveillance: "enhanced", label: "No metaphylaxis · enhanced surveillance", short: "Watch closely" },
  { id: "screen-std", antimicrobial: "targeted-screen", surveillance: "standard", label: "Chute-side fever screen → treat febrile only", short: "Targeted" },
  { id: "screen-enh", antimicrobial: "targeted-screen", surveillance: "enhanced", label: "Fever screen + enhanced surveillance", short: "Targeted + watch" },
  { id: "eco-std", antimicrobial: "metaphylaxis-economy", surveillance: "standard", label: "Economy-class metaphylaxis (whole lot)", short: "Meta · economy" },
  { id: "prem-std", antimicrobial: "metaphylaxis-premium", surveillance: "standard", label: "Premium-class metaphylaxis (whole lot)", short: "Meta · premium" },
  { id: "prem-enh", antimicrobial: "metaphylaxis-premium", surveillance: "enhanced", label: "Premium metaphylaxis + enhanced surveillance", short: "Meta + watch" },
];

export const STRATEGY_INDEX: Record<string, Strategy> = Object.fromEntries(STRATEGIES.map((s) => [s.id, s]));

/** The yard's current operating approach applied to a lot: the baseline every option is compared against. */
export function statusQuoStrategy(yard: Yard, lot: { weightLb: number; source: string | null; buyerHighRisk: boolean }): Strategy {
  const s = yard.sop;
  const meta =
    (s.metaphylaxisIfWeightBelow !== null && lot.weightLb < s.metaphylaxisIfWeightBelow) ||
    (lot.source !== null && (s.metaphylaxisIfSource as string[]).includes(lot.source)) ||
    (s.metaphylaxisIfBuyerHighRisk && lot.buyerHighRisk);
  if (!meta) return STRATEGY_INDEX[s.surveillance === "enhanced" ? "none-enh" : "none-std"];
  return STRATEGY_INDEX[s.drug === "premium" ? (s.surveillance === "enhanced" ? "prem-enh" : "prem-std") : "eco-std"];
}

export const SOURCE_LABEL: Record<string, string> = {
  ranch_direct: "Ranch-direct",
  preconditioned: "Preconditioned (VAC-45)",
  auction_single: "Auction · single source",
  auction_multi: "Auction · commingled",
};

export const SEX_LABEL: Record<string, string> = { steer: "Steers", heifer: "Heifers", mixed: "Mixed sex", bull: "Bulls / bull calves" };
