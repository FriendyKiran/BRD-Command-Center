# Data dictionary

All synthetic records are produced by `src/engine/generator.ts` (`npm run generate`, seed 20251020). Weather fields are **observed** NOAA data; every other lot field is **synthetic**. Unit of analysis: the **arrival lot** (a cohort of cattle placed into one pen on one day).

## 1. Arrival record: `data/lots_history.csv`, `data/lots_current_snapshot.csv`, CSV upload

| Field | Type / unit | Values | Available at decision? | Origin | Notes |
|---|---|---|---|---|---|
| `lotId` | text | `PD-251021-01` = yard prefix, yymmdd, sequence | yes | synthetic | Unique per lot |
| `yardId` | category | `palo-duro`, `llano`, `cimarron`, `arkansas-river` | yes | team-defined | See §4 |
| `arrivalDate` | date | YYYY-MM-DD | yes | synthetic | Arrivals weighted toward the Sep–Nov fall run |
| `head` | integer | 35–420 | yes | synthetic | Head placed |
| `sex` | category | `steer`, `heifer`, `mixed`, `bull` | yes | synthetic | |
| `weightLb` | lb | 340–1,020 | yes | synthetic | Average arrival weight |
| `source` | category or blank | `ranch_direct`, `preconditioned`, `auction_single`, `auction_multi` | often | synthetic | Blank = unknown (1–20 % by yard) |
| `nSources` | integer or blank | ≥ 1 | often | synthetic | Origins commingled; blank = unknown |
| `haulMiles` | miles or blank | 45–1,650 | usually | synthetic | |
| `shrinkPct` | % or blank | 1.5–10.6 | usually | synthetic | Transit weight loss |
| `vaccinated` | tri-state | `yes`, `no`, `unknown` | often unknown | synthetic | Pre-arrival respiratory vaccination |
| `weaned` | tri-state | `yes`, `no`, `unknown` | often unknown | synthetic | Weaned ≥ 45 days before shipment |
| `buyerHighRisk` | boolean | | yes | synthetic | Order buyer's high-risk call; calibrated to the manager sensitivity/specificity in Rojas et al. 2022 |
| `tempSwingF` | °F | | yes (forecast) | **NOAA observed** | Largest day-to-day change in daily max temperature, arrival day to day +6 |
| `minTempF` | °F | | yes (forecast) | **NOAA observed** | Coldest daily minimum, arrival week |
| `precipIn` | inches | | yes (forecast) | **NOAA observed** | Total precipitation, arrival week |
| `penAreaM2PerHead` | m²/head | 10–28 | yes | synthetic | Pen variable used by Rojas et al. 2022 |
| `bunkCmPerHead` | cm/head | 18–40 | yes | synthetic | Pen variable used by Rojas et al. 2022 |
| `febrilePct` | fraction | null | n/a | reserved | Chute-side screening is modelled as an option, not an input |
| `status` | category | `history`, `on-feed`, `scheduled` | | derived | Relative to operating date 2025-10-20 |
| `daysOnFeed` | days | 0–44 | on-feed only | derived | |
| `casesToDate` | integer | | on-feed only | synthetic | BRD first treatments observed so far; drives the Bayesian update |
| `processedWith` | strategy id | | on-feed only | synthetic | Option applied at processing |

## 2. Outcomes (history only, not known at decision time)

| Field | Unit | Definition |
|---|---|---|
| `metaphylaxisGiven` / `metaphylaxisDrug` | bool / `premium`,`economy`,`none` | Decision actually made (yard SOP with ~8 % ad-hoc deviation) |
| `brdTreated45` | head | Cattle **detected and treated** for BRD at least once in 45 days on feed (DOF) |
| `treated2x`, `treated3x` | head | Re-treated a 2nd / 3rd time |
| `brdDeaths45` | head | BRD deaths within 45 DOF (treated and missed cases) |
| `otherDeaths45` | head | Non-BRD deaths |
| `morbidity45` | fraction | `brdTreated45 / head`. This is the **outcome definition** used throughout |
| `highRisk` | bool | `morbidity45 ≥ 0.15`, the cohort risk definition of Rojas et al. 2022 |

**Outcome caveat.** Like real feedyard records, morbidity counts only *detected* cases. The engine converts to true incidence using visual-diagnosis sensitivity (62 %, Timsit et al. 2016 as cited in Adekunle & Kaniyamattam 2026).

## 3. Hidden truth: `data/truth_audit_only.json`

Used only by `scripts/evaluate-model.ts` and never by the dashboard: `trueIncidenceNoMeta` (true 45-day incidence without metaphylaxis), the true values of fields that are recorded as unknown or recorded wrongly, a latent BVDV-PI exposure flag, and `rrPremiumTrue` / `rrEconomyTrue`, the lot's true BRD risk ratio under each metaphylaxis class (lot-to-lot response varies; PI-exposed lots respond poorly).

**Recorded is not true.** Like real paperwork, the arrival records contain deliberate errors:
* `weightLb` is a pay weight (true weight ± 30 lb SD);
* 15 % of unvaccinated lots are recorded as vaccinated;
* origins are undercounted on about a third of commingled lots;
* 10 % of auction lots have single vs multi-source swapped.

