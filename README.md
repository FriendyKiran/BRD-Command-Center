# BRD Command Center: a post-arrival BRD decision aid for feedlot managers

AISFS · Merck Animal Health Interdisciplinary Hackathon 2026, *Decision Aid for Predicting BRD in Feedlot Production*.

An interactive dashboard that helps a feedyard manager decide **how to manage each arriving lot during its first 45 days on feed**. For every lot it:

1. predicts 45-day BRD risk from the records available on arrival day, with uncertainty and the reasons behind it;
2. simulates seven management options (no metaphylaxis, enhanced surveillance, chute-side fever screening, economy and premium metaphylaxis, combinations);
3. reports the consequences of each option for **cattle health** (cases, deaths), **operating cost** (feeding-period net return, drugs, labor) and **antimicrobial use**, compared with the yard's **current operating procedure**;
4. plans the whole yard within **binding constraints** (hospital pens, pen-rider hours, chute time, an optional antimicrobial cap);
5. says when the available information **cannot support a confident decision**, and what a missing record is worth;
6. routes every medication option to **veterinary review** and produces a printable decision summary.

It also ships a full data-science workbench:

* **Data Explorer** (`/data`): EDA of the training records: outcome distribution, between-yard spread, missingness and whether it is informative, unadjusted risk profiles with cluster-robust 95 % CIs, Spearman correlations, seasonality, confounding by indication, a data-quality report and train/holdout covariate drift (SMD, PSI).
* **Model Lab** (`/model`): seven risk models (penalized logistic, Bayesian logistic, a logistic on Rojas et al.'s predictors only, decision tree, random forest, gradient-boosted trees, and a model average) on one temporal holdout, plus 5-fold CV and learning curves. Every comparison plot can overlay any subset of models or isolate one. Evaluation covers AUC with paired-bootstrap CIs and p-values, PR-AUC, log loss, Brier skill, ECE, calibration slope and intercept, a threshold and confusion-matrix explorer, decision-curve analysis, cumulative gains, per-yard subgroup metrics and permutation importance. The **decision backtest** asks whether each model also makes better decisions. Any model can drive the engine, and every lot page can run a **seven-model consensus check**.

All computation runs in the browser. There is no server, no paid service and no API key.

---

## Quick start

Requirements: **Node.js ≥ 20** (tested with Node 24.13, npm 11.6). Nothing else.

```bash
git clone https://github.com/FriendyKiran/BRD-Command-Center.git
cd BRD-Command-Center
npm install
npm run dev            # → http://localhost:5173
```

The repository ships with every generated data file, so the dashboard runs immediately. To rebuild everything from the raw public data:

```bash
npm run weather        # data/raw NOAA + USDA files → src/data/generated/weather.json, prices.json
npm run generate       # synthetic yards + temporal validation + model fit → src/data/generated/*.json, data/*.csv
npm run zoo            # all 7 risk models: holdout, 5-fold CV, learning curves → src/data/generated/evaluation.json
npm run evaluate       # policy backtest on 2025 holdout + 9 wrong-assumption worlds + stewardship default derivation → backtest.json
npm test               # 34 unit tests (Vitest): engine, model zoo, evaluation metrics, EDA, vet review grading
npm run build          # production bundle in dist/ (open with `npm run preview`)
```

The generator is seeded (`npm run generate -- --seed 20251020` is the default), so every number in the dashboard and the brief can be reproduced exactly.

## A 3-minute demo path

1. **Command Center** (`/`): four yards, inbound lots, plan vs current SOPs, hospital-pen outlook.
2. **Demonstration Case** (`/demo`): one end-to-end decision with live numbers.
3. **Lot page** (`/lots/LE-251101-01`): in *What if?*, switch weaning from "unknown" to "yes", then "no". The recommendation moves from economy metaphylaxis to a fever screen, then to premium metaphylaxis with enhanced surveillance, which is why the confidence panel says a phone call about weaning is worth ≈ $208.
4. **Yard Planner** (`/plan?yard=arkansas-river`): pen-rider time is binding (shadow price ≈ $1,377 per hour·day). Drag *rider hours* or turn up the *stewardship weight*, and the plan re-optimises; see the frontier and shadow prices.
5. **Model Lab** (`/model`): seven models on one leaderboard; *Decision backtest* shows that better prediction pays off in decisions.
6. **Decision Summary**: print or save as PDF for the veterinarian's signature.

## Repository layout

```
BRD-Command-Center/
├─ src/
│  ├─ engine/            pure TypeScript decision engine (no UI code)
│  │  ├─ params.ts       every parameter with value, range, source and evidence class
│  │  ├─ yards.ts        four yards (capacities, cattle mix, current SOP) + the 7 options
│  │  ├─ generator.ts    synthetic data generator with a hidden "true" BRD process
│  │  ├─ weather.ts      arrival-week weather features from NOAA series
│  │  ├─ features.ts     arrival-day feature engineering (missing values flagged, not dropped)
│  │  ├─ model.ts        binomial logistic model, bootstrap ensemble, beta-binomial uncertainty,
│  │  │                  Bayesian on-feed update, model-agnostic prediction + temporal validation
│  │  ├─ zoo.ts          alternative model families (Bayesian, Rojas-set, tree, forest, boosting, average)
│  │  ├─ trees.ts        histogram-based second-order tree learner shared by the tree models
│  │  ├─ evaluation.ts   ROC/PR, bootstrap CIs, calibration fit, decision curves, thresholds, subgroups
│  │  ├─ eda.ts          exploratory analysis, data-quality checks, drift report
│  │  ├─ economics.ts    Weber et al. (2024) feeding-period net-return equations
│  │  ├─ simulate.ts     Monte Carlo consequences of each option (paired random numbers)
│  │  ├─ assess.ts       per-lot assessment, EVPI, value of information, confidence flag
│  │  ├─ optimize.ts     yard portfolio planner under capacity / stewardship constraints
│  │  └─ *.test.ts       unit tests
│  ├─ workers/           Web Worker that runs the engine off the UI thread
│  ├─ pages/ components/ state/ lib/   React 19 dashboard
│  └─ data/generated/    bundled outputs of the build scripts
├─ scripts/              build-weather.ts · generate-data.ts · evaluate-zoo.ts · evaluate-model.ts
├─ data/
│  ├─ raw/               NOAA GHCN-Daily CSVs, USDA ERS price workbook (public domain)
│  ├─ lots_history.csv   shareable synthetic training records (2,976 lots)
│  ├─ lots_current_snapshot.csv  lots on feed / inbound at the operating date
│  └─ truth_audit_only.json      hidden truth, used only by the backtest
├─ public/images/        public-domain USDA photographs
├─ public/templates/     CSV upload template
└─ docs/
   ├─ TECHNICAL_BRIEF.md          technical brief (≈ 3,300 words)
   ├─ DEMO_CASE.md                the end-to-end demonstration decision
   ├─ PROJECT_OVERVIEW.md         plain-language guide: problem → approach → engine → dashboard
   ├─ DATA_DICTIONARY.md          every field, unit and source
   ├─ LICENSES-THIRD-PARTY.md     data, images, software and their licences
   ├─ latex/                      LaTeX sources + compiled PDFs of the technical brief and demonstration case
   └─ research/                   parameter extraction from the supplied literature
```

## Using your own data

* **Upload arrivals**: *Arrivals & Lots → Upload CSV*. Use the template in `public/templates/arrivals_template.csv`; columns are documented in the drawer and in `docs/DATA_DICTIONARY.md`. Rows are validated; bad rows are rejected with the reason, and unknown values are kept as "unknown".
* **Enter a lot**: *Arrivals & Lots → Enter a lot*.
* **Change assumptions**: *Assumptions & Sensitivity*. Each parameter is tagged observed / estimated / assumed with its source.
* **Retrain**: *Model Lab → Inspect & retrain* (any of the seven model families, with its hyperparameters), after replacing `data/lots_history.csv` → `src/data/generated/history.json` with real records (same columns).

Browser state (entered lots, edits, vet reviews, assumptions) is stored in `localStorage`; clear site data to reset.

## External resources and AI disclosure

* Data: NOAA NCEI GHCN-Daily weather; USDA ERS livestock prices; US Census boundaries (via `us-atlas`). All public domain.
* Images: six USDA photographs from Wikimedia Commons, public domain.
* Literature: the six papers supplied with the challenge (see `docs/TECHNICAL_BRIEF.md`).
* Software: open-source only (MIT / ISC / Apache-2.0 / OFL). Full list in `docs/LICENSES-THIRD-PARTY.md`.
* **AI tools:** the code, synthetic-data generator and documentation were developed with Anthropic's Claude (Claude Code). The team reviewed the design and verified parameters against the cited sources, and is responsible for all claims and results.

## Important limitations

The operational records are **synthetic**: generated by a documented, seeded process calibrated to the supplied literature, driven by real NOAA weather. Model metrics and the backtest show the decision logic works as intended. They do not establish field performance. Medication-related outputs are decision support and **require review by the veterinarian of record**.

License: MIT (project code). See `docs/LICENSES-THIRD-PARTY.md` for third-party terms.
