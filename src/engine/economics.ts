import type { Params } from "./params";

/**
 * Feeding-period net return per head placed, following the structural equations of
 * Weber, Schroeder, Renter, Pendell & Tonsor (2024, AAEA poster):
 *   ADG  = −1.2175 + 0.2881·STEER + 0.6703·ln(PWT) − 0.0062·TRT1X − 0.0071·TRT2X − 0.0059·TRT3X
 *   AFC  = −0.3272 − 0.3206·STEER + 1.0199·ln(PWT) − 0.0139·TRT1X + 0.0280·TRT2X + 0.0309·TRT3X
 *   VCPH = 20.2466 + 0.3886·STEER − 0.8346·ln(PWT) + 0.3421·TRT1X + 0.5113·TRT2X + 1.0126·TRT3X
 * TRTnX are the percentages (0–100) of the pen treated exactly n times (3 = three or more).
 * Revenue, feed, yardage, interest and cull terms follow the poster; the team's simplifications are
 * that dead animals incur feed/yardage for ~25 days and culls for half the feeding period.
 *
 * In the decision engine this function prices the HEALTHY baseline pen (TRT = 0). Disease is then
 * charged case by case (Rojas et al. 2022: $151.18 lost value per morbid animal; Weber VCPH increments
 * for re-treatments; death loss from these same components). Reason: in the published coefficients
 * TRT1X lowers AFC (better conversion), which offsets most of the ADG penalty per head; Weber's large
 * net-return losses arise through the mortality distribution, whose equation is not printed.
 */
export interface EconomicsInput {
  placementWt: number;
  steer: boolean;
  trt1: number;
  trt2: number;
  trt3: number;
  mortality: number; // fraction of head placed that die over the feeding period
}

export interface EconomicsBreakdown {
  adg: number;
  afc: number;
  vcph: number;
  dof: number;
  purchase: number;
  feed: number;
  yardage: number;
  interest: number;
  revenue: number;
  net: number;
}

const interp = (w: number, xs: number[], ys: number[]) => {
  if (w <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (w <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (w - xs[i - 1])) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
};

const CULL_WEIGHT = [444, 524, 624]; // dressed lb (Weber)
const CULL_PRICE = 1.05; // $/dressed lb (Weber)
const DAYS_TO_DEATH = 25;

export function netReturn(e: EconomicsInput, P: Params): EconomicsBreakdown {
  const lnP = Math.log(e.placementWt);
  const S = e.steer ? 1 : 0;
  const adg = Math.max(1.2, -1.2175 + 0.2881 * S + 0.6703 * lnP - 0.0062 * e.trt1 - 0.0071 * e.trt2 - 0.0059 * e.trt3);
  const afc = Math.max(4, -0.3272 - 0.3206 * S + 1.0199 * lnP - 0.0139 * e.trt1 + 0.028 * e.trt2 + 0.0309 * e.trt3);
  const vcph = Math.max(0, 20.2466 + 0.3886 * S - 0.8346 * lnP + 0.3421 * e.trt1 + 0.5113 * e.trt2 + 1.0126 * e.trt3);
  const W = [550, 700, 850];
  const cull = interp(e.placementWt, W, [P.cullRate550, P.cullRate700, P.cullRate850]);
  const frp = interp(e.placementWt, W, [P.feederPrice550, P.feederPrice700, P.feederPrice850]);
  const csw = (e.steer ? P.finishWeightSteer : P.finishWeightHeifer) + P.finishWeightSlope * (e.placementWt - 700);
  const phi = Math.min(0.9, e.mortality);
  const alive = Math.max(0, 1 - phi - cull);
  const dof = Math.max(60, (csw - e.placementWt) / adg);
  const purchase = frp * e.placementWt;
  const gainAlive = csw - e.placementWt;
  const feed =
    P.cornPrice * afc * (alive * gainAlive + phi * adg * DAYS_TO_DEATH + cull * adg * (dof / 2));
  const yardage = P.yardagePerDay * (alive * dof + phi * DAYS_TO_DEATH + cull * (dof / 2));
  const interest = (0.5 * (yardage + feed + vcph) + purchase) * dof * (P.interestRate / 365);
  const cullW = interp(e.placementWt, W, CULL_WEIGHT);
  const revenue = P.fedPrice * csw * (1 - P.shrink) * alive + cull * cullW * CULL_PRICE;
  const net = revenue - purchase - feed - yardage - vcph - interest;
  return { adg, afc, vcph, dof, purchase, feed, yardage, interest, revenue, net };
}

/**
 * Economic loss when an animal dies (vs. finishing healthy): the healthy net return forgone plus the
 * purchase cost and costs already incurred (feed and yardage for ~25 days, processing/vet cost).
 */
export function deathLoss(base: EconomicsBreakdown, P: Params): number {
  const incurred = P.yardagePerDay * DAYS_TO_DEATH + P.cornPrice * base.afc * base.adg * DAYS_TO_DEATH + base.vcph;
  return Math.max(0, base.net) + base.purchase + incurred;
}

/** Price presets the manager can switch between. */
export const PRICE_PRESETS = {
  weber: {
    label: "Weber et al. 2024 simulation prices",
    values: { fedPrice: 1.2628, feederPrice550: 1.7397, feederPrice700: 1.557, feederPrice850: 1.4558 },
  },
  ers2025: {
    label: "USDA ERS, Oct 2025 (OKC feeders; TX/OK/NM fed steers)",
    values: { fedPrice: 2.3868, feederPrice550: 4.5645, feederPrice700: 3.86, feederPrice850: 3.62 },
  },
} as const;
