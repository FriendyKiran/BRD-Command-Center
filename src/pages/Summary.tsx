import { Download, FileJson, Printer, Stethoscope } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Callout, ConfidenceBadge, inputBase, PageHeader, Segmented, Spinner } from "../components/ui";
import { PRIORS, SNAPSHOT } from "../data";
import { assessLot } from "../engine/assess";
import { DEFAULT_PARAMS, PARAM_DEFS } from "../engine/params";
import type { LotAssessment, YardId } from "../engine/types";
import { SEX_LABEL, SOURCE_LABEL, YARD_INDEX, YARDS } from "../engine/yards";
import { fmtDate, num, pct, signed, usd, valueBasis } from "../lib/format";
import { download } from "../lib/lotio";
import { VET_NEED, vetNeed } from "../lib/vet";
import { useEngine, useLots, useYards } from "../state/engine";
import { usePlans } from "../state/plan";
import { useActiveModel } from "../state/models";
import { useApp, type VetReview } from "../state/store";

export default function Summary() {
  const [sp, setSp] = useSearchParams();
  const lotId = sp.get("lot");
  const yardId = (sp.get("yard") ?? "llano") as YardId;
  const [preparer, setPreparer] = useState("");
  const { assessments } = useEngine();
  const scheduled = assessments.filter((a) => a.lot.status === "scheduled");
  return (
    <div>
      <div className="no-print">
        <PageHeader
          eyebrow="Decision record"
          title="Decision summary"
          sub="A one-page record of a decision: inputs, alternatives, recommendation, projected consequences, uncertainty and sign-off. Print or save as PDF, or export Markdown / JSON."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Segmented value={lotId ? "lot" : "yard"} onChange={(v) => setSp(v === "lot" ? { lot: scheduled[0]?.lot.lotId ?? "" } : { yard: yardId })} size="sm" options={[{ value: "lot", label: "Single lot" }, { value: "yard", label: "Yard plan" }]} />
              {lotId ? (
                <select className={inputBase + " w-60"} value={lotId} onChange={(e) => setSp({ lot: e.target.value })}>
                  {assessments.map((a) => (
                    <option key={a.lot.lotId} value={a.lot.lotId}>
                      {a.lot.lotId} · {YARD_INDEX[a.lot.yardId].name}
                    </option>
                  ))}
                </select>
              ) : (
                <select className={inputBase + " w-60"} value={yardId} onChange={(e) => setSp({ yard: e.target.value })}>
                  {YARDS.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              )}
              <input className={inputBase + " w-44"} placeholder="Prepared by" value={preparer} onChange={(e) => setPreparer(e.target.value)} />
            </div>
          }
        />
      </div>
      {lotId ? <LotSummary lotId={lotId} preparer={preparer} /> : <YardSummary yardId={yardId} preparer={preparer} />}
    </div>
  );
}

function Sheet({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap gap-2">{actions}</div>
      <article className="card print-full mx-auto max-w-[900px] space-y-6 p-10 text-[13px] leading-relaxed">{children}</article>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-baseline gap-2 border-b border-line pb-1.5 text-[15px] font-semibold">
        <span className="num text-ink-3">{n}.</span> {title}
      </h2>
      {children}
    </section>
  );
}

function changedAssumptions(params: Record<string, number>) {
  return PARAM_DEFS.filter((d) => Math.abs(params[d.key] - DEFAULT_PARAMS[d.key]) > 1e-9).map((d) => `${d.label}: ${params[d.key]} ${d.unit} (default ${DEFAULT_PARAMS[d.key]})`);
}

