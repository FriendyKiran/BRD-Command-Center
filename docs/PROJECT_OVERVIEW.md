# BRD Command Center: the whole project, end to end

*A plain-language guide to the problem, our approach, the engine and the dashboard. For the team and presentation prep. Figures are from the default assumptions, the default (penalized logistic) risk model and seed 20251020.*

---

## 1. The problem in plain terms

**What BRD is.** Bovine respiratory disease (BRD) is pneumonia in cattle. It is the most costly disease in US feedlots. Most cases appear in the **first 45 days after cattle arrive**, when animals are stressed by:

* weaning and long hauls;
* being mixed with cattle from other sources;
* weather swings.

**The core decision.** When a group of cattle arrives, the manager must decide how to handle it. The main choices are:

* **Metaphylaxis:** give the whole group an antibiotic on arrival. This prevents many cases but uses a lot of antibiotics.
* **Watch and treat:** don't treat everyone; ride the pens, pull sick animals and treat them individually.
* **Something in between:** take every animal's temperature at processing and treat only the feverish ones, or watch the group more closely.

Treat too little and cattle get sick and die, costing money and welfare. Treat too much and you spend on drugs and use antibiotics where they weren't needed, which is a stewardship and public-health concern.

**The hackathon framing.** We are the analytics team for a company running **four feedyards** in the Texas Panhandle and western Kansas. The vice president's ask is to give the managers a tool for optimal cattle-health decisions after arrival. Leadership adds three conditions:

* lower losses;
* more accountable antibiotic use;
* no strategy that merely shifts costs or leaves vulnerable cattle without care.

They also stress that records are incomplete and that staff, pen space and treatment capacity are limited.

**The four things the tool must connect:**

1. **Risk:** which cattle need attention, and why?
2. **Action:** what should the manager do, and when?
3. **Consequences:** what does each option mean for health, cost and antibiotic use?
4. **Feasibility:** does the plan fit within the yard's real limits?

On top of that, the tool must say when the data **can't** support a confident decision, and medication decisions must go to a **veterinarian**.

---

## 2. How we framed it (the design decisions)

| Question the brief asks | Our answer | Why |
|---|---|---|
| Who uses the tool? | The **yard manager**, with the **veterinarian of record** approving anything with drugs | They make the arrival decision; vets must sign off on antibiotics |
| What is the decision unit? | The **arrival lot**: one group of cattle placed in one pen on one day | Metaphylaxis is decided per lot in practice, and Rojas et al. 2022 predicts at lot level |
| What decisions? | (1) Which of 7 options for each inbound lot; (2) whether an on-feed lot running hot needs action; (3) how to plan the whole yard within capacity | These cover arrival, the 45 days after, and the yard as a whole |
| What info exists at decision time? | Weight, head count, sex, source, number of origins, haul and shrink, vaccination and weaning (often **unknown**), the order buyer's risk call, pen and bunk space, arrival-week weather; for on-feed lots, sick pulls so far | Only what a manager actually has on arrival day; nothing from the future |
| What is it compared against? | Each yard's **current operating procedure (SOP)**, e.g. "premium metaphylaxis for every lot under 725 lb" | The brief requires comparison against a defined current approach, so every number is shown as **better or worse than today** |

**The 7 options:**

| Option | Antibiotic use | Surveillance |
|---|---|---|
| No metaphylaxis | none | standard pull-and-treat |
| No metaphylaxis, enhanced | none | extra pen riding and temperature checks |
| Fever screen | treat only the feverish animals | standard |
| Fever screen, enhanced | treat only the feverish animals | extra |
| Economy metaphylaxis | cheaper, shorter-acting drug class, whole lot | standard |
| Premium metaphylaxis | longer-acting drug class, whole lot | standard |
| Premium metaphylaxis, enhanced | longer-acting drug class, whole lot | extra |

Products and doses are deliberately not named; those are the vet's call.

---

## 3. The data: what's real, what's synthetic, and why

**No dataset was provided**, and real feedyard records are confidential, so we built a **documented synthetic operation** anchored to real evidence wherever possible.

**Real (observed) data:**

