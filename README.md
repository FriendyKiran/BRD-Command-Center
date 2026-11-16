# BRD Command Center

**A post-arrival decision aid for bovine respiratory disease (BRD) in feedlot cattle.**

Built by **Data Ninjas** for the AISFS · Merck Animal Health Interdisciplinary Hackathon 2026, Problem 1: *Decision Aid for Predicting BRD in Feedlot Production*.

| Team member |
|---|
| Kiran Babu Athina |
| Manogna Rayala |
| Sreenivasulu Reddy Settipalli |

---

## What it does

When a group of cattle arrives at a feedyard, the manager has to decide how to handle it in the first 45 days: give the whole lot an antibiotic on arrival (metaphylaxis), screen for fever and treat only the sick ones, or watch closely and treat as cases appear. BRD Command Center helps make that call for every lot, across four yards, and is honest about when the records are not good enough to decide.

For every arriving lot the dashboard:

1. **predicts** the 45-day BRD risk from what is known on arrival day, with a range and the main reasons behind it;
2. **simulates seven management options** and shows what each means for cattle health (cases, deaths), cost (feeding-period net return, drugs, labour) and antibiotic use, compared with the yard's **current operating procedure**;
3. **plans the whole yard** within hospital-pen space, pen-rider hours, chute time and an optional antibiotic cap;
4. **flags when the data cannot support a confident decision**, and says which missing record is worth chasing and how much it is worth;
5. **sends every medication option to the veterinarian** for review and produces a printable decision summary.

Everything runs in the browser. There is no server, no paid service and no API key.

### Headline results (2025 holdout, scored against the hidden truth)

| Policy | Net value vs current SOPs | Antibiotic regimens /100 head | BRD mortality |
|---|---|---|---|
| Current yard SOPs | baseline | 64.2 | 1.52 % |
| Blanket premium metaphylaxis | −$1.24 / head | 110.6 | 1.17 % |
| Order buyer's call | +$1.74 / head | 65.8 | 1.44 % |
| **BRD Command Center (default)** | **+$4.54 / head** | **60.5** | **1.29 %** |

The tool beats current practice on profit, antibiotic use and deaths at the same time, and it keeps doing so in all nine "what if our assumptions are wrong" scenarios we tested. Risk-model holdout AUC is 0.772, against 0.640 for the order buyer's call.

---

## Submission documents

| Document | File |
|---|---|
| Technical brief (3 pages + references) | [`docs/latex/technical_brief.pdf`](docs/latex/technical_brief.pdf) |
| Demonstration case | [`docs/latex/demo_case.pdf`](docs/latex/demo_case.pdf) |
| Technical brief, full-length version | [`docs/latex/technical_brief_full.pdf`](docs/latex/technical_brief_full.pdf) |
| Data dictionary | [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) |
| Project overview (plain-language guide) | [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) |
| Third-party data, images and software licences | [`docs/LICENSES-THIRD-PARTY.md`](docs/LICENSES-THIRD-PARTY.md) |

The LaTeX sources sit next to the PDFs in `docs/latex/`. Markdown versions of the brief and the demonstration case are in `docs/`.

---

## Getting started

You need **Node.js 20 or newer** (we tested with Node 24.13 and npm 11.6). Nothing else.

```bash
git clone https://github.com/FriendyKiran/BRD-Command-Center.git
cd BRD-Command-Center
npm install
npm run dev            # then open http://localhost:5173
```

All generated data files are included, so the dashboard works straight away. To rebuild everything from the raw public data:

```bash
npm run weather        # NOAA + USDA raw files -> weather.json, prices.json
npm run generate       # synthetic yards, temporal split, model fit -> src/data/generated/, data/*.csv
npm run zoo            # all seven risk models: holdout, 5-fold CV, learning curves -> evaluation.json
npm run evaluate       # 2025 policy backtest, nine stress-test worlds, stewardship default -> backtest.json
npm test               # 34 unit tests (Vitest)
npm run build          # production build in dist/ (preview with npm run preview)
```

The generator is seeded (seed 20251020 by default), so every number in the dashboard and the documents can be reproduced exactly.

### A three-minute tour

1. **Command Center** (`/`): the four yards, inbound lots, the plan against current procedures, and the hospital-pen outlook. Click a yard on the map for its summary.
2. **Arrivals & Lots** (`/lots`): every lot with its risk, recommendation, confidence label and vet-review flag.
3. **Lot page** (`/lots/LE-251101-01`): in the *What if?* panel, switch weaning status from "unknown" to "yes" and then "no". The recommendation moves from economy metaphylaxis to a fever screen and then to premium metaphylaxis with enhanced surveillance, which is why the tool says a phone call about weaning is worth about $208.
4. **Yard Planner** (`/plan?yard=arkansas-river`): pen-rider time is the binding constraint here. Drag the rider hours or the stewardship weight and the plan re-optimises.
5. **Model Lab** (`/model`): seven risk models side by side, plus the decision backtest and stress test.
6. **Assumptions & Sensitivity** (`/assumptions`): every parameter with its source, labelled observed, estimated or assumed.
7. **Decision Summary** (`/summary`): a one-page record to print or save for the veterinarian's signature.

