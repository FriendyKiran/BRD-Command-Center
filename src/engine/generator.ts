import {
  betaMeanConc,
  binomial,
  clamp,
  gammaPmf,
  invLogit,
  lognormalMeanSd,
  mulberry32,
  normal,
  poisson,
  type Rng,
  weightedChoice,
} from "./rng";
import type { HistoricalLot, LotArrival, Sex, SourceType, TriState, Yard, YardId } from "./types";
import { arrivalWeather, type WeatherData } from "./weather";
import { STRATEGY_INDEX, statusQuoStrategy, YARDS } from "./yards";

/**
 * SYNTHETIC DATA GENERATOR
 * ------------------------
 * No operational records were provided, so we simulate four yards' arrival records with a hidden
 * "true" BRD process. Effect directions follow the risk-factor literature supplied with the
 * challenge (Adekunle et al. 2026 scoping review; Adekunle & Kaniyamattam 2026; Rojas et al. 2022).
 * Effect magnitudes are team assumptions chosen so cohort morbidity spans the range those sources
 * describe. The weather inputs are REAL NOAA observations, so seasonal and weather-driven variation
 * is genuine. The decision engine never sees TRUTH_COEFS; it must learn from records like a real yard.
 */
export const TRUTH_COEFS = {
  intercept: -4.0,
  weightPer100Below800: 0.36,
  weightQuad: 0.035,
  source: { ranch_direct: 0, preconditioned: -0.35, auction_single: 0.35, auction_multi: 0.5 } as Record<SourceType, number>,
  logSources: 0.25,
  haulPer250mi: 0.1,
  shrinkPerPctOver4: 0.06,
  unvaccinated: 0.35,
  unweaned: 0.45,
  auctionXunweaned: 0.2,
  sex: { steer: 0, heifer: 0.1, mixed: 0.25, bull: 0.35 } as Record<Sex, number>,
  month: [0.12, 0.08, 0.02, 0, -0.05, -0.08, -0.05, 0.02, 0.15, 0.28, 0.3, 0.2],
  swingPerFOver15: 0.022,
  coldBelow15F: 0.2,
  wetWeekOver075in: 0.15,
  crowdingPerM2Below16: 0.03,
  bunkPerCmBelow25: 0.015,
  piExposure: 0.5,
  lotNoiseSd: 1.15,
  metaRR: { premium: 0.48, economy: 0.66 },
  historicalSensitivity: { "palo-duro": 0.66, llano: 0.56, cimarron: 0.66, "arkansas-river": 0.6 } as Record<YardId, number>,

  // ── Structure that an additive model cannot read off directly ──
  /** Weather stress scales with lightness: multiplier 1 + k × (100s of lb below 800). */
  lightXweather: 0.3,
  /** Long hauls hurt unweaned calves more (per 250 mi). */
  haulXunweaned: 0.14,
  /** Shrink has a threshold: severe dehydration above 7 %. */
  shrinkOver7: 0.3,
  /** Big commingled lots (> 250 head of multi-source auction cattle). */
  bigCommingled: 0.25,
  /** Light bulls (< 600 lb) are castrated on arrival: extra stress. */
  lightBull: 0.25,
  /** Vaccine protection retained in commingled auction calves (immune system already stressed). */
  vaccineEfficacyCommingled: 0.4,
  /** Crowding matters more during the fall run. */
  crowdingFallMult: 2,
  /** Seasonal amplitude differs by yard (exposure, pen design, wind). */
  yardSeasonAmp: { "palo-duro": 1.4, llano: 1.0, cimarron: 0.6, "arkansas-river": 1.15 } as Record<YardId, number>,
  /** Unrecorded pathogen pressure per yard: daily AR(1), stationary SD on the logit scale. */
  pressureSd: 0.6,
  pressurePhi: 0.985,
  /** 2025 shift (new strain): vaccine protects less, cold stress bites harder. */
  drift2025: { from: "2025-01-01", vaccineEfficacy: 0.6, weatherMult: 1.3 },
  /** Lot-to-lot variation in metaphylaxis response (SD of log RR); PI-exposed lots respond poorly. */
  metaRRLogSd: 0.25,
  metaRRPiExposed: 0.85,
  /** Record errors: pay weight vs true, false "vaccinated" entries, origin miscounts, source misclassification. */
  recordError: { weightSd: 30, vaccFalseYes: 0.15, nSourcesUndercount: 0.35, sourceMisclass: 0.1 },
  /** Within-lot overdispersion of case counts (beta concentration). */
  withinLotConcentration: 70,
};