* daily weather for each yard's town from NOAA GHCN-Daily, 2023–2025;
* cattle prices from USDA ERS;
* the economic equations from Weber et al. 2024;
* cost per BRD case and metaphylaxis cost from Rojas et al. 2022;
* re-treatment and death rates from NAHMS via Johnson & Pendell 2017;
* detection sensitivity: pen riders spot only about 62 % of sick cattle.

**Synthetic data:** 2,976 historical lots and 254 current lots (82 inbound, 172 on feed) across 4 yards, made by a **seeded generator** (`src/engine/generator.ts`).

**The key idea is a hidden truth.** The generator holds a secret formula for each lot's true BRD risk. The dashboard **never sees it**. It must learn risk from the records, as a real yard would. Only the backtest script (`scripts/evaluate-model.ts`) peeks at the truth to grade the tool afterwards. That is what lets us measure honestly whether the tool's decisions were good.

**Why the data is deliberately hard.** The hidden process includes:

* combined effects: weather hurts light calves more, hauls hurt unweaned calves more;
* thresholds, such as severe shrink above 7 %;
* vaccines that work less well in commingled calves;
* different seasonal swings by yard;
* an **unrecorded disease pressure** that makes outbreaks cluster in time;
* **record errors**: wrong weights, false "vaccinated" entries, undercounted origins;
* uneven response to drugs;
* a **2025 strain shift**.

As a result, no model can learn it perfectly. That is realistic: published BRD models reach an AUC of about 0.68–0.79.

**The four yards differ on purpose,** because the brief asks for meaningful operating differences:

| Yard | Cattle | Capacity | Records |
|---|---|---|---|
| Palo Duro | light, high-risk sale-barn calves | largest hospital, but pen-rider time binds in the fall run | |
| Llano Estacado | mixed | thin crew, small hospital; weight-only SOP | |
| Cimarron | low-risk yearlings | | |
| Arkansas River | | **pen-rider time binds; hospital near full** (171 of 180 places at peak) | **very incomplete** (about 50 % vaccination unknown) |

**Calibration:**

* **Low-risk yard:** 7.2 % morbidity vs 6.3 % in Rojas's real cohorts.
* **Order buyer:** catches 80 % of high-risk lots with 59 % specificity, vs 84 % and 60 % for the managers in Rojas.
* **Parameters:** each of the 52 is labelled **observed / estimated / assumed** in the app (18 / 6 / 28).

---

## 4. The engine: how a recommendation is made

All of this runs in the browser, in a background thread (a Web Worker), with no server. For each lot, five steps run.

### Step 1. Risk: "how likely is this lot to get sick, and why?"

* **The model:** a logistic regression learns from history how each record (weight, source, weather and so on) shifts the odds of BRD.
* **Missing records:** "unknown" is its own category, not silently filled in.
* **Past treatment:** the model accounts for whether a lot got metaphylaxis, so it doesn't confuse "treated" with "safe". This is called confounding by indication.
* **Output:**
  * expected 45-day morbidity, e.g. 22 %;
  * an **80 % range**, e.g. 8–41 %;
  * P(high-risk lot);
  * the **drivers** as odds multipliers, e.g. "source & commingling ×1.29".
* **Uncertainty:** it comes from 30 re-fitted versions of the model plus allowance for lot-to-lot variation the records can't explain.
* **On-feed lots:** a **Bayesian update** combines the arrival prediction with the sick pulls seen so far.

### Step 2. Consequences of each option: "what happens if I do X?"

* **Simulation:** for each of the 7 options, 400 Monte Carlo runs (the same count on every page) sample the lot's risk, drug effectiveness and the course of the disease.
* **Fair comparison:** every option faces the *same* random futures, so differences between options are real, not noise.
* **Each run counts:**
  * cases, detected and missed;
  * re-treatments and deaths;
  * hospital-pen head per day;
  * rider and chute hours;
  * antibiotic regimens;
  * **net dollars per head**, using Weber's economics plus Rojas's cost per case.
* **Optional weights:** a **stewardship price** ($ per antibiotic regimen) and a **welfare price** ($ per death) make non-market values explicit.

### Step 3. Is the information good enough?

This is the "say when you can't decide" requirement. The engine checks:

