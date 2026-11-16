import type { HistoricalLot } from "./types";

const YARD_SHORT: Record<string, string> = { "palo-duro": "Palo Duro", llano: "Llano", cimarron: "Cimarron", "arkansas-river": "Ark. River" };

/**
 * EXPLORATORY DATA ANALYSIS on historical lot records. Lots are the sampling unit, so rates are
 * head-weighted ratio estimates with cluster-robust (lot-level) 95 % confidence intervals:
 *   r = Σ cases / Σ head,  SE(r) = sqrt( Σ (yᵢ − r·nᵢ)² / (k(k−1)) ) / n̄.
 */
export interface RateCell {
  level: string;
  lots: number;
  head: number;
  rate: number;
  lo: number;
  hi: number;
  highRiskShare: number;
}

export function ratio(lots: HistoricalLot[], level = ""): RateCell {
  const k = lots.length;
  const head = lots.reduce((s, l) => s + l.head, 0);
  const cases = lots.reduce((s, l) => s + l.brdTreated45, 0);
  const r = head ? cases / head : 0;
  let ss = 0;
  for (const l of lots) ss += (l.brdTreated45 - r * l.head) ** 2;
  const nbar = head / Math.max(1, k);
  const se = k > 1 ? Math.sqrt(ss / (k * (k - 1))) / nbar : 0;
  return { level, lots: k, head, rate: r, lo: Math.max(0, r - 1.96 * se), hi: r + 1.96 * se, highRiskShare: k ? lots.filter((l) => l.highRisk).length / k : 0 };
}

const groupBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
};

export interface Profile {
  id: string;
  label: string;
  note?: string;
  cells: RateCell[];
}

const band = (v: number | null, edges: number[], fmt: (a: number, b: number) => string, unknown = "Unknown") => {
  if (v == null) return unknown;
  for (let i = 0; i < edges.length - 1; i++) if (v < edges[i + 1]) return fmt(edges[i], edges[i + 1]);
  return fmt(edges[edges.length - 2], edges[edges.length - 1]);
};

/** Univariate (unadjusted) BRD morbidity by each candidate risk factor. */
export function riskProfiles(lots: HistoricalLot[]): Profile[] {
  const prof = (id: string, label: string, key: (l: HistoricalLot) => string, order?: string[], note?: string): Profile => {
    const g = groupBy(lots, key);
    const levels = order ? order.filter((o) => g.has(o)) : [...g.keys()].sort();
    return { id, label, note, cells: levels.map((lv) => ratio(g.get(lv)!, lv)) };
  };
  const wEdges = [300, 450, 550, 650, 750, 850, 1100];
  const wLabels = wEdges.slice(0, -1).map((a, i) => (i === wEdges.length - 2 ? `${a}+ lb` : `${a}–${wEdges[i + 1]} lb`));
  return [
    prof("weight", "Arrival weight", (l) => band(l.weightLb, wEdges, (a, b) => (b === 1100 ? `${a}+ lb` : `${a}–${b} lb`)), wLabels),
    prof(
      "source",
      "Cattle source",
      (l) => (({ ranch_direct: "Ranch direct", preconditioned: "Preconditioned", auction_single: "Auction, single", auction_multi: "Auction, commingled" }) as Record<string, string>)[l.source ?? ""] ?? "Unknown",
      ["Preconditioned", "Ranch direct", "Auction, single", "Auction, commingled", "Unknown"],
    ),
    prof("nSources", "Number of origins", (l) => (l.nSources == null ? "Unknown" : l.nSources === 1 ? "1" : l.nSources <= 3 ? "2–3" : l.nSources <= 7 ? "4–7" : "8+"), ["1", "2–3", "4–7", "8+", "Unknown"]),
    prof("vaccinated", "Pre-arrival vaccination", (l) => ({ yes: "Yes", no: "No", unknown: "Unknown" })[l.vaccinated], ["Yes", "No", "Unknown"]),
    prof("weaned", "Weaned ≥ 45 d", (l) => ({ yes: "Yes", no: "No", unknown: "Unknown" })[l.weaned], ["Yes", "No", "Unknown"]),
    prof("buyer", "Order-buyer risk call", (l) => (l.buyerHighRisk ? "Flagged high" : "Not flagged"), ["Not flagged", "Flagged high"]),
    prof("haul", "Haul distance", (l) => band(l.haulMiles, [0, 250, 500, 800, 2000], (a, b) => (b === 2000 ? `${a}+ mi` : `${a}–${b} mi`)), ["0–250 mi", "250–500 mi", "500–800 mi", "800+ mi", "Unknown"]),
    prof("swing", "Arrival-week temperature swing", (l) => band(l.tempSwingF, [0, 10, 15, 20, 30, 80], (a, b) => (b === 80 ? `${a}+ °F` : `${a}–${b} °F`)), ["0–10 °F", "10–15 °F", "15–20 °F", "20–30 °F", "30+ °F", "Unknown"]),
    prof("sex", "Sex", (l) => ({ steer: "Steers", heifer: "Heifers", mixed: "Mixed", bull: "Bulls" })[l.sex], ["Steers", "Heifers", "Mixed", "Bulls"]),
    prof("quarter", "Arrival quarter", (l) => `Q${Math.floor(new Date(l.arrivalDate).getUTCMonth() / 3) + 1}`, ["Q1", "Q2", "Q3", "Q4"]),
    prof("yard", "Yard", (l) => YARD_SHORT[l.yardId] ?? l.yardId, ["Cimarron", "Ark. River", "Llano", "Palo Duro"]),
    prof(
      "meta",
      "Metaphylaxis given",
      (l) => (l.metaphylaxisGiven ? (l.metaphylaxisDrug === "premium" ? "Premium" : "Economy") : "None"),
      ["None", "Economy", "Premium"],
      "Unadjusted: treated lots look as risky or riskier because riskier lots get treated (confounding by indication).",
    ),
  ];
}

