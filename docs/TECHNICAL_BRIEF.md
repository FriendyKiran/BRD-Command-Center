# BRD Command Center: a post-arrival decision aid for BRD in feedlot production

*Technical brief: AISFS–Merck Animal Health Interdisciplinary Hackathon 2026*

## 1. Decision problem

**User.** The yard manager at each of four feedyards (two in the Texas Panhandle, two in western Kansas), working with the veterinarian of record.
**Decision unit.** The **arrival lot**: cattle placed into one pen on one day. This is the unit at which metaphylaxis is decided in practice (Rojas et al. 2022; NAHMS 2019). Individual pulls enter as observed cases.
**Decisions supported.**
1. *Before or at processing:* which of seven options to apply to an inbound lot: no metaphylaxis with standard or enhanced surveillance, chute-side fever screening with treatment of febrile cattle, or economy- or premium-class metaphylaxis (with or without enhanced surveillance).
2. *Days 1–45:* whether an on-feed lot running above expectation warrants mass treatment or closer watching.
3. *Yard level:* how to allocate options across all lots within hospital-pen, pen-rider, chute and stewardship limits.

**Information available at decision time.** Arrival weight, head, sex, source type, number of origins, haul and shrink, vaccination and weaning history (often unknown), the order buyer's risk call, pen and bunk space, and arrival-week weather. For on-feed lots: BRD pulls to date.
**Baseline.** Each yard's *current operating procedure* (SOP), e.g. "premium metaphylaxis for every lot under 725 lb". Every option and plan is reported as a difference from it.

## 2. Data and provenance

No dataset was provided and real feedyard records are proprietary, so we built a **documented synthetic operation** and anchored it to evidence at every point we could:

| Component | Status | Source |
|---|---|---|
| Daily weather, 4 stations, 2023–2025 | **Observed** | NOAA NCEI GHCN-Daily (public domain) |
| Feeder and fed cattle prices, 2023–2025 | **Observed** | USDA ERS Livestock & Meat Domestic Data (public domain) |
| Feeding-period economics | **Observed** equations | Weber et al. 2024 (ADG, AFC, VCPH, revenue, interest, cull terms) |
| Cost per BRD case, metaphylaxis cost, treatment-outcome tree | **Observed** (some secondary) | Rojas et al. 2022 ($151.18/case; $23.60); NAHMS 2011 via Johnson & Pendell 2017 (14.9 % / 12.0 % re-treatment; 4.0 / 13.3 / 30.5 % deaths after 1st/2nd/3rd treatment) |
| Visual-diagnosis sensitivity | **Observed** (secondary) | 62–67 % (Timsit et al. 2016, as cited in Adekunle & Kaniyamattam 2026) |
| Risk-factor directions | **Observed** (direction) | Adekunle et al. 2026 scoping review; Adekunle & Kaniyamattam 2026 |
| Risk-factor magnitudes, efficacy, onset timing, labour, capacities | **Assumed** | Team assumptions; editable; sensitivity-tested |
| 2,976 historical + 254 current lots | **Synthetic** | Seeded generator with a hidden "true" process |