function LotSummary({ lotId, preparer }: { lotId: string; preparer: string }) {
  const lots = useLots();
  const params = useApp((s) => s.params);
  const { model } = useActiveModel();
  const review = useApp((s) => s.reviews[lotId]);
  const lot = lots.find((l) => l.lotId === lotId);
  const a = useMemo(() => (lot ? assessLot(model, lot, params, { priors: PRIORS }) : null), [lot, model, params]);
  if (!lot || !a) return <Spinner />;
  const yard = YARD_INDEX[lot.yardId];
  const md = lotMarkdown(a, preparer, review, changedAssumptions(params));
  const sorted = [...a.results].sort((x, y) => y.objective - x.objective);
  return (
    <Sheet
      actions={
        <>
          <Button variant="primary" icon={<Printer size={14} />} onClick={() => window.print()}>
            Print / save PDF
          </Button>
          <Button icon={<Download size={14} />} onClick={() => download(`decision_${lotId}.md`, md, "text/markdown")}>
            Markdown
          </Button>
          <Button icon={<FileJson size={14} />} onClick={() => download(`decision_${lotId}.json`, JSON.stringify({ ...a, results: a.results.map((r) => ({ ...r, draws: undefined })) }, null, 2), "application/json")}>
            JSON
          </Button>
        </>
      }
    >
      <header className="flex items-start justify-between gap-6">
        <div>
          <div className="eyebrow">BRD post-arrival decision summary</div>
          <h1 className="font-display mt-1 text-[26px] font-semibold">
            Lot {lot.lotId} · {yard.name}
          </h1>
          <div className="text-ink-3">
            Operating date {fmtDate(SNAPSHOT, "long")} · prepared by {preparer || "—"} · model {model.version}
          </div>
        </div>
        <div className="text-right">
          <ConfidenceBadge level={a.confidence} />
          <div className="mt-2">
            {review ? (
              <Badge tone={review.status === "approved" ? "good" : "info"}>
                <Stethoscope size={11} /> Vet {review.status}
              </Badge>
            ) : VET_NEED[vetNeed(a.best.strategy, a.statusQuo.strategy)].queue ? (
              <Badge tone="warn">
                <Stethoscope size={11} /> Pending veterinary review
              </Badge>
            ) : (
              <Badge tone="neutral">
                <Stethoscope size={11} /> {vetNeed(a.best.strategy, a.statusQuo.strategy) === "none" ? "No antimicrobials" : "Covered by SOP protocol"}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <Section n={1} title="Decision and information available">
        <p>
          Choose the arrival management option for {lot.head} {SEX_LABEL[lot.sex].toLowerCase()} averaging {lot.weightLb} lb,{" "}
          {lot.status === "scheduled" ? `scheduled to arrive ${fmtDate(lot.arrivalDate, "long")}` : `on feed for ${lot.daysOnFeed} days with ${lot.casesToDate} BRD pulls so far`}.
        </p>
        <table className="mt-2 w-full text-[12.5px]">
          <tbody className="divide-y divide-line">
            {[
              ["Source", lot.source ? SOURCE_LABEL[lot.source] : null],
              ["Sources commingled", lot.nSources],
              ["Haul / shrink", lot.haulMiles != null ? `${lot.haulMiles} mi / ${lot.shrinkPct ?? "?"}%` : null],
              ["Vaccinated pre-arrival", lot.vaccinated === "unknown" ? null : lot.vaccinated],
              ["Weaned ≥ 45 d", lot.weaned === "unknown" ? null : lot.weaned],
              ["Order-buyer risk call", lot.buyerHighRisk ? "high risk" : "not flagged"],
              ["Arrival-week weather (NOAA)", lot.tempSwingF != null ? `${lot.tempSwingF} °F max swing, low ${lot.minTempF} °F, ${lot.precipIn} in precip.` : null],
              ["Pen / bunk space", `${lot.penAreaM2PerHead} m²/hd · ${lot.bunkCmPerHead} cm/hd`],
            ].map(([k, v]) => (
              <tr key={String(k)}>
                <td className="w-56 py-1 text-ink-3">{k}</td>
                <td className="py-1">{v == null ? <Badge tone="warn">not recorded</Badge> : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section n={2} title="Risk assessment">
        <p>
          Expected 45-day BRD morbidity without metaphylaxis: <b className="num">{pct(a.risk.mean, 1)}</b> (80% interval {pct(a.risk.p10)}–{pct(a.risk.p90)}); probability the lot is high-risk (≥ 15 %):{" "}
          <b className="num">{pct(a.risk.probHighRisk)}</b>. Main drivers:{" "}
          {a.risk.contributions
            .slice(0, 4)
            .map((c) => `${c.label} (×${Math.exp(c.value).toFixed(2)} odds)`)
            .join("; ")}
          .
        </p>
        {a.posteriorNote && <p className="mt-1 text-ink-2">{a.posteriorNote}</p>}
      </Section>

      <Section n={3} title="Alternatives compared with the current operating approach">
        <table className="w-full text-[12px]">
          <thead className="border-b border-line text-left text-[10px] tracking-wide text-ink-3 uppercase">
            <tr>
              <th className="py-1.5">Option</th>
              <th className="py-1.5 text-right">Value / hd</th>
              <th className="py-1.5 text-right">vs SOP</th>
              <th className="py-1.5 text-right">Pulled</th>
              <th className="py-1.5 text-right">Deaths</th>
              <th className="py-1.5 text-right">Regimens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((r) => (
              <tr key={r.strategy.id} className={r === a.best ? "font-semibold" : ""}>
                <td className="py-1.5">
                  {r.strategy.label}
                  {r === a.statusQuo ? " (current SOP)" : ""}
                </td>
                <td className="num py-1.5 text-right">{usd(r.objective / lot.head, { d: 2 })}</td>
                <td className="num py-1.5 text-right">{r === a.statusQuo ? "—" : usd((r.objective - a.statusQuo.objective) / lot.head, { d: 2, sign: true })}</td>
                <td className="num py-1.5 text-right">{pct(r.morbidity.mean, 1)}</td>
                <td className="num py-1.5 text-right">{num(r.deaths, 1)}</td>
                <td className="num py-1.5 text-right">{num(r.metaphylaxisRegimens + r.therapeuticRegimens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-ink-3">{valueBasis(params)}</p>
      </Section>

      <Section n={4} title="Recommendation and projected consequences">
        <p>
          <b>{a.best.strategy.label}.</b> Compared with the current SOP ({a.statusQuo.strategy.label.toLowerCase()}), expected value changes by{" "}
          <b className="num">{usd((a.best.objective - a.statusQuo.objective) / lot.head, { d: 2, sign: true })}/head</b> ({usd(a.best.objective - a.statusQuo.objective, { sign: true })} for the lot), expected BRD deaths by{" "}
          <b className="num">{signed(a.best.deaths - a.statusQuo.deaths, 1)}</b>, and antimicrobial regimens by{" "}
          <b className="num">{signed(a.best.metaphylaxisRegimens + a.best.therapeuticRegimens - a.statusQuo.metaphylaxisRegimens - a.statusQuo.therapeuticRegimens)}</b>. Peak hospital-pen demand from this lot:{" "}
          <b className="num">{num(Math.max(...a.best.hospitalCurve), 1)} head</b>.
        </p>
        {a.best.strategy.antimicrobial !== "none" && (
          <Callout tone={vetNeed(a.best.strategy, a.statusQuo.strategy) === "escalate" ? "warn" : "info"} icon={<Stethoscope size={16} />} title="Subject to veterinary review">
            {VET_NEED[vetNeed(a.best.strategy, a.statusQuo.strategy)].title} Product, dose, route and withdrawal must be specified by the veterinarian of record under a valid veterinarian-client-patient relationship.
          </Callout>
        )}
      </Section>

      <Section n={5} title="Uncertainty and limits of the evidence">
        <ul className="list-disc space-y-1 pl-5">
          {a.confidenceReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
          <li>Expected value of perfect information about this lot's risk: {usd(a.evpiLot)} ({usd(a.evpiLot / lot.head, { d: 2 })}/head).</li>
          {a.infoValue
            .filter((v) => v.value >= 1)
            .map((v) => (
              <li key={v.field}>
                Learning {v.label.toLowerCase()} is worth ≈ {usd(v.value)} and would change the option with {pct(v.flipProb)} probability.
              </li>
            ))}
          {a.infoValue.length > 0 && a.infoValue.every((v) => v.value < 1) && <li>The missing records would not change this recommendation (value of information ≈ $0).</li>}
          <li>Model trained on synthetic records calibrated to published studies; validate on yard records before operational use.</li>
        </ul>
        <div className="mt-2 text-[12px] text-ink-3">Assumptions changed from defaults: {changedAssumptions(params).join("; ") || "none"}.</div>
      </Section>

      <Section n={6} title="Sign-off">
        <div className="grid grid-cols-2 gap-8 pt-4">
          <div>
            <div className="h-10 border-b border-ink-3" />
            <div className="mt-1 text-[12px] text-ink-3">Yard manager · date</div>
          </div>
          <div>
            <div className="flex h-10 items-end border-b border-ink-3 pb-1 text-[12px]">{review ? `${review.reviewer} (${review.status}, ${new Date(review.date).toLocaleDateString()})` : ""}</div>
            <div className="mt-1 text-[12px] text-ink-3">Veterinarian of record · date</div>
          </div>
        </div>
      </Section>
    </Sheet>
  );
}

function YardSummary({ yardId, preparer }: { yardId: YardId; preparer: string }) {
  const plans = usePlans();
  const yards = useYards();
  const params = useApp((s) => s.params);
  const reviews = useApp((s) => s.reviews);
  const yp = plans?.[yardId];
  const yard = yards.find((y) => y.id === yardId)!;
  if (!yp) return <Spinner />;
  const p = yp.plan;
  // Lots whose planned option changes antimicrobial use relative to the vet-approved SOP.
  const needVet = yp.assessments.filter((a) => {
    const r = a.results.find((x) => x.strategy.id === p.choice[a.lot.lotId]);
    return r && a.lot.status === "scheduled" && VET_NEED[vetNeed(r.strategy, a.statusQuo.strategy)].queue;
  });
  const counts: Record<string, number> = {};
  yp.assessments.forEach((a) => {
    const lbl = a.results.find((x) => x.strategy.id === p.choice[a.lot.lotId])!.strategy.label;
    counts[lbl] = (counts[lbl] ?? 0) + 1;
  });
  const md = [
    `# BRD yard plan: ${yard.name}`,
    `Operating date ${SNAPSHOT}. Prepared by ${preparer || "-"}.`,
    ``,
    `## Plan vs current SOP`,
    `- Expected value change: ${usd(p.value - p.statusQuoValue, { sign: true })}`,
    `- Expected BRD deaths: ${num(p.deaths, 1)} (SOP ${num(p.deathsStatusQuo, 1)})`,
    `- Antimicrobial regimens: ${num(p.amu)} (SOP ${num(p.amuStatusQuo)})`,
    `- Hospital peak: ${num(Math.max(...p.hospital))} of ${yard.hospitalPenHead - yard.hospitalBaseline} free`,
    `- Feasible: ${p.feasible ? "yes" : "no: " + p.violations.join(" ")}`,
    ``,
    `## Option mix`,
    ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v} lots`),
    ``,
    `## Lots requiring veterinary review (${needVet.length})`,
    ...needVet.map((a) => `- ${a.lot.lotId}: ${a.results.find((x) => x.strategy.id === p.choice[a.lot.lotId])!.strategy.label} (${reviews[a.lot.lotId]?.status ?? "pending"})`),
    ``,
    `Assumptions changed from defaults: ${changedAssumptions(params).join("; ") || "none"}`,
    `Medication-related recommendations are subject to veterinary review.`,
  ].join("\n");
  return (
    <Sheet
      actions={
        <>
          <Button variant="primary" icon={<Printer size={14} />} onClick={() => window.print()}>
            Print / save PDF
          </Button>
          <Button icon={<Download size={14} />} onClick={() => download(`yard_plan_${yardId}.md`, md, "text/markdown")}>
            Markdown
          </Button>
        </>
      }
    >
      <header>
        <div className="eyebrow">BRD yard plan summary</div>
        <h1 className="font-display mt-1 text-[26px] font-semibold">{yard.name}</h1>
        <div className="text-ink-3">
          {yard.town}, {yard.state} · operating date {fmtDate(SNAPSHOT, "long")} · prepared by {preparer || "—"} · planning window {p.calendar.length} days
        </div>
      </header>
      <Section n={1} title="Decision">
        <p>
          Assign one of seven BRD management options to each of {yp.assessments.length} lots ({num(yp.assessments.reduce((s, a) => s + a.lot.head, 0))} head) that are inbound or in their first 45 days on
          feed, within the yard's hospital-pen ({yard.hospitalPenHead - yard.hospitalBaseline} free head-spaces), rider ({yard.riderHoursPerDay} h/day) and chute ({yard.chuteHoursPerDay} h/day) capacity.
          Baseline: current SOP ({yard.sop.summary})
        </p>
      </Section>
      <Section n={2} title="Projected consequences vs current SOP">
        <table className="w-full text-[12.5px]">
          <tbody className="divide-y divide-line">
            <tr><td className="py-1 text-ink-3">Expected value change</td><td className="num py-1 font-semibold">{usd(p.value - p.statusQuoValue, { sign: true })}</td></tr>
            <tr><td className="py-1 text-ink-3">Expected BRD deaths</td><td className="num py-1">{num(p.deaths, 1)} vs {num(p.deathsStatusQuo, 1)}</td></tr>
            <tr><td className="py-1 text-ink-3">True BRD cases</td><td className="num py-1">{num(p.cases)} vs {num(p.casesStatusQuo)}</td></tr>
            <tr><td className="py-1 text-ink-3">Antimicrobial regimens</td><td className="num py-1">{num(p.amu)} vs {num(p.amuStatusQuo)}</td></tr>
            <tr><td className="py-1 text-ink-3">Hospital peak</td><td className="num py-1">{num(Math.max(...p.hospital))} (P90 {num(Math.max(...p.hospitalP90))}) vs SOP {num(Math.max(...p.hospitalStatusQuo))}</td></tr>
          </tbody>
        </table>
        {!p.feasible && (
          <div className="mt-2">
            <Callout tone="bad" title="Constraints cannot all be met">{p.violations.join(" ")}</Callout>
          </div>
        )}
      </Section>
      <Section n={3} title="Option mix">
        <ul className="list-disc pl-5">
          {Object.entries(counts).map(([k, v]) => (
            <li key={k}>
              {k}: <b>{v}</b> lots
            </li>
          ))}
        </ul>
      </Section>
      <Section n={4} title={`Lots requiring veterinary review (${needVet.length})`}>
        <p className="mb-2 text-[12px] text-ink-3">Lots whose plan changes antimicrobial use relative to the yard's vet-approved SOP. Lots that keep the SOP's antimicrobial plan are covered by the standing protocol.</p>
        <div className="columns-2 text-[12px]">
          {needVet.map((a) => {
            const r = a.results.find((x) => x.strategy.id === p.choice[a.lot.lotId])!;
            return (
              <div key={a.lot.lotId}>
                <span className="num font-semibold">{a.lot.lotId}</span>: {r.strategy.short} <span className="text-ink-3">· {VET_NEED[vetNeed(r.strategy, a.statusQuo.strategy)].label} ({reviews[a.lot.lotId]?.status ?? "pending"})</span>
              </div>
            );
          })}
        </div>
      </Section>
      <Section n={5} title="Assumptions and limitations">
        <p>Assumptions changed from defaults: {changedAssumptions(params).join("; ") || "none"}. Records are synthetic and calibrated to published sources; weather is observed NOAA data. Medication-related recommendations are subject to veterinary review.</p>
      </Section>
      <Section n={6} title="Sign-off">
        <div className="grid grid-cols-2 gap-8 pt-4">
          <div>
            <div className="h-10 border-b border-ink-3" />
            <div className="mt-1 text-[12px] text-ink-3">Yard manager · date</div>
          </div>
          <div>
            <div className="h-10 border-b border-ink-3" />
            <div className="mt-1 text-[12px] text-ink-3">Veterinarian of record · date</div>
          </div>
        </div>
      </Section>
    </Sheet>
  );
}

function lotMarkdown(a: LotAssessment, preparer: string, review: VetReview | undefined, changed: string[]) {
  const l = a.lot;
  const rows = [...a.results]
    .sort((x, y) => y.objective - x.objective)
    .map((r) => `| ${r.strategy.label}${r === a.statusQuo ? " (SOP)" : ""} | ${usd(r.objective / l.head, { d: 2 })} | ${pct(r.morbidity.mean, 1)} | ${num(r.deaths, 1)} | ${num(r.metaphylaxisRegimens + r.therapeuticRegimens)} |`);
  return [
    `# BRD decision summary: lot ${l.lotId}`,
    `${YARD_INDEX[l.yardId].name} · operating date ${SNAPSHOT} · prepared by ${preparer || "-"}`,
    ``,
    `**Recommendation:** ${a.best.strategy.label} (confidence: ${a.confidence})`,
    `**Veterinary review:** ${review ? `${review.status} by ${review.reviewer}` : "pending"}`,
    ``,
    `## Inputs`,
    `${l.head} head, ${l.weightLb} lb, ${l.sex}; source ${l.source ?? "unknown"}; sources ${l.nSources ?? "unknown"}; haul ${l.haulMiles ?? "unknown"} mi; vaccinated ${l.vaccinated}; weaned ${l.weaned}; buyer flag ${l.buyerHighRisk}.`,
    ``,
    `## Risk`,
    `Expected 45-day BRD morbidity ${pct(a.risk.mean, 1)} (80% interval ${pct(a.risk.p10)}–${pct(a.risk.p90)}), P(high-risk) ${pct(a.risk.probHighRisk)}.`,
    ``,
    `## Alternatives`,
    `| Option | Value/hd | Pulled | Deaths | Regimens |`,
    `|---|---|---|---|---|`,
    ...rows,
    ``,
    `## Uncertainty`,
    ...a.confidenceReasons.map((r) => `- ${r}`),
    `- EVPI ${usd(a.evpiLot)}`,
    ...a.infoValue.map((v) => `- ${v.label}: worth ${usd(v.value)}, flips decision with ${pct(v.flipProb)} probability`),
    ``,
    `Assumptions changed: ${changed.join("; ") || "none"}`,
    ``,
    `Medication-related recommendations are subject to veterinary review.`,
  ].join("\n");
}