/** Distribution of lot morbidity (2-point bins), split by yard. */
export function morbidityHistogram(lots: HistoricalLot[], yards: string[], width = 0.02, max = 0.5) {
  const nb = Math.round(max / width);
  const rows = Array.from({ length: nb }, (_, b) => ({ bin: b * width, label: `${Math.round(b * width * 100)}%`, ...Object.fromEntries(yards.map((y) => [y, 0])) }) as Record<string, number | string>);
  for (const l of lots) {
    const b = Math.min(nb - 1, Math.floor(l.morbidity45 / width));
    (rows[b][l.yardId] as number)++;
  }
  return rows;
}

/** Quantiles of lot morbidity per group (for range plots). */
export function morbidityQuantiles(lots: HistoricalLot[], key: (l: HistoricalLot) => string) {
  return [...groupBy(lots, key).entries()].map(([g, ls]) => {
    const s = ls.map((l) => l.morbidity45).sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
    return { group: g, n: s.length, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), mean: s.reduce((a, b) => a + b, 0) / s.length };
  });
}

export const MISSING_FIELDS: { id: string; label: string; isMissing: (l: HistoricalLot) => boolean }[] = [
  { id: "source", label: "Cattle source", isMissing: (l) => l.source == null },
  { id: "nSources", label: "No. of origins", isMissing: (l) => l.nSources == null },
  { id: "vaccinated", label: "Vaccination", isMissing: (l) => l.vaccinated === "unknown" },
  { id: "weaned", label: "Weaning", isMissing: (l) => l.weaned === "unknown" },
  { id: "haulMiles", label: "Haul distance", isMissing: (l) => l.haulMiles == null },
  { id: "shrinkPct", label: "Shrink", isMissing: (l) => l.shrinkPct == null },
  { id: "weather", label: "Arrival weather", isMissing: (l) => l.tempSwingF == null },
];

/** Missingness by field × yard, plus whether missingness itself is associated with BRD (informative missingness). */
export function missingness(lots: HistoricalLot[], yards: string[]) {
  return MISSING_FIELDS.map((f) => {
    const miss = lots.filter(f.isMissing);
    const pres = lots.filter((l) => !f.isMissing(l));
    return {
      field: f.label,
      overall: miss.length / lots.length,
      byYard: Object.fromEntries(yards.map((y) => {
        const ys = lots.filter((l) => l.yardId === y);
        return [y, ys.filter(f.isMissing).length / Math.max(1, ys.length)];
      })) as Record<string, number>,
      whenMissing: ratio(miss, "missing"),
      whenPresent: ratio(pres, "recorded"),
    };
  });
}