export const SNAPSHOT_DATE = "2025-10-20";
export const HISTORY_START = "2023-01-02";
const HORIZON = 45;
const DAY = 86400000;
const MONTH_ARRIVAL_WEIGHT = [0.75, 0.6, 0.7, 0.8, 0.8, 0.85, 0.95, 1.05, 1.35, 1.6, 1.45, 1.0];
const PREFIX: Record<YardId, string> = { "palo-duro": "PD", llano: "LE", cimarron: "CV", "arkansas-river": "AR" };

export interface TruthRecord {
  lotId: string;
  trueLogitNoMeta: number;
  trueIncidenceNoMeta: number;
  vaccinatedTrue: boolean;
  weanedTrue: boolean;
  sourceTrue: SourceType;
  nSourcesTrue: number;
  piExposure: boolean;
  /** This lot's true BRD risk ratio under each metaphylaxis class (lot-to-lot response varies). */
  rrPremiumTrue: number;
  rrEconomyTrue: number;
}

export interface GeneratedData {
  history: HistoricalLot[];
  current: LotArrival[];
  truth: TruthRecord[];
  meta: { seed: number; snapshot: string; historyStart: string; generatedAt: string; weatherCoverage: number };
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function latentLot(rng: Rng, yard: Yard, date: string) {
  const p = yard.profile;
  const month = new Date(date).getUTCMonth();
  const fall = month >= 8 && month <= 11;
  const source = weightedChoice(rng, Object.keys(p.sourceMix) as SourceType[], Object.values(p.sourceMix));
  const sex = weightedChoice(rng, Object.keys(p.sexMix) as Sex[], Object.values(p.sexMix));
  const weightAdj = (fall ? -45 : 15) + (source === "auction_multi" ? -35 : source === "preconditioned" ? 25 : 0);
  const weightLb = Math.round(clamp(normal(rng, p.weightMean + weightAdj, p.weightSd), 340, 1020));
  const head = Math.round(clamp(lognormalMeanSd(rng, source === "auction_multi" ? 120 : 150, 60), 35, 420));
  const nSources =
    source === "ranch_direct" ? 1 : source === "preconditioned" ? 1 + poisson(rng, 0.4) : source === "auction_single" ? 1 + poisson(rng, 1) : 4 + poisson(rng, 5);
  const haulBase = p.haulMean * (source.startsWith("auction") ? 1.15 : 0.8);
  const haulMiles = Math.round(clamp(lognormalMeanSd(rng, haulBase, haulBase * 0.45), 25, 1650));
  const shrinkPct = Math.round(clamp(2.6 + haulMiles / 260 + normal(rng, 0, 0.9), 1.5, 12) * 10) / 10;
  const pVacc = { ranch_direct: 0.72, preconditioned: 0.97, auction_single: 0.38, auction_multi: 0.2 }[source];
  const pWean = { ranch_direct: 0.5, preconditioned: 0.98, auction_single: 0.22, auction_multi: 0.15 }[source];
  const vaccinated = rng() < pVacc;
  const weaned = rng() < pWean;
  const pi = rng() < (source === "auction_multi" ? 0.07 : 0.025);
  const penAreaM2PerHead = Math.round(clamp(normal(rng, 17.5, 3), 10, 28) * 10) / 10;
  const bunkCmPerHead = Math.round(clamp(normal(rng, 28, 4), 18, 40));
  return { source, sex, weightLb, head, nSources, haulMiles, shrinkPct, vaccinated, weaned, pi, penAreaM2PerHead, bunkCmPerHead };
}

type Latent = ReturnType<typeof latentLot>;

export function trueLogit(
  L: Latent,
  yard: Yard,
  date: string,
  wx: { tempSwingF: number | null; minTempF: number | null; precipIn: number | null },
  noise: number,
  pressure = 0,
) {
  const c = TRUTH_COEFS;
  const month = new Date(date).getUTCMonth();
  const drift = date >= c.drift2025.from;
  const below = Math.max(0, (800 - L.weightLb) / 100);
  let x = c.intercept + yard.profile.yardEffect;
  x += c.weightPer100Below800 * below + c.weightQuad * below * below - 0.12 * Math.max(0, (L.weightLb - 800) / 100);
  x += c.source[L.source] + c.logSources * Math.log1p(L.nSources);
  x += c.haulPer250mi * (L.haulMiles / 250) + c.shrinkPerPctOver4 * Math.max(0, L.shrinkPct - 4);
  if (L.shrinkPct > 7) x += c.shrinkOver7;
  // Vaccination protects fully only in calves that are not stressed by commingling, and less after the 2025 strain shift.
  const efficacy = (L.source === "auction_multi" ? c.vaccineEfficacyCommingled : 1) * (drift ? c.drift2025.vaccineEfficacy : 1);
  x += c.unvaccinated * (L.vaccinated ? 1 - efficacy : 1);
  if (!L.weaned) x += c.unweaned + c.haulXunweaned * (L.haulMiles / 250);
  if (!L.weaned && L.source.startsWith("auction")) x += c.auctionXunweaned;
  if (L.source === "auction_multi" && L.head > 250) x += c.bigCommingled;
  x += c.sex[L.sex];
  if (L.sex === "bull" && L.weightLb < 600) x += c.lightBull;
  x += c.month[month] * c.yardSeasonAmp[yard.id];
  // Weather stress is amplified in light calves.
  const wxMult = (1 + c.lightXweather * below) * (drift ? c.drift2025.weatherMult : 1);
  let w = 0;
  if (wx.tempSwingF != null) w += c.swingPerFOver15 * Math.max(0, wx.tempSwingF - 15);
  if (wx.minTempF != null && wx.minTempF < 15) w += c.coldBelow15F;
  if (wx.precipIn != null && wx.precipIn > 0.75) w += c.wetWeekOver075in;
  x += w * wxMult;
  x += c.crowdingPerM2Below16 * Math.max(0, 16 - L.penAreaM2PerHead) * (month >= 8 && month <= 11 ? c.crowdingFallMult : 1);
  x += c.bunkPerCmBelow25 * Math.max(0, 25 - L.bunkCmPerHead);
  if (L.pi) x += c.piExposure;
  return x + pressure + noise;
}

function triFrom(v: boolean, missingRate: number, rng: Rng): TriState {
  return rng() < missingRate ? "unknown" : v ? "yes" : "no";
}

export function generateData(weather: WeatherData, seed = 20251020): GeneratedData {
  const rng = mulberry32(seed);
  const history: HistoricalLot[] = [];
  const current: LotArrival[] = [];
  const truth: TruthRecord[] = [];
  const snapshot = Date.parse(SNAPSHOT_DATE);
  const start = Date.parse(HISTORY_START);
  const scheduledEnd = snapshot + 13 * DAY;
  const onsetPmf = gammaPmf(2.2, 6, HORIZON);
  let wxHits = 0;
  let wxTotal = 0;

  const C = TRUTH_COEFS;
  const err = C.recordError;
  for (const yard of YARDS) {
    const seq: Record<string, number> = {};
    // Unrecorded pathogen pressure: slowly wandering, so outbreaks cluster in time within a yard.
    let pressure = normal(rng, 0, C.pressureSd);
    const innovationSd = C.pressureSd * Math.sqrt(1 - C.pressurePhi * C.pressurePhi);
    for (let t = start; t <= scheduledEnd; t += DAY) {
      const d = iso(t);
      pressure = C.pressurePhi * pressure + normal(rng, 0, innovationSd);
      const month = new Date(t).getUTCMonth();
      const lambda = (yard.profile.lotsPerYear / 365) * MONTH_ARRIVAL_WEIGHT[month] * (new Date(t).getUTCDay() === 0 ? 0.3 : 1.12);
      const n = poisson(rng, lambda);
      for (let k = 0; k < n; k++) {
        const L = latentLot(rng, yard, d);
        const wx = arrivalWeather(weather[yard.id], d);
        wxTotal++;
        if (wx.tempSwingF != null) wxHits++;
        const noise = normal(rng, 0, C.lotNoiseSd);
        const logitNoMeta = trueLogit(L, yard, d, wx, noise, pressure);
        const pNoMeta = invLogit(logitNoMeta);
        const key = d.slice(2).replace(/-/g, "");
        seq[key] = (seq[key] ?? 0) + 1;
        const lotId = `${PREFIX[yard.id]}-${key}-${String(seq[key]).padStart(2, "0")}`;
        // Order-buyer's risk call: informative but noisy; the buyer sees the cattle, not the yard's pathogen pressure.
        const buyerHighRisk = logitNoMeta - noise - pressure + normal(rng, 0, 0.7) > -1.85;
        const miss = yard.profile.missing;
        // What gets written down differs from the truth: pay weight, optimistic vaccination claims, origin counts.
        const recWeight = Math.round(clamp(L.weightLb + normal(rng, 0, err.weightSd), 340, 1020));
        const recVacc = L.vaccinated || rng() < err.vaccFalseYes;
        const recSources = L.nSources > 1 && rng() < err.nSourcesUndercount ? Math.max(1, Math.round(L.nSources * (0.3 + 0.5 * rng()))) : L.nSources;
        const recSource: SourceType =
          L.source.startsWith("auction") && rng() < err.sourceMisclass ? (L.source === "auction_multi" ? "auction_single" : "auction_multi") : L.source;
        const arrival: LotArrival = {
          lotId,
          yardId: yard.id,
          arrivalDate: d,
          head: L.head,
          sex: L.sex,
          weightLb: recWeight,
          source: rng() < miss.source ? null : recSource,
          nSources: rng() < miss.nSources ? null : recSources,
          haulMiles: rng() < miss.haul ? null : L.haulMiles,
          shrinkPct: rng() < miss.haul ? null : L.shrinkPct,
          vaccinated: triFrom(recVacc, miss.vaccination, rng),
          weaned: triFrom(L.weaned, miss.weaned, rng),
          buyerHighRisk,
          tempSwingF: wx.tempSwingF,
          minTempF: wx.minTempF,
          precipIn: wx.precipIn,
          penAreaM2PerHead: L.penAreaM2PerHead,
          bunkCmPerHead: L.bunkCmPerHead,
          febrilePct: null,
          casesToDate: null,
          daysOnFeed: null,
          status: "history",
          processedWith: null,
        };
        const truthRec: TruthRecord = {
          lotId,
          trueLogitNoMeta: logitNoMeta,
          trueIncidenceNoMeta: pNoMeta,
          vaccinatedTrue: L.vaccinated,
          weanedTrue: L.weaned,
          sourceTrue: L.source,
          nSourcesTrue: L.nSources,
          piExposure: L.pi,
          rrPremiumTrue: C.metaRR.premium,
          rrEconomyTrue: C.metaRR.economy,
        };
        truth.push(truthRec);

        // Historical management decision: the yard SOP, with ~8 % ad-hoc deviations.
        // The SOP is applied to the recorded weight and source, not the true ones.
        let strat = statusQuoStrategy(yard, { weightLb: recWeight, source: recSource, buyerHighRisk });
        if (rng() < 0.08) strat = strat.antimicrobial === "none" ? STRATEGY_INDEX["prem-std"] : STRATEGY_INDEX["none-std"];
        const metaGiven = strat.antimicrobial.startsWith("metaphylaxis");
        const drug = strat.antimicrobial === "metaphylaxis-economy" ? "economy" : "premium";
        // Response to metaphylaxis varies by lot; PI-exposed lots respond poorly (ongoing viral challenge).
        // One response multiplier per lot applies to either drug class, so the audit file can score any option.
        const response = Math.exp(normal(rng, 0, C.metaRRLogSd)) * (L.pi ? 1 / C.metaRRPiExposed : 1);
        truthRec.rrPremiumTrue = clamp(C.metaRR.premium * response, 0.15, 1);
        truthRec.rrEconomyTrue = clamp(C.metaRR.economy * response, 0.15, 1);
        const rr = drug === "premium" ? truthRec.rrPremiumTrue : truthRec.rrEconomyTrue;
        const pEff = metaGiven ? pNoMeta * rr : pNoMeta;
        const cases = binomial(rng, L.head, betaMeanConc(rng, pEff, C.withinLotConcentration));
        const sens = C.historicalSensitivity[yard.id];
        const detected = binomial(rng, cases, sens);

        const arrivalT = t;
        const dof = Math.floor((snapshot - arrivalT) / DAY);
        if (dof >= HORIZON) {
          const t2 = binomial(rng, detected, 0.149);
          const t3 = binomial(rng, t2, 0.12);
          const brdDeaths = binomial(rng, detected, 0.065) + binomial(rng, cases - detected, 0.1);
          history.push({
            ...arrival,
            metaphylaxisGiven: metaGiven,
            metaphylaxisDrug: metaGiven ? drug : "none",
            brdTreated45: detected,
            treated2x: t2,
            treated3x: t3,
            brdDeaths45: brdDeaths,
            otherDeaths45: binomial(rng, L.head, 0.004),
            morbidity45: detected / L.head,
            highRisk: detected / L.head >= 0.15,
          });
        } else if (dof >= 0) {
          const shift = metaGiven ? 7 : 0;
          let frac = 0;
          for (let i = 0; i <= Math.min(HORIZON, dof - shift); i++) frac += onsetPmf[i];
          current.push({ ...arrival, status: "on-feed", daysOnFeed: dof, casesToDate: binomial(rng, detected, frac), processedWith: strat.id });
        } else {
          current.push({ ...arrival, status: "scheduled", notes: "Order-buyer pre-arrival record; weather from NOAA observations treated as forecast." });
        }
      }
    }
  }
  return {
    history,
    current,
    truth,
    meta: { seed, snapshot: SNAPSHOT_DATE, historyStart: HISTORY_START, generatedAt: new Date().toISOString(), weatherCoverage: wxTotal ? wxHits / wxTotal : 0 },
  };
}