---

## How the repository is organised

```
BRD-Command-Center/
├─ src/
│  ├─ engine/            decision engine in plain TypeScript (no UI code)
│  │  ├─ params.ts       every parameter with its value, range, source and evidence class
│  │  ├─ yards.ts        the four yards (capacity, cattle mix, current SOP) and the seven options
│  │  ├─ generator.ts    synthetic data generator with a hidden "true" BRD process
│  │  ├─ weather.ts      arrival-week weather features from the NOAA series
│  │  ├─ features.ts     arrival-day features (missing values flagged, not dropped)
│  │  ├─ model.ts        logistic risk model, bootstrap uncertainty, Bayesian on-feed update
│  │  ├─ zoo.ts          the other model families (Bayesian, Rojas-set, tree, forest, boosting, average)
│  │  ├─ trees.ts        tree learner shared by the tree models
│  │  ├─ evaluation.ts   ROC/PR, bootstrap CIs, calibration, decision curves, subgroups
│  │  ├─ eda.ts          exploratory analysis, data-quality checks, drift report
│  │  ├─ economics.ts    Weber et al. (2024) feeding-period net-return equations
│  │  ├─ simulate.ts     Monte Carlo consequences of each option (paired draws)
│  │  ├─ assess.ts       per-lot assessment, value of information, confidence label
│  │  ├─ optimize.ts     yard planner under capacity and stewardship limits
│  │  └─ *.test.ts       unit tests
│  ├─ workers/           background worker that runs the engine off the UI thread
│  ├─ pages/ components/ state/ lib/   the React 19 dashboard
│  └─ data/generated/    outputs of the build scripts, bundled with the app
├─ scripts/              build-weather, generate-data, evaluate-zoo, evaluate-model
├─ data/
│  ├─ raw/               NOAA GHCN-Daily CSVs and the USDA ERS price workbook (public domain)
│  ├─ lots_history.csv   shareable synthetic training records (2,976 lots)
│  ├─ lots_current_snapshot.csv  lots on feed or inbound on the operating date
│  └─ truth_audit_only.json      the hidden truth, used only by the backtest
├─ public/               USDA photographs and the CSV upload template
└─ docs/
   ├─ latex/             submission PDFs and their LaTeX sources
   ├─ TECHNICAL_BRIEF.md, DEMO_CASE.md, PROJECT_OVERVIEW.md, DATA_DICTIONARY.md
   ├─ LICENSES-THIRD-PARTY.md
   └─ research/          parameter values extracted from the supplied literature, with page references
```

## Using your own data

* **Upload arrivals:** *Arrivals & Lots → Upload CSV*, using `public/templates/arrivals_template.csv`. Columns are described in the upload drawer and in `docs/DATA_DICTIONARY.md`. Bad rows are rejected with a reason, and unknown values stay "unknown".
* **Enter a single lot:** *Arrivals & Lots → Enter a lot*.
* **Change assumptions:** *Assumptions & Sensitivity*. Every page re-simulates straight away.
* **Retrain on real records:** put your records in `src/data/generated/history.json`, using the same fields as `data/lots_history.csv`, then use *Model Lab → Inspect & retrain*.

Your edits, entered lots, vet reviews and assumption changes are saved in the browser's local storage. Clear the site data to reset.

## Data, external resources and AI use

* **Data:** NOAA NCEI GHCN-Daily weather and USDA ERS cattle prices (both public domain), and US Census boundaries through the `us-atlas` package (ISC licence).
* **Images:** six USDA photographs from Wikimedia Commons, public domain.
* **Literature:** the papers supplied with the challenge, cited in the technical brief. The PDFs themselves are not included in this repository.
* **Software:** open source only (MIT, ISC, Apache-2.0, OFL). The full list is in `docs/LICENSES-THIRD-PARTY.md`.
* **AI tools:** we used Anthropic's Claude, through Claude Code, to help write the code, the synthetic data generator and the documentation, and to extract parameter values from the supplied papers. The narration in our demo video was generated with a Microsoft neural text-to-speech voice. We directed the work, reviewed the code and outputs, checked the parameters against the cited sources, and take full responsibility for all claims and results.

## Limitations

The feedyard records are **synthetic**. They come from a documented, seeded process calibrated to the supplied literature and driven by real NOAA weather. The model metrics and the backtest show that the decision logic works as intended, but they do not prove how it would perform on a real yard. Anything involving medication is decision support only and **must be reviewed by the veterinarian of record**.

## Licence

The project code is released under the MIT Licence (see `LICENSE`). Third-party terms are listed in `docs/LICENSES-THIRD-PARTY.md`.
