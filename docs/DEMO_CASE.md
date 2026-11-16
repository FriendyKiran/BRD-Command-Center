# Demonstration case: one end-to-end management decision

Live version: dashboard → **Demonstration Case** (`/#/demo`). The page selects this lot automatically: among inbound Llano Estacado lots whose decision depends on a missing record, the one with the most money riding on the decision.

All figures below come from:
* the default assumptions, including the derived stewardship weight of $3 per antimicrobial regimen;
* the default (penalized logistic) risk model;
* seed 20251020.

If you change an assumption, the live page updates.

## Setting

* **Operating date:** Monday 20 October 2025, peak of the fall run.
* **Yard:** Llano Estacado Feeders, Lubbock TX. Mixed cattle sources and a thin crew: 170 free hospital-pen spaces, 8.5 receiving-crew rider hours/day, 39 lots in the planning window.
* **Current operating approach (baseline):** economy-class metaphylaxis only for lots under 550 lb; standard pen riding.

## 1. Inputs: lot LE-251101-01

| Record | Value |
|---|---|
| Arrival | Sat 1 Nov 2025, 162 steers, 589 lb |
| Source | Auction, single source. **Number of origins: unknown** |
| Haul | 593 mi |
| Vaccinated pre-arrival / weaned ≥ 45 d | yes / **unknown** |
| Order buyer | flagged high risk |
| Arrival-week weather (NOAA, Lubbock) | 11 °F max day-to-day swing, low 36 °F |

The SOP gives this lot **no metaphylaxis** (it is over 550 lb).

## 2. Risk

Expected 45-day BRD morbidity without metaphylaxis: **22.2 %** (80 % interval 8–41 %). Probability the lot is high-risk (≥ 15 %): **69 %**.

Main drivers, as odds multipliers vs the average lot:
* raise the risk: source & commingling ×1.29, arrival season ×1.29, arrival weight ×1.25;
* lower the risk: a mild arrival week (×0.87).

## 3. Alternatives and projected consequences (per head over the feeding period; vs SOP)

Value is feeding-period net return minus the $3/regimen stewardship weight. The dashboard states this basis under every value table.

| Option | Δ value vs SOP | Expected BRD deaths | Antimicrobial regimens |
|---|---|---|---|
| **Economy metaphylaxis** | **+$17.06** | 3.1 | 190 |
| Premium metaphylaxis + enhanced surveillance | +$16.98 | 2.0 | 190 |
| Fever screen + enhanced surveillance | +$16.82 | 2.7 | 81 |
| Premium metaphylaxis | +$15.63 | 2.3 | 184 |
| Fever screen | +$13.17 | 3.5 | 72 |
| No metaphylaxis, enhanced surveillance | +$4.03 | 3.8 | 56 |
| No metaphylaxis, pull-and-treat (**SOP**) | — | 4.7 | 43 |

Each option is simulated 400 times on the same paired futures; every page (lot list, lot page, demo, summary, model comparison) uses the same count, so they rank options identically. The top three options are within $0.24/head of each other, but they differ greatly in antimicrobial use: 190 regimens vs 81.

## 4. Can the data support the decision?

**Information insufficient.**
* Knowing **weaning status** would change the recommendation with **100 %** probability: either answer moves the decision away from economy metaphylaxis.
* Close call on antimicrobial use: economy metaphylaxis beats premium metaphylaxis with enhanced surveillance in only 60 % of paired simulations, across a wide risk range (8–41 %).
* The number of origins is also unknown and could change the recommendation (100 % chance, worth ≈ $0.70/head, below the $1/head "need info" threshold).

**Weaning status** is the record that matters most. Learning it is worth ≈ **$208** for the lot ($1.29/head):

* if weaned → risk 16.5 %: **fever screen + enhanced surveillance**, treating only feverish cattle (+$9.15/hd vs SOP, 63 regimens);
* if not weaned → risk 25.3 %: **premium metaphylaxis + enhanced surveillance** for the whole lot (+$23.29/hd, 194 regimens).

So one phone call decides whether 162 head get a whole-lot antibiotic or only the feverish ones do. It is a stewardship decision as much as an economic one.

**Model robustness** (lot page → "Do the other risk models agree?"):
* The two logistic models (22.2 %) and the model average (20.0 %) recommend economy metaphylaxis.
* The Rojas-predictor logistic, decision tree, random forest and boosted trees predict 17–21 % and recommend the fever screen with enhanced surveillance (4 of 7).
* Every model agrees the SOP's "pull and treat only" is the wrong call (each model's own choice is +$12.22 to +$17.06/hd better). They disagree only on how much antibiotic to use, exactly the question the phone call answers.

**Action:** call the order buyer about weaning before processing.

## 5. Yard constraints

The yard planner assigns economy metaphylaxis to this lot, the same as its stand-alone best option. Llano's capacity is not binding in this window: the hospital-pen peak is 82 of 170 places and both shadow prices are $0, so every lot can receive its own best option. (Capacity does bind at Palo Duro and Arkansas River, where pen-rider time is worth $139 and $1,377 per extra hour·day.) Across all 39 Llano lots the plan is **+$27.0k** vs the SOP, with **56 vs 78** expected BRD deaths, at the cost of **1,888 vs 960** antimicrobial regimens.

Llano's SOP treats only lots under 550 lb, so heavier but high-risk, buyer-flagged lots go untreated. Closing that gap is where the yard's gain comes from. Raising the stewardship weight on the planner traces how much of the extra antimicrobial use can be cut, and what each cut costs.

## 6. Recommendation

**Treat lot LE-251101-01 on arrival, with the intensity decided by one phone call.**
* If the buyer confirms the calves were weaned ≥ 45 days, use a chute-side fever screen with enhanced surveillance: treat only febrile cattle.
* If they were not weaned, use premium metaphylaxis with enhanced surveillance.
* If the call can't be made before processing, use economy-class metaphylaxis (the best option on current records).

Expected consequences of the default (economy metaphylaxis) vs SOP:
* +$17.06/head after the stewardship weight (+$2,763 for the lot);
* 3.1 vs 4.7 expected BRD deaths;
* 190 vs 43 antimicrobial regimens;
* peak hospital demand of 4.8 head from this lot.

## 7. Veterinary review and record

The option adds antimicrobial use beyond the yard's SOP, so it is marked **needs review** and queued for the veterinarian of record. The vet approves, modifies or declines it on the lot page (product, dose and withdrawal per label). **Decision Summary → Single lot → LE-251101-01** produces the signed one-page record (print/PDF, Markdown, JSON).