* **Value of information:** for each missing record (say, weaning), it re-runs the decision as if the answer were yes, then no. That gives "learning this would change the recommendation with 100 % probability; it's worth ≈ $208".
* **Robustness:** how often the best option beats the best option with a *different antimicrobial plan* in the paired runs (e.g. only 60 % for the demo lot, a near tie). A tie between surveillance levels on the same drug plan doesn't count, because either choice is acceptable.
* **Out-of-range inputs:** values unlike anything in the training data.

These combine into a plain flag, always shown with the reasons. The flag measures whether the **decision** is uncertain, not whether the data is imperfect:

* **Information insufficient:** a missing record would likely flip the decision, or the lot is unlike anything in the training data.
* **Use with caution:** the recommendation beats the best option with a different antibiotic plan in fewer than 60 % of paired runs (a close call), or a missing record could plausibly change the plan.
* **Robust:** otherwise. Unknown records that change nothing, wide risk ranges and near-ties that differ only in surveillance are listed as notes, not warnings.

On the 82 inbound lots this gives 35 Robust, 43 Caution and 4 Information insufficient.

### Step 4. Feasibility: the yard planner

Choosing the best option for each lot on its own can break the yard, for example by sending too many cattle to the hospital on the same day. The planner picks one option per lot to **maximise total value** while respecting:

* daily hospital-pen space over a 60-day calendar;
* rider hours and chute hours;
* an optional antibiotic cap.

It also reports:

* **Shadow prices:** what one more hospital pen or rider hour would be worth.
* **A value vs antibiotic-use frontier:** how much profit each cut in antibiotics costs.
* **Overflow:** if no plan fits (often because of cattle already on feed), it says so with numbers instead of pretending.

### Step 5. Veterinary review

The yard's SOP is itself a vet-approved standing protocol, so review is graded by how far the recommendation departs from it:

| Label | Meaning |
|---|---|
| **needs review** | Adds or escalates antibiotics beyond the SOP. The vet must approve before processing |
| **review: less drug** | Uses less, or a lower-class drug, than the SOP. The vet should confirm |
| **review: no drug** | Withholds the SOP's metaphylaxis. The vet should confirm |
| **SOP protocol** | Same antibiotic plan as the SOP, so it is covered by the standing protocol |
| **no drugs** | No antibiotics in the recommendation or the SOP |

Any lot can still be reviewed. The vet approves, modifies or declines it on the lot page, and the decision summary prints with a signature line.

### The 7 risk models (Model Lab)

Logistic regression is the default, but the engine can also run on:

* a Bayesian logistic;
* a logistic using only Rojas's predictors;
* a decision tree;
* a random forest;
* gradient-boosted trees;
* a model average.

Any of them can drive the whole engine. This shows our choice of model was tested, not assumed.

---

## 5. The dashboard, page by page

| Page | What the manager does there | Requirement it answers |
|---|---|---|
| **Command Center** (`/`) | Sees all 4 yards: inbound lots, risk, the tool's plan vs the SOP, and the hospital-pen outlook | **Identify priorities** at a glance |
| **Arrivals & Lots** (`/lots`) | Sorts and filters every lot by risk and recommendation; **uploads a CSV** (rows validated, bad ones rejected with a reason) or **types in a lot** | **Enter or upload data, inspect groups** |
| **Lot page** (click any lot) | Sees the full assessment for one lot (details below) | **Risk, Action, Consequences, Uncertainty, Vet review** |
| **Yard Planner** (`/plan`) | Drags hospital capacity, rider hours or the stewardship weight, and the plan re-optimises live; sees the frontier and shadow prices | **Feasibility; change constraints and see consequences** |
| **Decision Summary** (`/summary`) | Produces a one-page record for one lot or a whole yard: print/PDF, Markdown or JSON, with a vet signature line | **A clear, usable decision summary** |
| **Assumptions & Sensitivity** (`/assumptions`) | Edits every parameter (drug efficacy, prices, cost per case…), each tagged observed / estimated / assumed with its source; a **tornado chart** shows which assumptions could flip a decision | **Change assumptions; separate observations from assumptions** |
| **Data Explorer** (`/data`) | Explores the training data (details below) | **Data provenance; what the data can and can't support** |
| **Model Lab** (`/model`) | Compares models on one leaderboard, picks which to plot, digs into one model, sees the decision backtest, retrains | **Evidence and evaluation** |
| **Demonstration Case** (`/demo`) | Follows one decision end to end, computed live | **The required demonstration case** |
| **Data, Licenses & Credits** | Lists every data source, image and library, with its licence | **Provenance, licensing, AI disclosure** |

