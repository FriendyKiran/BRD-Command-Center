export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
export const pctPt = (x: number, d = 1) => `${x.toFixed(d)}%`;

export function usd(x: number, opts: { d?: number; sign?: boolean; compact?: boolean } = {}) {
  const { d = 0, sign = false, compact = false } = opts;
  const abs = Math.abs(x);
  let body: string;
  if (compact && abs >= 1e6) body = `$${(abs / 1e6).toFixed(2)}M`;
  else if (compact && abs >= 1e4) body = `$${(abs / 1e3).toFixed(1)}k`;
  else body = `$${abs.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  const s = x < 0 ? "−" : sign && x > 0 ? "+" : "";
  return s + body;
}

export const num = (x: number, d = 0) => x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const signed = (x: number, d = 0) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d })}`;

export function fmtDate(iso: string, style: "short" | "long" = "short") {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", style === "short" ? { month: "short", day: "numeric", timeZone: "UTC" } : { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Risk colour on the 5-step scale (detected 45-day morbidity). */
export function riskColor(p: number) {
  if (p < 0.06) return "var(--risk-0)";
  if (p < 0.12) return "var(--risk-1)";
  if (p < 0.2) return "var(--risk-2)";
  if (p < 0.32) return "var(--risk-3)";
  return "var(--risk-4)";
}

export function riskBand(p: number) {
  if (p < 0.06) return "Low";
  if (p < 0.12) return "Guarded";
  if (p < 0.2) return "Elevated";
  if (p < 0.32) return "High";
  return "Severe";
}

export const STRATEGY_COLOR: Record<string, string> = {
  "none-std": "#8a8f86",
  "none-enh": "#3d6f8f",
  "screen-std": "#7b4f8a",
  "screen-enh": "#a26bb4",
  "eco-std": "#d9a441",
  "prem-std": "#c2552d",
  "prem-enh": "#8f2f17",
};

/** What "value" means under the current settings: net return, minus any stewardship or welfare weight. */
export function valueBasis(p: { amuPenalty: number; deathPenalty: number }): string {
  const weights = [
    p.amuPenalty ? `${usd(p.amuPenalty)} per antimicrobial regimen (stewardship weight)` : null,
    p.deathPenalty ? `${usd(p.deathPenalty)} per BRD death (welfare weight)` : null,
  ].filter(Boolean);
  return weights.length
    ? `Value = feeding-period net return minus ${weights.join(" and ")}. Set the weights to $0 on the Assumptions page for cash-only values.`
    : "Value = feeding-period net return (no stewardship or welfare weight applied).";
}
