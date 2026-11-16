/**
 * Converts the raw public data in data/raw/ into compact JSON used by the generator and the app:
 *   - NOAA GHCN-Daily station CSVs  → src/data/generated/weather.json
 *   - USDA ERS monthly cattle prices → src/data/generated/prices.json
 * Usage: npm run weather
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import type { StationSeries, WeatherData } from "../src/engine/weather";
import type { YardId } from "../src/engine/types";

const ROOT = join(import.meta.dirname, "..");
const RAW = join(ROOT, "data", "raw");
const OUT = join(ROOT, "src", "data", "generated");
mkdirSync(OUT, { recursive: true });

const STATIONS: Record<YardId, string> = {
  "palo-duro": "noaa_amarillo_2023_2025.csv",
  llano: "noaa_lubbock_2023_2025.csv",
  cimarron: "noaa_dodge_city_2023_2025.csv",
  "arkansas-river": "noaa_garden_city_2023_2025.csv",
};

const num = (v: string | undefined) => (v == null || v.trim() === "" ? null : Number(v));
const DAY = 86400000;

const weather: WeatherData = {};
for (const [yard, file] of Object.entries(STATIONS) as [YardId, string][]) {
  const rows = Papa.parse<Record<string, string>>(readFileSync(join(RAW, file), "utf8"), { header: true, skipEmptyLines: true }).data;
  const start = rows[0].DATE;
  const end = rows[rows.length - 1].DATE;
  const n = Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
  const s: StationSeries = { station: `${rows[0].NAME} (${rows[0].STATION})`, start, tmax: Array(n).fill(null), tmin: Array(n).fill(null), prcp: Array(n).fill(null) };
  for (const r of rows) {
    const i = Math.round((Date.parse(r.DATE) - Date.parse(start)) / DAY);
    s.tmax[i] = num(r.TMAX);
    s.tmin[i] = num(r.TMIN);
    s.prcp[i] = num(r.PRCP);
  }
  weather[yard] = s;
  console.log(`${yard}: ${s.station} ${start} → ${end} (${n} days, ${s.tmax.filter((v) => v == null).length} missing TMAX)`);
}
writeFileSync(join(OUT, "weather.json"), JSON.stringify(weather));

// Monthly price series (USD/cwt → USD/lb).
const priceRows = Papa.parse<Record<string, string>>(readFileSync(join(RAW, "cattle_prices_tidy.csv"), "utf8"), { header: true, skipEmptyLines: true }).data;
const series: Record<string, { date: string; usdPerLb: number }[]> = {};
for (const r of priceRows) {
  (series[r.series] ??= []).push({ date: r.date, usdPerLb: Number(r.price_usd_per_cwt) / 100 });
}
writeFileSync(
  join(OUT, "prices.json"),
  JSON.stringify({ source: "USDA Economic Research Service, Livestock and Meat Domestic Data: livestock-prices.xlsx (public domain)", url: priceRows[0].source_url, series }, null, 1),
);
console.log(`prices: ${Object.keys(series).length} series`);