export const NUMERIC_VARS: { id: string; label: string; get: (l: HistoricalLot) => number | null }[] = [
  { id: "morbidity", label: "BRD morbidity", get: (l) => l.morbidity45 },
  { id: "weight", label: "Arrival weight", get: (l) => l.weightLb },
  { id: "head", label: "Lot size", get: (l) => l.head },
  { id: "nSources", label: "No. of origins", get: (l) => l.nSources },
  { id: "haul", label: "Haul miles", get: (l) => l.haulMiles },
  { id: "shrink", label: "Shrink %", get: (l) => l.shrinkPct },
  { id: "swing", label: "Temp swing", get: (l) => l.tempSwingF },
  { id: "minTemp", label: "Min temp", get: (l) => l.minTempF },
  { id: "precip", label: "Precipitation", get: (l) => l.precipIn },
  { id: "penArea", label: "Pen m²/head", get: (l) => l.penAreaM2PerHead },
  { id: "bunk", label: "Bunk cm/head", get: (l) => l.bunkCmPerHead },
  { id: "buyer", label: "Buyer flag", get: (l) => (l.buyerHighRisk ? 1 : 0) },
];

const ranks = (xs: number[]) => {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) j++;
    for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
};

const pearson = (a: number[], b: number[]) => {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb || 1);
};

/** Spearman rank correlations on pairwise-complete lots. */
export function spearmanMatrix(lots: HistoricalLot[]) {
  const vars = NUMERIC_VARS;
  const cells: { a: string; b: string; rho: number; n: number }[] = [];
  for (const va of vars)
    for (const vb of vars) {
      const pairs = lots.map((l) => [va.get(l), vb.get(l)]).filter((p): p is [number, number] => p[0] != null && p[1] != null);
      cells.push({ a: va.id, b: vb.id, rho: va.id === vb.id ? 1 : pearson(ranks(pairs.map((p) => p[0])), ranks(pairs.map((p) => p[1]))), n: pairs.length });
    }
  return { vars: vars.map((v) => ({ id: v.id, label: v.label })), cells };
}

/** Monthly arrivals, head-weighted morbidity and metaphylaxis use. */
export function monthlySeries(lots: HistoricalLot[]) {
  return [...groupBy(lots, (l) => l.arrivalDate.slice(0, 7)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, ls]) => {
      const r = ratio(ls);
      const head = r.head;
      return {
        month,
        lots: ls.length,
        head,
        morbidity: r.rate,
        lo: r.lo,
        hi: r.hi,
        metaShare: ls.filter((l) => l.metaphylaxisGiven).reduce((s, l) => s + l.head, 0) / head,
        mortality: ls.reduce((s, l) => s + l.brdDeaths45, 0) / head,
      };
    });
}

/** Morbidity in treated vs untreated lots within arrival-weight bands (shows confounding by indication). */
export function confoundingByWeight(lots: HistoricalLot[]) {
  const edges = [300, 500, 600, 700, 800, 1100];
  return edges.slice(0, -1).map((a, i) => {
    const b = edges[i + 1];
    const ls = lots.filter((l) => l.weightLb >= a && l.weightLb < b);
    const t = ratio(ls.filter((l) => l.metaphylaxisGiven), "treated");
    const u = ratio(ls.filter((l) => !l.metaphylaxisGiven), "untreated");
    return { band: b === 1100 ? `${a}+ lb` : `${a}–${b} lb`, treated: t.rate, treatedLots: t.lots, untreated: u.rate, untreatedLots: u.lots, buyerFlagTreated: ls.filter((l) => l.metaphylaxisGiven && l.buyerHighRisk).length / Math.max(1, t.lots), buyerFlagUntreated: ls.filter((l) => !l.metaphylaxisGiven && l.buyerHighRisk).length / Math.max(1, u.lots) };
  });
}

export interface QualityCheck {
  check: string;
  rule: string;
  failures: number;
  severity: "ok" | "info" | "warn" | "error";
}

