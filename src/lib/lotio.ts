import Papa from "papaparse";
import { SNAPSHOT, WEATHER } from "../data";
import type { LotArrival, LotAssessment, Sex, SourceType, TriState, YardId } from "../engine/types";
import { arrivalWeather } from "../engine/weather";
import { YARD_INDEX } from "../engine/yards";

const DAY = 86400000;
const SEXES: Sex[] = ["steer", "heifer", "mixed", "bull"];
const SOURCES: SourceType[] = ["ranch_direct", "preconditioned", "auction_single", "auction_multi"];

export interface ParseReport {
  lots: LotArrival[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
}

const numOrNull = (v: unknown) => {
  if (v == null || String(v).trim() === "" || String(v).toLowerCase() === "null") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const tri = (v: unknown): TriState => {
  const s = String(v ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(s)) return "yes";
  if (["no", "n", "false", "0"].includes(s)) return "no";
  return "unknown";
};

/** Fill derived fields (status, days on feed, NOAA arrival-week weather) for a manager-entered lot. */
export function completeLot(l: LotArrival): LotArrival {
  const dof = Math.floor((Date.parse(SNAPSHOT) - Date.parse(l.arrivalDate)) / DAY);
  const status: LotArrival["status"] = dof < 0 ? "scheduled" : dof < 45 ? "on-feed" : "history";
  let wx = { tempSwingF: l.tempSwingF, minTempF: l.minTempF, precipIn: l.precipIn };
  if (wx.tempSwingF == null) wx = arrivalWeather(WEATHER[l.yardId], l.arrivalDate);
  return {
    ...l,
    ...wx,
    status,
    daysOnFeed: status === "on-feed" ? dof : null,
    casesToDate: status === "on-feed" ? (l.casesToDate ?? 0) : null,
    processedWith: status === "on-feed" ? (l.processedWith ?? "none-std") : null,
  };
}

export function parseLotsCsv(text: string): ParseReport {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  const lots: LotArrival[] = [];
  const errors: ParseReport["errors"] = [];
  const warnings: ParseReport["warnings"] = [];
  res.data.forEach((r, i) => {
    const row = i + 2;
    const problems: string[] = [];
    const yardId = String(r.yardId ?? "").trim() as YardId;
    if (!YARD_INDEX[yardId]) problems.push(`yardId "${r.yardId}" must be one of ${Object.keys(YARD_INDEX).join(", ")}`);
    const arrivalDate = String(r.arrivalDate ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate) || Number.isNaN(Date.parse(arrivalDate))) problems.push("arrivalDate must be YYYY-MM-DD");
    const head = numOrNull(r.head);
    if (head == null || Number.isNaN(head) || head < 1 || head > 2000) problems.push("head must be 1–2000");
    const weightLb = numOrNull(r.weightLb);
    if (weightLb == null || Number.isNaN(weightLb) || weightLb < 250 || weightLb > 1200) problems.push("weightLb must be 250–1200");
    const sex = String(r.sex ?? "").trim().toLowerCase() as Sex;
    if (!SEXES.includes(sex)) problems.push(`sex must be one of ${SEXES.join(", ")}`);
    if (problems.length) {
      errors.push({ row, message: problems.join("; ") });
      return;
    }
    const source = String(r.source ?? "").trim();
    const src = SOURCES.includes(source as SourceType) ? (source as SourceType) : null;
    if (source && !src) warnings.push({ row, message: `Unrecognised source "${source}" treated as unknown` });
    const f = (k: string) => {
      const v = numOrNull(r[k]);
      if (Number.isNaN(v)) {
        warnings.push({ row, message: `${k} "${r[k]}" is not a number; treated as missing` });
        return null;
      }
      return v;
    };
    const lot: LotArrival = completeLot({
      lotId: String(r.lotId || `UP-${arrivalDate.replace(/-/g, "").slice(2)}-${row}`).trim(),
      yardId,
      arrivalDate,
      head: Math.round(head as number),
      sex,
      weightLb: Math.round(weightLb as number),
      source: src,
      nSources: f("nSources"),
      haulMiles: f("haulMiles"),
      shrinkPct: f("shrinkPct"),
      vaccinated: tri(r.vaccinated),
      weaned: tri(r.weaned),
      buyerHighRisk: tri(r.buyerHighRisk) === "yes",
      tempSwingF: f("tempSwingF"),
      precipIn: f("precipIn"),
      minTempF: f("minTempF"),
      penAreaM2PerHead: f("penAreaM2PerHead") ?? 17,
      bunkCmPerHead: f("bunkCmPerHead") ?? 28,
      febrilePct: null,
      casesToDate: f("casesToDate"),
      daysOnFeed: null,
      status: "scheduled",
      processedWith: (r.processedWith as string) || null,
    });
    if (lot.status === "history") warnings.push({ row, message: "Arrived more than 45 days before the operating date: shown for reference only" });
    if (lot.tempSwingF == null) warnings.push({ row, message: "No weather for this date/yard (NOAA series covers 2023–2025); weather treated as unknown" });
    lots.push(lot);
  });
  return { lots, errors, warnings };
}

export function download(filename: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function assessmentsToCsv(as: LotAssessment[], choice?: Record<string, string>) {
  return Papa.unparse(
    as.map((a) => {
      const planned = choice?.[a.lot.lotId];
      const pr = a.results.find((r) => r.strategy.id === planned);
      return {
        lotId: a.lot.lotId,
        yard: YARD_INDEX[a.lot.yardId].name,
        status: a.lot.status,
        arrivalDate: a.lot.arrivalDate,
        head: a.lot.head,
        weightLb: a.lot.weightLb,
        risk45dMean: a.risk.mean.toFixed(4),
        riskP10: a.risk.p10.toFixed(4),
        riskP90: a.risk.p90.toFixed(4),
        probHighRisk: a.risk.probHighRisk.toFixed(3),
        recommendedOption: a.best.strategy.label,
        plannedOption: pr?.strategy.label ?? "",
        currentSop: a.statusQuo.strategy.label,
        deltaValuePerHeadUSD: ((a.best.objective - a.statusQuo.objective) / a.lot.head).toFixed(2),
        confidence: a.confidence,
        reasons: a.confidenceReasons.join(" | "),
        missingFields: a.risk.missing.join("; "),
      };
    }),
  );
}

export const CSV_COLUMNS = [
  ["lotId", "Text, unique", "PD-251101-01"],
  ["yardId", "palo-duro · llano · cimarron · arkansas-river", "llano"],
  ["arrivalDate", "YYYY-MM-DD", "2025-10-24"],
  ["head", "Integer", "185"],
  ["sex", "steer · heifer · mixed · bull", "steer"],
  ["weightLb", "Average arrival weight (lb)", "520"],
  ["source", "ranch_direct · preconditioned · auction_single · auction_multi · blank = unknown", "auction_multi"],
  ["nSources", "Number of origins commingled · blank = unknown", "7"],
  ["haulMiles", "Miles hauled · blank = unknown", "850"],
  ["shrinkPct", "Transit shrink % · blank = unknown", "6.5"],
  ["vaccinated", "yes · no · unknown (respiratory vaccine pre-arrival)", "unknown"],
  ["weaned", "yes · no · unknown (weaned ≥ 45 d)", "no"],
  ["buyerHighRisk", "yes · no (order buyer's call)", "yes"],
  ["penAreaM2PerHead", "Pen area per head (m²) · default 17", "16"],
  ["bunkCmPerHead", "Bunk space per head (cm) · default 28", "28"],
  ["casesToDate", "On-feed lots only: BRD pulls so far", ""],
] as const;
