import { ArrowRight, CheckCircle2, ClipboardSignature, Gauge, HelpCircle, Phone, Stethoscope, Truck } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge, Callout, Card, ConfidenceBadge, PageHeader, RiskMeter, Spinner, StrategyChip } from "../components/ui";
import { SNAPSHOT } from "../data";
import { assessLot } from "../engine/assess";
import type { LotArrival, LotAssessment, SourceType, TriState } from "../engine/types";
import { SEX_LABEL, SOURCE_LABEL, YARD_INDEX } from "../engine/yards";
import { fmtDate, num, pct, usd, valueBasis } from "../lib/format";
import { useEngine, useYards } from "../state/engine";
import { usePlans } from "../state/plan";
import { useActiveModel } from "../state/models";
import { useApp } from "../state/store";

/**
 * The demonstration case: one end-to-end management decision chosen automatically from the
 * snapshot. We pick the inbound lot at Llano Estacado (the capacity-constrained yard) where missing
 * records matter most, then walk through inputs → risk → alternatives → information → capacity →
 * recommendation → veterinary review → summary. Every number on this page is live.
 */
export default function Demo() {
  const { assessments } = useEngine();
  const plans = usePlans();
  const params = useApp((s) => s.params);
  const { model } = useActiveModel();
  const yards = useYards();

  const pick = useMemo(() => {
    const pool = assessments.filter((a) => a.lot.yardId === "llano" && a.lot.status === "scheduled");
    // Lots whose decision depends on a missing record; fall back to every inbound lot if none does.
    const dependent = pool.filter((a) => (a.infoValue[0]?.flipProb ?? 0) >= params.confFlipRelevant);
    return [...(dependent.length ? dependent : pool)].sort((a, b) => score(b) - score(a))[0];
  }, [assessments, params.confFlipRelevant]);

  const scenarios = useMemo(() => {
    if (!pick) return null;
    const field = pick.infoValue[0]?.field;
    if (!field) return null;
    const alts: { label: string; patch: Partial<LotArrival> }[] =
      field === "vaccinated" || field === "weaned"
        ? [
            { label: `${field === "vaccinated" ? "Vaccinated" : "Weaned"}: yes`, patch: { [field]: "yes" as TriState } },
            { label: `${field === "vaccinated" ? "Vaccinated" : "Weaned"}: no`, patch: { [field]: "no" as TriState } },
          ]
        : field === "source"
          ? (["ranch_direct", "auction_multi"] as SourceType[]).map((s) => ({ label: SOURCE_LABEL[s], patch: { source: s } }))
          : [
              { label: "1 source", patch: { nSources: 1 } },
              { label: "9 sources", patch: { nSources: 9 } },
            ];
    return alts.map((x) => ({ ...x, a: assessLot(model, { ...pick.lot, ...x.patch }, params, { voi: false }) }));
  }, [pick, model, params]);

  if (!pick || !plans)
    return (
      <div className="flex items-center gap-2 p-10 text-ink-3">
        <Spinner /> Preparing the demonstration case…
      </div>
    );
  const lot = pick.lot;
  const yard = yards.find((y) => y.id === lot.yardId)!;
  const yp = plans[lot.yardId];
  const planned = pick.results.find((r) => r.strategy.id === yp.plan.choice[lot.lotId])!;
  const forced = planned.strategy.id !== pick.best.strategy.id;
  const sorted = [...pick.results].sort((a, b) => b.objective - a.objective);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Demonstration case · one end-to-end decision"
        title={`Should Llano Estacado give lot ${lot.lotId} metaphylaxis on arrival?`}
        sub={`Operating date ${fmtDate(SNAPSHOT, "long")}. Peak of the fall run, at the yard with the thinnest crew. Every figure below is computed live; change an assumption anywhere and this page updates.`}
      />

      <Step n={1} icon={<Truck size={18} />} title="The lot on the truck">
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="text-[14px] leading-relaxed text-ink-2">
            <b className="text-ink">{lot.head} {SEX_LABEL[lot.sex].toLowerCase()}</b> averaging <b className="text-ink">{lot.weightLb} lb</b>, arriving {fmtDate(lot.arrivalDate, "long")}.
            Source: <b className="text-ink">{lot.source ? SOURCE_LABEL[lot.source] : "unknown"}</b>; {lot.nSources != null ? `${lot.nSources} origin${lot.nSources === 1 ? "" : "s"}` : "number of origins unknown"}; haul{" "}
            {lot.haulMiles != null ? `${lot.haulMiles} mi` : "unknown"}. Vaccination history <b className="text-ink">{lot.vaccinated}</b>, weaning <b className="text-ink">{lot.weaned}</b>. The order
            buyer {lot.buyerHighRisk ? "flagged it high risk" : "did not flag it"}. Arrival-week weather at Lubbock (NOAA): {lot.tempSwingF ?? "?"} °F max swing, low {lot.minTempF ?? "?"} °F.
            <div className="mt-2 text-[13px]">
              Current SOP at {yard.name}: <i>{yard.sop.summary}</i> → this lot would get <StrategyChip id={pick.statusQuo.strategy.id} label={pick.statusQuo.strategy.short} muted />
            </div>
          </div>
          <img src="./images/cattle-trailer-arrival.jpg" alt="Livestock trailers at night (USDA photo, public domain)" className="h-full max-h-44 w-full rounded-xl object-cover" />
        </div>
      </Step>

      <Step n={2} icon={<Gauge size={18} />} title="How risky is it, and why?">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="num text-[34px] font-semibold">{pct(pick.risk.mean, 1)}</div>
            <div className="text-[12px] text-ink-3">expected 45-day BRD morbidity, no metaphylaxis</div>
          </div>
          <RiskMeter mean={pick.risk.mean} p10={pick.risk.p10} p90={pick.risk.p90} width={220} />
          <div className="text-[13px] text-ink-2">
            80% interval {pct(pick.risk.p10)}–{pct(pick.risk.p90)} · P(high-risk lot) <b>{pct(pick.risk.probHighRisk)}</b>
          </div>
        </div>
        <div className="mt-3 text-[13px] text-ink-2">
          Biggest drivers: {pick.risk.contributions.slice(0, 4).map((c) => `${c.label.toLowerCase()} (×${Math.exp(c.value).toFixed(2)})`).join(", ")}.
        </div>
      </Step>

      <Step n={3} icon={<Stethoscope size={18} />} title="What could we do, and what would each option mean?">
        <table className="w-full text-[13px]">
          <thead className="border-b border-line text-left text-[10.5px] tracking-wide text-ink-3 uppercase">
            <tr>
              <th className="py-1.5">Option</th>
              <th className="py-1.5 text-right">Value / hd</th>
              <th className="py-1.5 text-right">vs SOP</th>
              <th className="py-1.5 text-right">BRD deaths</th>
              <th className="py-1.5 text-right">Regimens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((r) => (
              <tr key={r.strategy.id} className={r === pick.best ? "bg-sage-soft/40 font-medium" : ""}>
                <td className="py-1.5">
                  <StrategyChip id={r.strategy.id} label={r.strategy.short} /> {r === pick.statusQuo && <Badge>SOP</Badge>}
                </td>
                <td className="num py-1.5 text-right">{usd(r.objective / lot.head, { d: 2 })}</td>
                <td className="num py-1.5 text-right">{r === pick.statusQuo ? "—" : usd((r.objective - pick.statusQuo.objective) / lot.head, { d: 2, sign: true })}</td>
                <td className="num py-1.5 text-right">{num(r.deaths, 1)}</td>
                <td className="num py-1.5 text-right">{num(r.metaphylaxisRegimens + r.therapeuticRegimens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[11px] text-ink-3">{valueBasis(params)}</div>
      </Step>

      <Step n={4} icon={<HelpCircle size={18} />} title="Is the information good enough to decide?">
        <div className="mb-3 flex items-center gap-2">
          <ConfidenceBadge level={pick.confidence} />
        </div>
        <ul className="mb-3 list-disc pl-5 text-[13px] text-ink-2">
          {pick.confidenceReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        {scenarios && (
          <>
            <Callout icon={<Phone size={16} />} title={`A phone call to the order buyer about ${pick.infoValue[0].label.toLowerCase()} is worth ≈ ${usd(pick.infoValue[0].value)}`}>
              The answer changes the recommendation with {pct(pick.infoValue[0].flipProb)} probability. Here is what the tool would recommend under each answer:
            </Callout>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {scenarios.map((s) => (
                <div key={s.label} className="rounded-xl border border-line p-3.5">
                  <div className="eyebrow">If {s.label.toLowerCase()}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="num text-[18px] font-semibold">{pct(s.a.risk.mean, 1)}</span>
                    <StrategyChip id={s.a.best.strategy.id} label={s.a.best.strategy.short} />
                  </div>
                  <div className="mt-1 text-[12px] text-ink-3">
                    {usd((s.a.best.objective - s.a.statusQuo.objective) / lot.head, { d: 2, sign: true })}/hd vs SOP · {num(s.a.best.metaphylaxisRegimens + s.a.best.therapeuticRegimens)} regimens
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Step>

      <Step n={5} icon={<Gauge size={18} />} title="Does the yard have room for it?">
        <p className="text-[13px] leading-relaxed text-ink-2">
          {yard.name} has {yard.hospitalPenHead - yard.hospitalBaseline} free hospital-pen spaces and {yard.riderHoursPerDay} receiving-crew rider hours a day for {yp.assessments.length} lots in the
          planning window. The yard planner assigns <StrategyChip id={planned.strategy.id} label={planned.strategy.short} /> to this lot
          {forced ? `, not its stand-alone best option (${pick.best.strategy.short}), because capacity is binding.` : ", the same as its stand-alone best option."} Yard-wide the plan is{" "}
          <b>{usd(yp.plan.value - yp.plan.statusQuoValue, { sign: true, compact: true })}</b> vs the SOP, with {num(yp.plan.deaths, 0)} expected BRD deaths (SOP {num(yp.plan.deathsStatusQuo, 0)}) and{" "}
          {num(yp.plan.amu)} antimicrobial regimens (SOP {num(yp.plan.amuStatusQuo)}).
          {!yp.plan.feasible && " Even the best plan cannot stay within every constraint; the planner reports where and by how much, so management can add temporary hospital pens or rider hours."}
        </p>
        <Link to={`/plan?yard=${lot.yardId}`} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-sky hover:underline">
          Open the yard planner <ArrowRight size={14} />
        </Link>
      </Step>

      <Step n={6} icon={<CheckCircle2 size={18} />} title="Recommendation and consequences">
        <div className="rounded-xl border border-sage/40 bg-sage-soft/50 p-4 text-[14px] leading-relaxed">
          <b>{planned.strategy.label}.</b> Expected value {usd((planned.objective - pick.statusQuo.objective) / lot.head, { d: 2, sign: true })}/head vs the SOP (
          {usd(planned.objective - pick.statusQuo.objective, { sign: true })} for the lot); expected BRD deaths {num(planned.deaths, 1)} vs {num(pick.statusQuo.deaths, 1)}; antimicrobial regimens{" "}
          {num(planned.metaphylaxisRegimens + planned.therapeuticRegimens)} vs {num(pick.statusQuo.metaphylaxisRegimens + pick.statusQuo.therapeuticRegimens)}; peak hospital demand {num(Math.max(...planned.hospitalCurve), 1)} head.
          {pick.confidence !== "confident" && !scenarios && " Confirm the missing record first if it can be had before the cattle are processed."}
        </div>
        {scenarios && scenarios.some((x) => x.a.best.strategy.id !== planned.strategy.id) && (
          <div className="mt-3 text-[13px] leading-relaxed text-ink-2">
            <b>Before processing, call the order buyer about {pick.infoValue[0].label.toLowerCase()}:</b>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {scenarios.map((x) => (
                <li key={x.label}>
                  {x.label} → <b>{x.a.best.strategy.label}</b> ({usd((x.a.best.objective - x.a.statusQuo.objective) / lot.head, { d: 2, sign: true })}/hd vs SOP,{" "}
                  {num(x.a.best.metaphylaxisRegimens + x.a.best.therapeuticRegimens)} regimens);
                </li>
              ))}
              <li>No answer in time → the option above, the best choice on current records.</li>
            </ul>
          </div>
        )}
      </Step>

      <Step n={7} icon={<ClipboardSignature size={18} />} title="Veterinary review and the decision record">
        <p className="text-[13px] text-ink-2">
          {planned.strategy.antimicrobial !== "none"
            ? "Because this option involves antimicrobials, it goes to the veterinarian of record, who approves, modifies or declines it on the lot page. The signed summary is the decision record."
            : "This option uses no metaphylaxis; therapeutic treatments still follow the veterinarian's protocol. The summary documents the decision and its assumptions."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={`/lots/${lot.lotId}`} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-panel px-3 py-2 text-[13px] font-medium hover:bg-panel-2">
            Open lot {lot.lotId} <ArrowRight size={14} />
          </Link>
          <Link to={`/summary?lot=${lot.lotId}`} className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-[13px] font-medium text-[color:var(--bg)] hover:bg-brand-2">
            Generate the decision summary <ArrowRight size={14} />
          </Link>
        </div>
      </Step>
      <div className="text-center text-[11px] text-ink-3">
        Demo lot selected automatically: among inbound {YARD_INDEX.llano.name} lots whose decision depends on a missing record, the one with the most money riding on the decision.
      </div>
    </div>
  );
}

/** Money riding on the decision for the whole lot: the gain over the SOP plus what the missing record is worth. */
function score(a: LotAssessment) {
  return a.best.objective - a.statusQuo.objective + (a.infoValue[0]?.value ?? 0);
}

function Step({ n, icon, title, children }: { n: number; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-[color:var(--bg)]">{icon}</div>
        <div>
          <div className="eyebrow">Step {n}</div>
          <div className="text-[16px] font-semibold">{title}</div>
        </div>
      </div>
      {children}
    </Card>
  );
}