**What the lot page shows:**

* risk with its range and drivers;
* which unknown records matter: the Arrivals table shows "no effect on decision" or "confirm weaning", not just a count;
* all 7 options ranked against the SOP on dollars, deaths and antibiotics;
* the confidence flag with reasons and what each missing record is worth;
* a **What if?** panel (on the demo lot, change weaning from "unknown" to "yes" and the recommendation moves to a fever screen; "no" moves it to premium metaphylaxis with enhanced surveillance);
* the 7-model agreement check;
* the vet review buttons.

**What the Data Explorer shows:**

* the outcome distribution and the spread between yards;
* missing records;
* risk by each factor, with confidence intervals;
* seasonality;
* confounding by indication;
* quality checks;
* drift between training years and 2025.

**Why the dashboard counts as "not static":** every number is computed live in the browser. Change an assumption, a constraint or a lot's record, and all 254 lots are re-simulated (about 421,000 paired option simulations) in about 1.5 seconds. The brief explicitly rejects precomputed results.

---

## 6. The evidence that it works

**Prediction** (trained on 2023–24, tested on 666 lots arriving in 2025):

| Measure | Value |
|---|---|
| Model AUC for high-risk lots | **0.772** |
| Order buyer's yes/no call | 0.640 |
| Random cross-validation (optimistic) | 0.836 |

The 0.836 vs 0.772 gap is honest proof that outbreaks cluster and 2025 differs. That is why we test on the *future*, not on random folds.

**Decisions** (each policy's choices on the 2025 lots, graded against the hidden truth: each lot's true risk *and* its true response to each drug, neither of which the tool sees):

| Policy | Cash $/head vs SOP | Antibiotic regimens /100 head | BRD mortality |
|---|---|---|---|
| Current SOPs | — | 64.2 | 1.52 % |
| Treat every lot | −$1.24 | 110.6 | 1.17 % |
| Treat no lot | −$10.98 | 21.1 | 2.31 % |
| Follow the order buyer's call | +$1.74 | 65.8 | 1.44 % |
| The tool, pure economics ($0/regimen) | +$4.24 | 75.4 | 1.31 % |
| **The tool, default ($3/regimen)** | **+$4.54** | **60.5 (−6 %)** | **1.29 %** |
| *Perfect information (upper bound)* | *+$8.98* | *67.0* | *1.13 %* |

**The default tool beats current practice on profit, antibiotic use and deaths at the same time.** That is exactly leadership's condition: no cost-shifting, no neglected cattle. It captures about half (51 %) of what perfect knowledge would allow.

**Where the $3 comes from.** It is not a number we picked. It is the smallest stewardship weight at which the tool's own expected antibiotic use on the 2024 lots is no higher than today's SOPs. So the default means "no more antibiotics than today", which turns "accountable antimicrobial use" into something we can check. Set it to $0 for pure economics.

**Robustness: what if our assumptions are wrong?** The tool keeps deciding with its default assumptions, but the outcomes are scored in nine "wrong-assumption" worlds:
* drugs 30 % weaker or stronger;
* BRD cases half or twice as costly;
* drugs 50 % dearer;
* October 2025 cattle prices;
* enhanced surveillance that barely helps;
* missed cases twice as deadly;
* a pessimistic world combining three of these.

| | Tool vs SOP across the 10 worlds |
|---|---|
| More profit | **10 of 10** (+$3.08 to +$8.20/head) |
| No more antibiotics | **10 of 10** |
| Fewer BRD deaths | **10 of 10** |
| Share of perfect-information gain | 37–60 % |

The simple rules are brittle by comparison: blanket metaphylaxis ranges from −$12.95 to +$5.51/head, and the order buyer's call from −$0.06 to +$3.40. The full table is in the brief and on Model Lab → Decision backtest.