**Calibration targets met** (lower-risk yard vs. Rojas et al. 2022's 1,733 cohorts): 45-day morbidity **7.2 %** (published 6.3 %) and **16 %** high-risk cohorts (10.85 %). Order-buyer call sensitivity / specificity **80 % / 59 %** (managers 83.75 % / 59.79 %). Overall BRD mortality **1.47 %** (Johnson & Pendell baseline 1.12 %).

**The hidden process is deliberately hard to learn.** Besides additive risk factors it contains:
* interactions: weather × light weight, haul × unweaned, big commingled lots, light bulls;
* thresholds: shrink above 7 %;
* vaccine protection that fails in commingled calves;
* yard-specific seasonality;
* an **unrecorded pathogen pressure** that clusters outbreaks in time within a yard;
* **record errors**: pay weights, false "vaccinated" entries, undercounted origins;
* lot-to-lot variation in metaphylaxis response;
* a modest **2025 strain shift** (weaker vaccine, stronger cold stress).

So no model sees the full truth, and the temporal holdout faces real concept drift. The four yards differ deliberately in cattle risk mix, crew size, hospital space, **record completeness** (vaccination status unknown on 11–54 % of lots, by yard) and SOP, so the demonstration contains real operating differences, incomplete information and binding constraints. Of the 52 parameters, 18 are observed, 6 estimated and 28 assumed (five of the assumed are confidence-labelling settings that never change a recommendation). The dashboard labels each one.

## 3. Methods

**Risk model.** Lot-level binomial logistic regression (detected 45-day cases ~ Binomial(head, p)), fit by Newton–Raphson with L2 penalty on 35 arrival features. Missing records get explicit "unknown" indicators, so missingness is modelled rather than imputed silently. Historical metaphylaxis is a covariate, so the model separates *risky lots* from *treated lots* (confounding by indication). Uncertainty has two parts: a 30-member **bootstrap ensemble** for parameter uncertainty, and a **beta-binomial** term for lot-to-lot variation the records cannot explain. **Explanations** are per-lot log-odds contributions grouped by risk factor and shown as odds multipliers. For lots on feed, a **Bayesian update** combines the arrival prediction with pulls observed so far, given the expected share of cases by that day on feed.

**Consequences.** For each lot and option, 400 **paired Monte Carlo** draws (the same count on every page, so all views rank options identically) sample the lot's risk, the efficacy of each drug class (± uncertainty) and the disease course. Every option is evaluated on the same simulated futures, so the differences between them are precise. Each draw produces true and detected cases, 1st/2nd/3rd treatments, deaths (higher when cases are missed), the hospital-pen census by day, rider and chute hours, and antimicrobial regimens. Net value per head uses Weber's equations for the healthy pen, Rojas's per-case loss, Weber's re-treatment cost increments and a death loss built from the same components, minus drug and incremental labour cost. **Stewardship ($/regimen)** and **welfare ($/death)** weights make non-market values explicit instead of hidden. Options are ranked on net value minus these weights, and every value table states this basis.

**The stewardship default is derived, not chosen.** Leadership asked for "more accountable antimicrobial use". We turn that into a testable commitment: the tool should use no more antimicrobials than the yards' current SOPs. The default weight is the smallest $/regimen at which the tool's *own expected* antimicrobial use on the 1,214 lots of 2024 is no higher than the SOPs'. That is **$3/regimen**, the shadow price of the commitment. It uses only pre-2025 records and the model's own predictions, never the hidden truth. A manager can set it to $0 (pure economics) or raise it to trade profit for fewer antimicrobials along the frontier in the Yard Planner.

**Information sufficiency.** Each lot gets: (i) the **expected value of perfect information** about its risk; (ii) the **value of information** for each missing record, computed by re-running the decision under each plausible value (weighted by that yard's records), together with the probability that learning it *changes the recommendation*; (iii) decision robustness, i.e. how often the best option beats the best option with a *different antimicrobial plan* on paired draws; and (iv) out-of-range checks against the training data. Confidence is about the decision, not the data. Unknown records, wide risk ranges and ties that differ only in surveillance are reported but do not lower confidence unless they could change the antimicrobial plan. These combine into *Robust / Use with caution / Information insufficient*, always stated with reasons. The thresholds are editable management settings on the Assumptions page:
* "Need info": a missing record flips the decision with probability ≥ 30 % and is worth ≥ $1/head, about the cost of a phone call spread over the lot.
* "Caution": ≥ 15 % and ≥ $0.25/head.
* Robust: the plan wins ≥ 60 % of paired draws against the best plan with a different antimicrobial plan.

These settings change labels, never recommendations. On the 82 inbound lots they give 35 Robust, 43 Caution and 4 Need info. Veterinary review is graded the same way: changes to antimicrobial use relative to the vet-approved SOP are queued for review, with escalations first, while recommendations matching the SOP fall under its standing protocol. Example: "Knowing weaning status would change the recommendation with 100 % probability (≈ $208 for the lot)".

**Portfolio planner.** For each yard it chooses one option per lot to maximise expected value subject to the daily hospital-pen census, rider hours and chute hours over a 60-day calendar, plus an optional antimicrobial cap. The method is greedy Lagrangian-style repair followed by improving swaps. **Shadow prices** come from re-solving at +10 % capacity. The planner also sweeps the stewardship weight to trace a **value vs. antimicrobial-use frontier**. When no plan can meet every constraint (most of the load comes from cattle already on feed), the dashboard says so and quantifies the overflow.

**Interface.** A React 19 + TypeScript single-page app. The engine runs in a Web Worker, so all current lots are re-simulated about 1.5 s after any change. Managers can enter or upload lots (validated CSV), edit records in what-if mode, change every assumption, lock options, retrain the model, record veterinary sign-off and export a decision summary (print/PDF, Markdown, JSON). It needs no server, account or paid service.

## 4. Evidence and evaluation

**Prediction (temporal holdout: trained before 2025-01-01, tested on 666 lots from 2025).** AUC for identifying high-risk lots is **0.772** (95 % CI 0.734–0.807), vs **0.640** for the order buyer's yes/no call. Rojas et al. report 0.68–0.79 on real cohorts. Random 5-fold CV gives 0.836. The gap is the price of outbreak clustering and the 2025 shift, which is why we report the temporal holdout. The calibration slope is 0.81, so 2025 predictions are slightly too extreme. The model re-estimates premium metaphylaxis RR ≈ 0.41 from records (truth 0.48), which illustrates residual confounding by indication, so the decision engine uses the explicit, editable efficacy assumption instead.

**Model comparison (Model Lab).** Seven model families ran on the same holdout. Any of them can drive the engine, and the comparison plots can overlay any subset or isolate a single model.

| Model | Holdout AUC | 5-fold CV AUC | Decision value vs SOP (default $3/regimen) | Regimens /100 hd |
|---|---|---|---|---|
| Penalized logistic | 0.772 | 0.836 ± 0.015 | +$4.54/hd | 60.5 |
| Bayesian logistic (Laplace) | 0.772 | 0.836 | +$4.50/hd | 60.3 |
| Model average | 0.763 | 0.832 | +$4.21/hd | 57.5 |
| Gradient-boosted trees | 0.757 | 0.824 | +$4.10/hd | 58.4 |
| Random forest | 0.743 | 0.816 | +$3.55/hd | 56.0 |
| Decision tree | 0.705 | 0.764 | +$3.40/hd | 53.6 |
| Logistic on Rojas et al.'s predictors only | 0.682 | 0.748 | +$2.33/hd | 48.6 |

* Richer arrival records add +0.090 AUC and +$2.21/hd over Rojas's predictor set. That model's 0.682 sits at the low end of the range they published.
* Decision value tracks predictive quality, and every model beats current SOPs.
* Boosted trees come within 0.015 AUC of the GLM despite the hidden interactions. With about 2,300 training lots and engineered features that already encode the main non-linearities, the penalized GLM's lower variance still wins. More records or raw inputs would favour the trees.
* Evaluation also reports PR-AUC, log loss, Brier skill, calibration slope, ECE, decision curves, per-yard AUC and permutation importance.
* A Data Explorer documents the EDA: all integrity checks pass, and covariate drift is small (all |SMD| ≤ 0.15; weather PSI up to 0.24). Missing vaccination records are not informative here (11.7 % morbidity with or without), and the concept drift appears only in the CV-vs-holdout gap.

**Decision quality (policy backtest).** On the same 2025 holdout, each policy chose an option for every lot using arrival-day records. Each choice (200 paired draws per lot) was then scored with 300 draws against the hidden truth:
* each lot's **true BRD incidence**;
* its **true response to each drug class**: lot-to-lot variation, with PI-exposed lots responding poorly.

The tool never sees either. Net value below is cash: the stewardship weight is not deducted.

| Policy (96,089 head) | Net value vs SOP | Regimens /100 hd | BRD mortality |
|---|---|---|---|
| Current yard SOPs | — | 64.2 | 1.52 % |
| Blanket premium metaphylaxis | −$1.24/hd | 110.6 | 1.17 % |
| No metaphylaxis | −$10.98/hd | 21.1 | 2.31 % |
| Order buyer's call | +$1.74/hd | 65.8 | 1.44 % |
| This tool, pure economics ($0/regimen) | +$4.24/hd | 75.4 | 1.31 % |
| **This tool, default ($3/regimen, derived)** | **+$4.54/hd** | **60.5 (−6 %)** | **1.29 %** |
| *Perfect information (upper bound)* | *+$8.98/hd* | *67.0* | *1.13 %* |

**At its default the tool beats current practice on profit, antimicrobial use and mortality at the same time.** That is the "accountable antimicrobial use without shifting costs or leaving cattle uncared for" leadership asked for. It captures 51 % of the gain that perfect knowledge of every lot's true risk and drug response would allow. The default even earns slightly more than pure economics: the tool's assumed efficacy is optimistic for some lots, and the weight trims marginal metaphylaxis that would not pay. By yard, antimicrobial use falls at three yards (−7 %, −13 %, −33 %) and rises at Llano (+93 %). Llano's SOP (economy metaphylaxis only below 550 lb) leaves heavier but high-risk, buyer-flagged lots untreated, and correcting that is also where the largest gain is (+$12.47/hd).

**Robustness: what if our assumptions are wrong?** The backtest's base case shares the tool's economics, so a good result there could be circular. We therefore re-scored the *same* choices, still made with default assumptions, in nine worlds where those assumptions are wrong:

| World (truth differs from the tool's assumptions) | Tool vs SOP | Order buyer vs SOP | Blanket premium vs SOP | Share of perfect-info gain | Regimens (tool vs SOP) | BRD mortality (tool vs SOP) |
|---|---|---|---|---|---|---|
| As assumed (base case) | **+$4.54** | +$1.74 | −$1.24 | 51 % | 60 vs 64 | 1.29 vs 1.52 % |
| Metaphylaxis 30 % less effective | **+$4.85** | +$0.97 | −$4.46 | 60 % | 63 vs 66 | 1.50 vs 1.76 % |
| Metaphylaxis 30 % more effective | **+$4.26** | +$2.52 | +$1.98 | 41 % | 58 vs 62 | 1.09 vs 1.29 % |
| BRD case costs half as much | **+$4.19** | +$0.91 | −$4.62 | 56 % | 60 vs 64 | 1.29 vs 1.52 % |
| BRD case costs twice as much | **+$5.25** | +$3.40 | +$5.51 | 37 % | 60 vs 64 | 1.29 vs 1.52 % |
| Drugs 50 % dearer | **+$5.71** | +$1.28 | −$7.43 | 56 % | 60 vs 64 | 1.29 vs 1.52 % |
| October 2025 market prices | **+$8.20** | +$3.13 | +$4.79 | 51 % | 60 vs 64 | 1.29 vs 1.52 % |
| Enhanced surveillance barely helps | **+$3.08** | +$1.74 | −$1.24 | 40 % | 59 vs 64 | 1.44 vs 1.52 % |
| Missed cases twice as deadly | **+$7.20** | +$2.13 | +$0.49 | 58 % | 60 vs 64 | 1.74 vs 2.25 % |
| Pessimistic: all three against metaphylaxis | **+$5.56** | −$0.06 | −$12.95 | 48 % | 63 vs 66 | 1.50 vs 1.76 % |

In **all 10 worlds** the tool earns more than the SOPs (+$3.08 to +$8.20/hd), uses **no more antimicrobials**, and has **fewer BRD deaths**. Blanket metaphylaxis swings from −$12.95 to +$5.51 and the order buyer's call from −$0.06 to +$3.40: rules of thumb are brittle when conditions change, while lot-level decisions adapt. Surveillance effectiveness matters most (+$3.08 when enhanced riding barely helps), which identifies the assumption most worth measuring on a real yard.

**Demonstration case** (`docs/DEMO_CASE.md`): lot LE-251101-01 at Llano Estacado (162 auction steers, 589 lb, buyer-flagged, weaning status and number of origins unknown). The SOP gives no metaphylaxis. On current records the tool recommends economy-class metaphylaxis (+$17.06/hd after the stewardship weight, 3.1 vs 4.7 expected deaths). It rates the information **insufficient**:
* premium metaphylaxis with enhanced surveillance and a fever screen with enhanced surveillance are within $0.24/hd, but the fever screen uses less than half the antimicrobials (81 vs 190 regimens);
* a call about weaning (≈ $208) changes the answer whichever way it goes: weaned means fever screen + enhanced surveillance, not weaned means premium + enhanced surveillance.

Four of the seven risk models prefer the fever screen, which confirms that the lot sits on a decision boundary.

## 5. Trade-offs, assumptions and limitations

* **Synthetic records.** Every model and backtest number reflects the decision logic under a documented, literature-calibrated process, not field performance. The retrain panel and CSV import are the path to validating on a yard's own records.
* **Effect sizes.** None of the supplied sources report adjusted odds ratios for risk factors. Magnitudes are assumptions with literature-consistent directions. Metaphylaxis efficacy (RR 0.5) mirrors Rojas's 50 % assumption. The tornado analysis on the Assumptions page shows which assumptions can flip a given decision (most often efficacy, drug cost and per-case loss).
* **Economics.** Weber's coefficients make treated pens convert feed *better* (negative AFC term). Applied per head, this cancels most of the gain penalty, while their large losses come through a mortality equation they do not print. We therefore price disease per case (Rojas) on top of a healthy-pen Weber baseline. Absolute margins are negative and depend heavily on prices:
* about −$70/hd under the SOPs at Weber's simulation prices for this lighter, higher-risk synthetic population;
* about −$464/hd at October 2025 USDA ERS prices, when feeder cattle cost far more than the fed-cattle price could recover.

The dashboard offers both presets. Decisions rest on *differences* between options, which stay positive and stable: the tool gains +$4.54/hd vs the SOPs at Weber prices and +$8.20/hd at 2025 prices.
* **Nutrition.** We judged nutrition relevant but could not represent it at the arrival decision honestly, for two reasons:
  * none of the supplied sources quantifies receiving-ration or water effects on BRD risk;
  * no nutrition record exists for a lot before it is processed.

  Its proxies enter instead:
  * shrink (transit dehydration and feed deprivation);
  * weaning status (calves not yet on feed);
  * bunk space per head (access to the receiving ration).

  The natural extension is an on-feed signal: daily bunk reads or dry-matter intake in the first 7–10 days fall before clinical BRD. They would enter the Bayesian on-feed update alongside sick pulls.
* **Scope.** Respiratory disease only. Products, doses and withdrawal times are intentionally left to the veterinarian. Weather for scheduled arrivals uses observed data as a stand-in for forecasts. Transmission between pens is not modelled.
* **With more data:** real lot records with treatment timing would let us estimate effect sizes and efficacy (causal methods such as propensity weighting) instead of assuming them. Chute-side temperatures, remote sensing or accelerometers would sharpen the on-feed update. Lung-lesion data would calibrate detection sensitivity, and closeouts would let us re-estimate the economic equations.

**Veterinary oversight.** Every option that involves antimicrobials is labelled, queued for review, and printed with a signature line for the veterinarian of record.

## References

Adekunle A, Kaniyamattam K (2026) Bovine respiratory disease: epidemiological drivers, transmission dynamics, and economic implications in beef production systems. MDPI. · Adekunle A, et al. (2026) Mapping variability in BRD risk factors in beef production systems: a scoping review. *Animals* 16:1726. · Johnson KK, Pendell DL (2017) Market impacts of reducing the prevalence of BRD in US beef cattle feedlots. *Front Vet Sci* 4:189. · Rojas HA, White BJ, Amrine DE, Larson RL (2022) Predicting BRD risk in feedlot cattle in the first 45 days post arrival. *Pathogens* 11:442. · USDA APHIS (2019) Antimicrobial Use and Stewardship on U.S. Feedlots, 2017. NAHMS. · Weber KMD, Schroeder TC, Renter DG, Pendell DL, Tonsor GT (2024) Evaluation of BRD morbidity in the feedlot and its effect on net return distributions. AAEA poster. · Menne MJ, et al. (2012) GHCN-Daily v3, NOAA NCDC, doi:10.7289/V5D21VHZ. · USDA ERS, Livestock and Meat Domestic Data (accessed 2026-11-13).

*AI disclosure: developed with assistance from Anthropic's Claude (Claude Code); the team verified parameters and claims against the cited sources.*