The hidden process also includes an unrecorded, time-correlated pathogen pressure per yard and a 2025 strain shift. All of this is listed in `TRUTH_COEFS` in `src/engine/generator.ts`. No model can see any of it.

## 4. Yards (team-defined, `src/engine/yards.ts`)

| Yard | Town (NOAA station) | Cattle mix | Free hospital head | Receiving rider h/day | Current SOP |
|---|---|---|---|---|---|
| Palo Duro Feedyard | Hereford TX (Amarillo USW00023047) | Lightweight commingled sale-barn calves | 500 | 16 | Premium metaphylaxis if < 600 lb or multi-source auction or buyer flag |
| Llano Estacado Feeders | Lubbock TX (USW00023042) | Mixed; thin crew | 170 | 8.5 | Economy metaphylaxis if < 550 lb |
| Cimarron Valley Cattle Co. | Dodge City KS (USW00013985) | Ranch-direct / preconditioned yearlings | 180 | 18 | Metaphylaxis only on buyer flag |
| Arkansas River Feedyard | Garden City KS (USW00023064) | Mixed; incomplete records (54 % vaccination unknown in history) | 180 | 9.5 | Premium metaphylaxis if < 725 lb |

## 5. Management options (`STRATEGIES`)

| id | Antimicrobial | Surveillance |
|---|---|---|
| `none-std` | none | standard pull-and-treat |
| `none-enh` | none | enhanced (≈ 2×/day riding + temperature on pulls, first 4 weeks) |
| `screen-std` / `screen-enh` | treat arrivals ≥ 104 °F with premium class | standard / enhanced |
| `eco-std` | economy-class metaphylaxis, whole lot | standard |
| `prem-std` / `prem-enh` | premium-class metaphylaxis, whole lot | standard / enhanced |

"Premium" stands for a longer-acting, highest-priority critically important class (e.g. a macrolide). "Economy" stands for a shorter-acting class (e.g. a tetracycline). Products and doses are deliberately unspecified; they are the veterinarian's decision.

## 6. Engine outputs per lot × option

`morbidity` (detected, P10/P50/P90), `trueIncidence`, `mortality`, `netReturnPerHead` and `lotValue` (USD), `amuRegimensPer100` (metaphylaxis + individual treatment regimens per 100 head), `criticallyImportantShare`, `hospitalCurve` (expected hospital-pen head by day on feed), `riderHoursPerDay`, `chuteHours`. Each figure is the mean of 400 paired Monte Carlo draws per option (the same count on every page). Per lot, also: `evpiLot` (USD), `infoValue` (USD and decision-flip probability per missing field), and `confidence` (`confident` / `caution` / `insufficient`) with reasons. A recommendation is a *close call* when it beats the best option with a different antimicrobial plan in fewer than 60 % of paired draws (editable on the Assumptions page).

## 7. Model-lab outputs (`src/data/generated/evaluation.json`, `npm run zoo`)

| Field | Definition |
|---|---|
| `test[]` | The 666 holdout lots (arrivals from 2025-01-01): `lotId`, `yardId`, `head`, `cases` (= `brdTreated45`), `morbidity`, `highRisk` (morbidity ≥ 15 %), `buyer` (order-buyer flag) |
| `models[].kind` | `logit`, `bayes`, `rojas`, `tree`, `forest`, `gbm`, `stack` (see `src/engine/zoo.ts`) |
| `models[].metrics.scores` | Predicted morbidity per holdout lot, under the treatment actually given |
| `models[].metrics.pHigh` | P(lot morbidity ≥ 15 %) per holdout lot, including parameter and lot-to-lot uncertainty |
| `models[].metrics` (other) | AUC, Brier, log loss (binomial deviance per head), ECE, decile calibration, ROC, permutation importance by risk-factor group, learned metaphylaxis RR |
| `models[].cv` | 5-fold cross-validation (seeded random folds over all history): AUC and log loss per fold |
| `models[].learningCurve` | Holdout AUC and log loss when trained on 10–100 % of the pre-2025 lots |

The per-model decision backtest is in `backtest.json → models` (Δ $/head vs SOP, regimens per 100 head and BRD mortality, with no stewardship weight and at the derived default of $3/regimen). `backtest.json → stress` re-scores the same choices in nine worlds where the tool's assumptions are wrong, with a perfect-information upper bound; `stewardship` records how the default weight was derived from 2024 lots. Derived metrics (bootstrap CIs, PR curves, decision curves, thresholds, calibration slope) are computed in the browser by `src/engine/evaluation.ts`.

## 8. Public raw data (`data/raw/`)

| File | Source | Licence |
|---|---|---|
| `noaa_*_2023_2025.csv` | NOAA NCEI GHCN-Daily (TMAX, TMIN, PRCP, AWND; °F, in, mph) | Public domain |
| `usda_ers_livestock_prices.xlsx`, `cattle_prices_tidy.csv` | USDA ERS Livestock & Meat Domestic Data (monthly $/cwt) | Public domain |

Full provenance and citations: `docs/research/ASSETS_AND_LICENSES.md`. All parameter values with page-level citations: `docs/research/LITERATURE_PARAMETERS.md`.