**Model check:** the better a model predicts, the better its decisions, and every model beats the SOP. Richer arrival records add +0.09 AUC and +$2.21/head over Rojas's predictor set.

| Model | Holdout AUC | 5-fold CV AUC | Decision value vs SOP (default) |
|---|---|---|---|
| Penalized logistic (default) | 0.772 | 0.836 | +$4.54/hd |
| Bayesian logistic | 0.772 | 0.836 | +$4.50/hd |
| Model average | 0.763 | 0.832 | +$4.21/hd |
| Gradient-boosted trees | 0.757 | 0.824 | +$4.10/hd |
| Random forest | 0.743 | 0.816 | +$3.55/hd |
| Decision tree | 0.705 | 0.764 | +$3.40/hd |
| Logistic on Rojas's predictors only | 0.682 | 0.748 | +$2.33/hd |

---

## 7. The demonstration case in one paragraph

**The lot.** On Monday 20 October 2025, lot **LE-251101-01** is heading to Llano Estacado, the yard with the thin crew: 162 auction steers, 589 lb, flagged by the buyer, with **weaning status and number of origins unknown**. The SOP gives it nothing, because it is over 550 lb.

**What the tool finds.** Predicted risk is 22 % (range 8–41 %). On current records it recommends **economy-class metaphylaxis**: +$17.06/head after the stewardship weight, 3.1 vs 4.7 expected deaths.

**Why it's cautious.** It flags the information as **insufficient**:

* the top three options are within $0.24/head, yet the fever screen uses less than half the antibiotics (81 vs 190 regimens);
* one phone call about weaning (worth ≈ $208) settles it: weaned means fever screen (treat only feverish cattle), not weaned means premium metaphylaxis for the whole lot;
* 4 of 7 models prefer the fever screen, which confirms the lot is on a boundary.

So the call decides how many animals get antibiotics, not just which drug.

**The outcome.** The yard planner confirms the choice fits Llano's capacity (nothing binds at Llano in this window; capacity binds at Palo Duro and Arkansas River). The vet signs the summary. That one lot shows every requirement working together. Full write-up: `docs/DEMO_CASE.md`.

---

## 8. Limitations and how to answer likely judge questions

**"The data is synthetic, so how do we know it works?"** The backtest proves the *decision logic* works when the truth is known, which you can never check on real data. The CSV upload and retraining panel are the path to real records. We say this openly in the app and the brief.

**"Isn't the backtest circular? You grade the tool with your own model."** Not on drug response: each lot's true response comes from the hidden truth, not the engine's assumption. For economics and the rest, the stress test answers it directly. The same choices are re-scored in nine worlds where efficacy, case cost, drug and cattle prices, surveillance or missed-case mortality differ from what the tool assumed. It beats the SOP, uses no more antibiotics and loses fewer cattle in all ten. The weakest world (enhanced surveillance barely helps, +$3.08/head) tells a real yard what to measure first.

**"Where do the effect sizes come from?"** The supplied papers give the *directions*, not adjusted odds ratios. Magnitudes are labelled assumptions, editable, and stress-tested by the tornado chart.

**"Why logistic regression and not AI or deep learning?"** We tested six alternatives, including boosted trees. Logistic regression won on the 2025 holdout and on decision value, and its explanations are exact. That makes it defensible to a manager and a vet.

**"What about the vet?"** Nothing involving antibiotics is final until the vet records a review. Products and doses are left to the vet.

**Scope:** respiratory disease only; no pen-to-pen spread; weather for upcoming arrivals uses observed data as a stand-in for forecasts.

---

## 9. How the pieces map to the submission package

| Required | Where it is |
|---|---|
| Working dashboard, launch instructions, nothing paid | `npm install && npm run dev`; `README.md` |
| Shareable data, data dictionary, generation and analysis code | `data/`, `docs/DATA_DICTIONARY.md`, `scripts/`, `src/engine/` |
| Technical brief (the problem statement asks for 3 pages or fewer; ours is ≈ 3,300 words) | `docs/TECHNICAL_BRIEF.md` |
| Demonstration case | `docs/DEMO_CASE.md` plus the live `/demo` page |
| External resources and AI disclosure | `README.md`, `docs/LICENSES-THIRD-PARTY.md`, Credits page |