/** Record-level data-quality checks (the same rules the CSV importer enforces, plus outcome consistency). */
export function qualityChecks(lots: HistoricalLot[]): QualityCheck[] {
  const ids = new Set<string>();
  let dups = 0;
  for (const l of lots) {
    if (ids.has(l.lotId)) dups++;
    ids.add(l.lotId);
  }
  const c = (check: string, rule: string, failures: number, bad: "warn" | "error" | "info" = "error"): QualityCheck => ({ check, rule, failures, severity: failures === 0 ? "ok" : bad });
  return [
    c("Unique lot IDs", "lotId appears once", dups),
    c("Lot size", "head between 1 and 2,000", lots.filter((l) => !(l.head >= 1 && l.head <= 2000)).length),
    c("Arrival weight", "300–1,100 lb", lots.filter((l) => !(l.weightLb >= 300 && l.weightLb <= 1100)).length),
    c("Cases ≤ head", "brdTreated45 ≤ head", lots.filter((l) => l.brdTreated45 > l.head).length),
    c("Re-treatment chain", "treated3x ≤ treated2x ≤ brdTreated45", lots.filter((l) => l.treated3x > l.treated2x || l.treated2x > l.brdTreated45).length),
    c("Deaths ≤ head", "brdDeaths45 + otherDeaths45 ≤ head", lots.filter((l) => l.brdDeaths45 + l.otherDeaths45 > l.head).length),
    c("Shrink range", "shrink 0–15 % when recorded", lots.filter((l) => l.shrinkPct != null && (l.shrinkPct < 0 || l.shrinkPct > 15)).length),
    c("Haul range", "haul 0–2,500 mi when recorded", lots.filter((l) => l.haulMiles != null && (l.haulMiles < 0 || l.haulMiles > 2500)).length),
    c("Valid dates", "ISO arrival date", lots.filter((l) => Number.isNaN(Date.parse(l.arrivalDate))).length),
    c("Weather linked", "NOAA weather joined to arrival week", lots.filter((l) => l.tempSwingF == null).length, "info"),
    c("Incomplete history", "vaccination or weaning recorded as unknown", lots.filter((l) => l.vaccinated === "unknown" || l.weaned === "unknown").length, "info"),
  ];
}

/** Population Stability Index between a reference and a comparison sample. */
function psi(ref: number[], cmp: number[], bins = 10) {
  const s = [...ref].sort((a, b) => a - b);
  const edges = Array.from({ length: bins - 1 }, (_, i) => s[Math.floor(((i + 1) * s.length) / bins)]);
  const hist = (xs: number[]) => {
    const h = new Array(bins).fill(0);
    for (const x of xs) {
      let k = 0;
      while (k < edges.length && x > edges[k]) k++;
      h[k]++;
    }
    return h.map((v) => Math.max(v / xs.length, 1e-4));
  };
  const a = hist(ref);
  const b = hist(cmp);
  return a.reduce((t, ai, i) => t + (b[i] - ai) * Math.log(b[i] / ai), 0);
}

/** Covariate drift between training-period and holdout-period arrivals (standardized mean difference + PSI). */
export function driftReport(lots: HistoricalLot[], splitDate: string) {
  const a = lots.filter((l) => l.arrivalDate < splitDate);
  const b = lots.filter((l) => l.arrivalDate >= splitDate);
  const vars: { label: string; get: (l: HistoricalLot) => number | null }[] = [
    ...NUMERIC_VARS.filter((v) => v.id !== "morbidity"),
    { label: "Auction commingled", get: (l) => (l.source === "auction_multi" ? 1 : 0) },
    { label: "Vaccination unknown", get: (l) => (l.vaccinated === "unknown" ? 1 : 0) },
    { label: "Metaphylaxis given", get: (l) => (l.metaphylaxisGiven ? 1 : 0) },
    { label: "BRD morbidity (outcome)", get: (l) => l.morbidity45 },
  ];
  return vars.map((v) => {
    const xa = a.map(v.get).filter((x): x is number => x != null);
    const xb = b.map(v.get).filter((x): x is number => x != null);
    const ma = xa.reduce((s, x) => s + x, 0) / xa.length;
    const mb = xb.reduce((s, x) => s + x, 0) / xb.length;
    const va = xa.reduce((s, x) => s + (x - ma) ** 2, 0) / xa.length;
    const vb = xb.reduce((s, x) => s + (x - mb) ** 2, 0) / xb.length;
    const smd = (mb - ma) / Math.sqrt((va + vb) / 2 || 1);
    const binary = xa.every((x) => x === 0 || x === 1);
    return { variable: v.label, train: ma, test: mb, smd, psi: binary ? NaN : psi(xa, xb) };
  });
}

/** Headline dataset facts. */
export function overview(lots: HistoricalLot[]) {
  const r = ratio(lots);
  const dates = lots.map((l) => l.arrivalDate).sort();
  return {
    lots: lots.length,
    head: r.head,
    from: dates[0],
    to: dates[dates.length - 1],
    morbidity: r.rate,
    morbidityLo: r.lo,
    morbidityHi: r.hi,
    highRiskShare: r.highRiskShare,
    mortality: lots.reduce((s, l) => s + l.brdDeaths45, 0) / r.head,
    metaShare: lots.filter((l) => l.metaphylaxisGiven).reduce((s, l) => s + l.head, 0) / r.head,
    completeRecords: lots.filter((l) => MISSING_FIELDS.every((f) => !f.isMissing(l))).length / lots.length,
  };
}
