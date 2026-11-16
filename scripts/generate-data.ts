/**
 * Reproducible data + model build.
 *   1. Generate synthetic arrival records for four yards (seeded), driven by real NOAA weather.
 *   2. Temporally validate the risk model (train < 2025-01-01, test ≥ 2025-01-01).
 *   3. Fit the production model on all history and write it with its validation metrics.
 *   4. Export shareable CSVs (data/) and app bundles (src/data/generated/).
 * Usage: npm run generate [-- --seed 20251020]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { generateData } from "../src/engine/generator";
import { trainModel, validate } from "../src/engine/model";
import { fieldPriors } from "../src/engine/assess";
import type { WeatherData } from "../src/engine/weather";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "src", "data", "generated");
const DATA = join(ROOT, "data");
mkdirSync(OUT, { recursive: true });

const seedArg = process.argv.indexOf("--seed");
const seed = seedArg > 0 ? Number(process.argv[seedArg + 1]) : 20251020;
const weather = JSON.parse(readFileSync(join(OUT, "weather.json"), "utf8")) as WeatherData;

console.time("generate");
const data = generateData(weather, seed);
console.timeEnd("generate");

const h = data.history;
const head = h.reduce((s, l) => s + l.head, 0);
const treated = h.reduce((s, l) => s + l.brdTreated45, 0);
const deaths = h.reduce((s, l) => s + l.brdDeaths45, 0);
console.log(`history: ${h.length} lots, ${head} head, morbidity ${((treated / head) * 100).toFixed(2)} %, BRD mortality ${((deaths / head) * 100).toFixed(2)} %`);
console.log(`high-risk lots (≥15 %): ${((h.filter((l) => l.highRisk).length / h.length) * 100).toFixed(1)} %`);
for (const y of ["palo-duro", "llano", "cimarron", "arkansas-river"]) {
  const ys = h.filter((l) => l.yardId === y);
  const hd = ys.reduce((s, l) => s + l.head, 0);
  const meta = ys.filter((l) => l.metaphylaxisGiven).reduce((s, l) => s + l.head, 0);
  console.log(
    `  ${y.padEnd(15)} lots ${String(ys.length).padStart(4)}  morb ${((ys.reduce((s, l) => s + l.brdTreated45, 0) / hd) * 100).toFixed(1)} %  high-risk ${((ys.filter((l) => l.highRisk).length / ys.length) * 100).toFixed(0)} %  metaphylaxis ${((meta / hd) * 100).toFixed(0)} % of head`,
  );
}
const tp = h.filter((l) => l.highRisk && l.buyerHighRisk).length;
const P = h.filter((l) => l.highRisk).length;
const fp = h.filter((l) => !l.highRisk && l.buyerHighRisk).length;
console.log(`order-buyer risk call: sensitivity ${((tp / P) * 100).toFixed(1)} %, specificity ${((1 - fp / (h.length - P)) * 100).toFixed(1)} % (Rojas 2022 reports managers at 83.75 % / 59.79 %)`);
console.log(`current: ${data.current.filter((l) => l.status === "on-feed").length} on feed (< 45 DOF), ${data.current.filter((l) => l.status === "scheduled").length} scheduled`);
console.log(`weather coverage: ${(data.meta.weatherCoverage * 100).toFixed(1)} %`);

console.time("validate");
const { metrics } = validate(h, "2025-01-01");
console.timeEnd("validate");
console.log(`temporal validation AUC ${metrics.auc.toFixed(3)} (order-buyer call AUC ${metrics.aucBuyer.toFixed(3)}), Brier ${metrics.brier.toFixed(4)}`);
console.log(`  at buyer flag rate: model sens ${(metrics.sensitivity * 100).toFixed(1)} % spec ${(metrics.specificity * 100).toFixed(1)} % PPV ${(metrics.ppv * 100).toFixed(1)} %`);
console.log(`  estimated metaphylaxis RR: premium ${metrics.metaRREstimate.premium.toFixed(2)}, economy ${metrics.metaRREstimate.economy.toFixed(2)}`);

console.time("train");
const model = trainModel(h, { bootstraps: 30 });
model.metrics = metrics;
console.timeEnd("train");
console.log(`overdispersion concentration κ = ${model.concentration.toFixed(1)}`);

writeFileSync(join(OUT, "history.json"), JSON.stringify(h));
writeFileSync(join(OUT, "current.json"), JSON.stringify(data.current));
writeFileSync(join(OUT, "model.json"), JSON.stringify(model));
writeFileSync(join(OUT, "priors.json"), JSON.stringify(fieldPriors(h)));
writeFileSync(join(OUT, "meta.json"), JSON.stringify(data.meta, null, 1));
// Truth is exported ONLY for the evaluation script / audit, never imported by the app.
writeFileSync(join(DATA, "truth_audit_only.json"), JSON.stringify(data.truth));
writeFileSync(join(DATA, "lots_history.csv"), Papa.unparse(h));
writeFileSync(join(DATA, "lots_current_snapshot.csv"), Papa.unparse(data.current));
writeFileSync(join(ROOT, "public", "templates", "arrivals_template.csv"), Papa.unparse(data.current.filter((l) => l.status === "scheduled").slice(0, 6)));
console.log("wrote src/data/generated/*.json, data/*.csv, public/templates/arrivals_template.csv");
