import clsx from "clsx";
import { ArrowLeft, CloudSnow, FileText, Info, Lock, LockOpen, RotateCcw, Save, Stethoscope, Thermometer, Wind } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Badge, Button, Callout, Card, CardHeader, ConfidenceBadge, Field, inputCls, RiskPill, Segmented, Spinner, StrategyChip, TooltipBox } from "../components/ui";
import { PRIORS, WEATHER } from "../data";
import { assessLot, DECISION_DRAWS } from "../engine/assess";
import { betaMeanConc, mulberry32 } from "../engine/rng";
import type { LotArrival, LotAssessment, SourceType, StrategyResult, TriState } from "../engine/types";
import { dayIndex } from "../engine/weather";
import { SEX_LABEL, SOURCE_LABEL, YARD_INDEX } from "../engine/yards";
import { fmtDate, num, pct, riskColor, STRATEGY_COLOR, usd, valueBasis } from "../lib/format";
import { VET_NEED, vetNeed } from "../lib/vet";
import { useLots } from "../state/engine";
import { ensureModel, useActiveModel } from "../state/models";
import { consensusInWorker } from "../state/engine";
import { ModelName } from "../components/modelviz";
import { MODEL_SPECS } from "../engine/zoo";
import type { ConsensusRow } from "../workers/engine.worker";
import { useApp } from "../state/store";

export default function LotDetail() {
  const { id } = useParams();
  const lots = useLots();
  const base = lots.find((l) => l.lotId === id);
  const params = useApp((s) => s.params);
  const { model } = useActiveModel();
  const patchLot = useApp((s) => s.patchLot);
  const clearPatch = useApp((s) => s.clearPatch);
  const patched = useApp((s) => (id ? !!s.lotPatches[id] : false));
  const [whatIf, setWhatIf] = useState<Partial<LotArrival>>({});
  const [a, setA] = useState<LotAssessment | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const lot = useMemo(() => (base ? { ...base, ...whatIf } : null), [base, whatIf]);
  useEffect(() => setWhatIf({}), [id]);
  useEffect(() => {
    if (!lot) return;
    setBusy(true);
    const t = setTimeout(() => {
      setA(assessLot(model, lot, params, { priors: PRIORS }));
      setBusy(false);
    }, 60);
    return () => clearTimeout(t);
  }, [lot, params, model]);

  if (!base) return <div className="p-10 text-ink-3">Lot not found. <Link to="/lots" className="text-sky underline">Back to lots</Link></div>;
  if (!a || !lot)
    return (
      <div className="flex items-center gap-2 p-10 text-ink-3">
        <Spinner /> Simulating options for {id}…
      </div>
    );

  const yard = YARD_INDEX[lot.yardId];
  const dirty = Object.keys(whatIf).length > 0;
  const deltaHead = (a.best.objective - a.statusQuo.objective) / lot.head;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button onClick={() => nav(-1)} className="mb-2 inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
            <ArrowLeft size={14} /> Back
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="num font-display text-[30px] font-semibold tracking-tight">{lot.lotId}</h1>
            <Badge tone={lot.status === "scheduled" ? "info" : "neutral"}>{lot.status === "scheduled" ? `Arrives ${fmtDate(lot.arrivalDate)}` : `Day ${lot.daysOnFeed} on feed`}</Badge>
            <ConfidenceBadge level={a.confidence} />
            {busy && <Spinner />}
          </div>
          <div className="mt-1 text-[13px] text-ink-2">
            {yard.name}, {yard.town} {yard.state} · {lot.head} head · {SEX_LABEL[lot.sex]} · {lot.weightLb} lb · {lot.source ? SOURCE_LABEL[lot.source] : "source unknown"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {dirty && (
            <>
              <Button icon={<RotateCcw size={14} />} onClick={() => setWhatIf({})}>
                Discard what-if
              </Button>
              <Button
                icon={<Save size={14} />}
                variant="primary"
                onClick={() => {
                  patchLot(lot.lotId, whatIf);
                  setWhatIf({});
                }}
              >
                Save as corrected record
              </Button>
            </>
          )}
          {patched && !dirty && (
            <Button icon={<RotateCcw size={14} />} onClick={() => clearPatch(lot.lotId)}>
              Revert to original record
            </Button>
          )}
          <Button icon={<FileText size={14} />} onClick={() => nav(`/summary?lot=${lot.lotId}`)}>
            Decision summary
          </Button>
        </div>
      </div>

      {dirty && (
        <Callout tone="info" title="What-if mode">
          You are exploring changes to this lot's record. Results update live; nothing is saved until you choose "Save as corrected record".
        </Callout>
      )}

      {/* Recommendation banner */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: STRATEGY_COLOR[a.best.strategy.id] }} />
        <div className="grid gap-6 pl-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="eyebrow mb-1.5">Highest expected value option</div>
            <div className="text-[19px] font-semibold">{a.best.strategy.label}</div>
            <div className="mt-1 text-[13px] text-ink-3">
              Current SOP at {yard.name}: <span className="font-medium text-ink-2">{a.statusQuo.strategy.label}</span>
            </div>
            {vetNeed(a.best.strategy, a.statusQuo.strategy) !== "none" && (
              <div className={`mt-2 flex items-start gap-1.5 text-[12px] ${vetNeed(a.best.strategy, a.statusQuo.strategy) === "escalate" ? "text-rust" : "text-ink-2"}`}>
                <Stethoscope size={13} className="mt-0.5 shrink-0" /> {VET_NEED[vetNeed(a.best.strategy, a.statusQuo.strategy)].title}
              </div>
            )}
          </div>
          <Kpi label="Δ value vs current SOP" value={Math.abs(deltaHead) < 0.005 ? "Same option" : `${usd(deltaHead, { d: 2, sign: true })}/hd`} sub={`${usd(a.best.objective - a.statusQuo.objective, { sign: true })} for the lot`} good={deltaHead >= 0} />
          <Kpi label="Expected BRD deaths" value={num(a.best.deaths, 1)} sub={`SOP: ${num(a.statusQuo.deaths, 1)}`} good={a.best.deaths <= a.statusQuo.deaths} />
          <Kpi label="Antimicrobial regimens / 100 hd" value={num(a.best.amuRegimensPer100.mean, 0)} sub={`SOP: ${num(a.statusQuo.amuRegimensPer100.mean, 0)}`} good={a.best.amuRegimensPer100.mean <= a.statusQuo.amuRegimensPer100.mean} />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
        <RiskCard a={a} />
        <WhyCard a={a} />
        <WhatIfCard lot={lot} base={base} onChange={(p) => setWhatIf((w) => ({ ...w, ...p }))} />
      </div>

      {a.posteriorNote && (
        <Callout tone={a.risk.mean > a.arrivalRiskMean ? "warn" : "good"} title="Updated with pulls observed so far">
          {a.posteriorNote}
        </Callout>
      )}

      <OptionsTable a={a} />

      <ConsensusCard lot={lot} a={a} />

      <div className="grid gap-6 xl:grid-cols-2">
        <TradeoffChart a={a} />
        <HospitalChart a={a} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <InfoCard a={a} />
        <div className="space-y-6">
          <WeatherCard lot={lot} />
          <VetReviewCard a={a} />
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, good }: { label: string; value: string; sub: string; good: boolean }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className={clsx("num text-[22px] font-semibold", good ? "text-sage" : "text-rust")}>{value}</div>
      <div className="num text-[12px] text-ink-3">{sub}</div>
    </div>
  );
}

function RiskCard({ a }: { a: LotAssessment }) {
  const hist = useMemo(() => {
    const rng = mulberry32(42);
    const bins = Array.from({ length: 36 }, (_, i) => ({ x: i * 0.025 + 0.0125, n: 0 }));
    for (let i = 0; i < 4000; i++) {
      const p = betaMeanConc(rng, a.risk.mean, a.risk.concentration);
      if (p < 0.9) bins[Math.floor(p / 0.025)].n++;
    }
    return bins;
  }, [a.risk.mean, a.risk.concentration]);
  return (
    <Card>
      <CardHeader eyebrow="Predicted BRD risk" title="45-day morbidity without metaphylaxis" right={<RiskPill p={a.risk.mean} />} />
      <div className="flex items-end gap-4">
        <div className="num text-[44px] leading-none font-semibold" style={{ color: riskColor(a.risk.mean) }}>
          {pct(a.risk.mean, 1)}
        </div>
        <div className="pb-1 text-[12px] leading-relaxed text-ink-3">
          80% interval <span className="num font-semibold text-ink-2">{pct(a.risk.p10)}–{pct(a.risk.p90)}</span>
          <br />
          P(lot is high-risk, ≥15%) <span className="num font-semibold text-ink-2">{pct(a.risk.probHighRisk)}</span>
        </div>
      </div>
      <div className="mt-3 h-[120px]">
        <ResponsiveContainer>
          <BarChart data={hist} margin={{ left: 0, right: 0, top: 4, bottom: 0 }} barCategoryGap={1}>
            <XAxis dataKey="x" tickFormatter={(v) => `${Math.round(v * 100)}%`} interval={4} tickLine={false} axisLine={false} />
            <ReferenceLine x={0.15} stroke="var(--ink-3)" strokeDasharray="3 3" />
            <Bar dataKey="n" radius={[2, 2, 0, 0]}>
              {hist.map((h) => (
                <Cell key={h.x} fill={riskColor(h.x)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
        Distribution combines model uncertainty (30 bootstrap refits) and lot-to-lot variation the records cannot explain (beta-binomial, κ = {num(a.risk.concentration, 0)}).
        Detected-case scale: share of head a standard pen-riding crew would pull.
      </p>
    </Card>
  );
}

function WhyCard({ a }: { a: LotAssessment }) {
  const data = a.risk.contributions.filter((c) => Math.abs(c.value) > 0.01).slice(0, 9);
  return (
    <Card>
      <CardHeader eyebrow="Why this risk" title="What drives the prediction" sub="Change in odds of BRD vs. the average lot in the training records." />
      <div className="space-y-1.5">
        {data.map((c) => {
          const odds = Math.exp(c.value);
          const w = Math.min(100, Math.abs(c.value) * 55);
          return (
            <div key={c.feature} className="grid grid-cols-[130px_1fr_58px] items-center gap-2 text-[12px]">
              <div className="truncate text-ink-2">{c.label}</div>
              <div className="relative h-5">
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-line-strong" />
                <div
                  className="absolute top-1 h-3 rounded-sm"
                  style={{
                    left: c.value >= 0 ? "50%" : `${50 - w / 2}%`,
                    width: `${w / 2}%`,
                    background: c.value >= 0 ? "var(--rust)" : "var(--sage)",
                  }}
                />
              </div>
              <div className="num text-right font-semibold" style={{ color: c.value >= 0 ? "var(--rust)" : "var(--sage)" }}>
                ×{odds.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
      {a.risk.missing.length > 0 && (
        <div className="mt-3 text-[11px] text-ink-3">
          Missing records ({a.risk.missing.join(", ")}) are modelled as "unknown", with their own learned effect, not silently imputed.
        </div>
      )}
    </Card>
  );
}

function WhatIfCard({ lot, base, onChange }: { lot: LotArrival; base: LotArrival; onChange: (p: Partial<LotArrival>) => void }) {
  const changed = (k: keyof LotArrival) => lot[k] !== base[k];
  const tri = (k: "vaccinated" | "weaned", label: string) => (
    <Field label={label + (changed(k) ? " •" : "")}>
      <Segmented value={lot[k]} onChange={(v) => onChange({ [k]: v as TriState })} size="sm" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "Unknown" }]} />
    </Field>
  );
  return (
    <Card>
      <CardHeader eyebrow="What if?" title="Arrival record" sub="Edit any field to see how the risk and the recommendation respond." />
      <div className="grid grid-cols-2 gap-3">
        <Field label={"Weight (lb)" + (changed("weightLb") ? " •" : "")}>
          <input type="number" className={inputCls} value={lot.weightLb} onChange={(e) => onChange({ weightLb: Number(e.target.value) })} />
        </Field>
        <Field label={"Head" + (changed("head") ? " •" : "")}>
          <input type="number" className={inputCls} value={lot.head} onChange={(e) => onChange({ head: Math.max(1, Number(e.target.value)) })} />
        </Field>
        <Field label={"Source" + (changed("source") ? " •" : "")}>
          <select className={inputCls} value={lot.source ?? ""} onChange={(e) => onChange({ source: (e.target.value || null) as SourceType | null })}>
            <option value="">Unknown</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label={"Sources commingled" + (changed("nSources") ? " •" : "")}>
          <input className={inputCls} value={lot.nSources ?? ""} placeholder="unknown" onChange={(e) => onChange({ nSources: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label={"Haul (mi)" + (changed("haulMiles") ? " •" : "")}>
          <input className={inputCls} value={lot.haulMiles ?? ""} placeholder="unknown" onChange={(e) => onChange({ haulMiles: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label={"Pen m²/head" + (changed("penAreaM2PerHead") ? " •" : "")}>
          <input type="number" className={inputCls} value={lot.penAreaM2PerHead} onChange={(e) => onChange({ penAreaM2PerHead: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="mt-3 space-y-3">
        {tri("vaccinated", "Vaccinated pre-arrival")}
        {tri("weaned", "Weaned ≥ 45 d")}
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={lot.buyerHighRisk} onChange={(e) => onChange({ buyerHighRisk: e.target.checked })} /> Order buyer flagged high risk
        </label>
      </div>
    </Card>
  );
}

function OptionsTable({ a }: { a: LotAssessment }) {
  const locks = useApp((s) => s.locks);
  const setLock = useApp((s) => s.setLock);
  const params = useApp((s) => s.params);
  const sorted = [...a.results].sort((x, y) => y.objective - x.objective);
  const peak = (r: StrategyResult) => Math.max(...r.hospitalCurve);
  return (
    <Card pad={false}>
      <div className="p-5 pb-0">
        <CardHeader
          eyebrow="Management options"
          title="Consequences of each option for this lot"
          sub={`Monte Carlo over risk, efficacy and disease-course uncertainty (${DECISION_DRAWS} paired simulations; every option sees the same simulated futures). Value includes feeding-period net return, disease losses, drugs and labor. ${valueBasis(params)}`}
        />
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[1080px] text-[12.5px]">
          <thead className="border-y border-line bg-panel-2/60 text-[10.5px] tracking-wide text-ink-3 uppercase">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Option</th>
              <th className="px-3 py-2 text-right font-medium">Value / head (P10–P90)</th>
              <th className="px-3 py-2 text-right font-medium">Δ vs SOP</th>
              <th className="px-3 py-2 text-right font-medium">Pulled for BRD</th>
              <th className="px-3 py-2 text-right font-medium">True BRD incidence</th>
              <th className="px-3 py-2 text-right font-medium">BRD deaths</th>
              <th className="px-3 py-2 text-right font-medium">Regimens /100 hd</th>
              <th className="px-3 py-2 text-right font-medium">Highest-priority class share</th>
              <th className="px-3 py-2 text-right font-medium">Hospital peak</th>
              <th className="px-3 py-2 font-medium">Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((r) => {
              const isBest = r === a.best;
              const isSq = r === a.statusQuo;
              const d = (r.objective - a.statusQuo.objective) / a.lot.head;
              const locked = locks[a.lot.lotId] === r.strategy.id;
              return (
                <tr key={r.strategy.id} className={clsx(isBest && "bg-sage-soft/40")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StrategyChip id={r.strategy.id} label={r.strategy.short} />
                      {isBest && <Badge tone="good">best EV</Badge>}
                      {isSq && <Badge>current SOP</Badge>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-3">{r.strategy.label}</div>
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    <div className="font-semibold">{usd(r.objective / a.lot.head, { d: 2 })}</div>
                    <div className="text-[11px] text-ink-3">
                      {usd(r.netReturnPerHead.p10, { d: 0 })} to {usd(r.netReturnPerHead.p90, { d: 0 })}
                    </div>
                  </td>
                  <td className="num px-3 py-2.5 text-right font-semibold" style={{ color: d > 0.005 ? "var(--sage)" : d < -0.005 ? "var(--rust)" : "var(--ink-3)" }}>
                    {Math.abs(d) < 0.005 ? "—" : usd(d, { d: 2, sign: true })}
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    {pct(r.morbidity.mean, 1)}
                    <div className="text-[11px] text-ink-3">{num(r.morbidity.mean * a.lot.head, 0)} hd</div>
                  </td>
                  <td className="num px-3 py-2.5 text-right">{pct(r.trueIncidence.mean, 1)}</td>
                  <td className="num px-3 py-2.5 text-right">{num(r.deaths, 1)}</td>
                  <td className="num px-3 py-2.5 text-right">
                    {num(r.amuRegimensPer100.mean, 0)}
                    <div className="text-[11px] text-ink-3">
                      {num(r.metaphylaxisRegimens, 0)} meta + {num(r.therapeuticRegimens, 0)} tx
                    </div>
                  </td>
                  <td className="num px-3 py-2.5 text-right">{pct(r.criticallyImportantShare)}</td>
                  <td className="num px-3 py-2.5 text-right">{num(peak(r), 1)} hd</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => setLock(a.lot.lotId, locked ? null : r.strategy.id)}
                      className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium", locked ? "bg-brand text-[color:var(--bg)]" : "text-ink-3 hover:bg-panel-2")}
                      title="Lock this option in the yard plan"
                    >
                      {locked ? <Lock size={12} /> : <LockOpen size={12} />} {locked ? "Locked" : "Lock"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 text-[11px] text-ink-3">
        "True incidence" includes cases the crew would miss; "pulled" is what pen riders detect and treat. Highest-priority class share assumes premium metaphylaxis uses a
        highest-priority critically important class (e.g., macrolide) and that {pct(useApp.getState().params.ciaShareTherapeutic)} of individual treatments do.
      </div>
    </Card>
  );
}

function TradeoffChart({ a }: { a: LotAssessment }) {
  const data = a.results.map((r) => ({
    id: r.strategy.id,
    name: r.strategy.short,
    x: r.amuRegimensPer100.mean,
    y: r.objective / a.lot.head,
    z: r.deaths,
    p10: r.netReturnPerHead.p10,
    p90: r.netReturnPerHead.p90,
  }));
  return (
    <Card>
      <CardHeader eyebrow="Trade-offs" title="Value vs antimicrobial use" sub="Up = more profitable, left = fewer antimicrobial regimens. Bubble size = expected BRD deaths." />
      <div className="h-[280px]">
        <ResponsiveContainer>
          <ScatterChart margin={{ left: 0, right: 90, top: 10, bottom: 10 }}>
            <CartesianGrid />
            <XAxis type="number" dataKey="x" name="Regimens/100 hd" domain={[0, (max: number) => Math.ceil((max * 1.08) / 10) * 10]} tickLine={false} axisLine={false} label={{ value: "regimens per 100 head", position: "insideBottom", offset: -5, fill: "var(--ink-3)", fontSize: 11 }} />
            <YAxis type="number" dataKey="y" name="Value/head" tickFormatter={(v) => usd(v)} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <ZAxis type="number" dataKey="z" range={[60, 600]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <TooltipBox>
                    <div className="font-semibold">{d.name}</div>
                    <div className="num">Value {usd(d.y, { d: 2 })}/hd</div>
                    <div className="num text-ink-3">{num(d.x, 0)} regimens/100 hd · {num(d.z, 1)} deaths</div>
                  </TooltipBox>
                );
              }}
            />
            <Scatter data={data} shape={(p: { cx?: number; cy?: number; size?: number; payload?: (typeof data)[number] }) => (
              <g>
                <circle cx={p.cx} cy={p.cy} r={Math.sqrt(p.size ?? 60) / 1.6} fill={STRATEGY_COLOR[p.payload!.id]} fillOpacity={0.75} stroke="var(--panel)" strokeWidth={1.5} />
                <text x={(p.cx ?? 0) + 10} y={(p.cy ?? 0) + 4} fontSize={11} fill="var(--ink-2)">
                  {p.payload!.name}
                </text>
              </g>
            )} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function HospitalChart({ a }: { a: LotAssessment }) {
  const show = [a.best, a.statusQuo, ...a.results.filter((r) => r.strategy.id === "none-std")].filter((r, i, arr) => arr.indexOf(r) === i);
  const data = Array.from({ length: 46 }, (_, d) => Object.fromEntries([["d", d], ...show.map((r) => [r.strategy.id, r.hospitalCurve[d]])]));
  return (
    <Card>
      <CardHeader eyebrow="Workload" title="Head in hospital pens by day on feed" sub="Expected census from this lot's treatments; metaphylaxis delays and flattens the peak." />
      <div className="h-[280px]">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: -15, right: 10, top: 10 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="d" tickLine={false} axisLine={false} interval={4} label={{ value: "days on feed", position: "insideBottomRight", offset: -2, fill: "var(--ink-3)", fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip content={({ active, payload, label }) => (active && payload?.length ? <TooltipBox><div className="font-semibold">Day {label}</div>{payload.map((p) => <div key={String(p.dataKey)} className="num">{show.find((r) => r.strategy.id === p.dataKey)?.strategy.short}: {num(Number(p.value), 1)} hd</div>)}</TooltipBox> : null)} />
            {show.map((r) => (
              <Line key={r.strategy.id} dataKey={r.strategy.id} stroke={STRATEGY_COLOR[r.strategy.id]} strokeWidth={r === a.best ? 2.6 : 1.6} strokeDasharray={r === a.statusQuo && r !== a.best ? "5 4" : undefined} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-ink-3">
        {show.map((r) => (
          <span key={r.strategy.id} className="flex items-center gap-1">
            <span className="h-0.5 w-4" style={{ background: STRATEGY_COLOR[r.strategy.id] }} />
            {r.strategy.short} {r === a.best ? "(best)" : r === a.statusQuo ? "(SOP)" : ""}
          </span>
        ))}
      </div>
    </Card>
  );
}

function InfoCard({ a }: { a: LotAssessment }) {
  const params = useApp((s) => s.params);
  return (
    <Card>
      <CardHeader eyebrow="Can the data support this decision?" title="Confidence & value of information" right={<ConfidenceBadge level={a.confidence} />} />
      <ul className="mb-4 space-y-1.5 text-[13px] text-ink-2">
        {a.confidenceReasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            <Info size={14} className="mt-0.5 shrink-0 text-ink-3" /> {r}
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel-2/50 p-3.5">
          <div className="eyebrow">Expected value of perfect information</div>
          <div className="num mt-1 text-[22px] font-semibold">{usd(a.evpiLot)}</div>
          <div className="text-[12px] text-ink-3">{usd(a.evpiLot / a.lot.head, { d: 2 })}/head: the most any extra information about this lot's risk could be worth.</div>
        </div>
        {a.infoValue.length === 0 ? (
          <div className="rounded-xl border border-line bg-panel-2/50 p-3.5 text-[12px] text-ink-3">All decision-relevant arrival records are present.</div>
        ) : (
          a.infoValue.map((v) => (
            <div key={v.field} className="rounded-xl border border-line p-3.5">
              <div className="eyebrow">Find out: {v.label}</div>
              <div className="num mt-1 text-[22px] font-semibold">{usd(v.value)}</div>
              <div className="text-[12px] text-ink-3">
                {v.flipProb < params.confFlipRelevant ? (
                  <>
                    Unlikely to change the recommendation (<span className="num font-semibold text-ink-2">{pct(v.flipProb)}</span> probability).
                  </>
                ) : v.value / a.lot.head < params.confValueRelevant ? (
                  <>
                    Could tip a near-tie between options (<span className="num font-semibold text-ink-2">{pct(v.flipProb)}</span> probability), but the difference is worth only{" "}
                    {usd(v.value / a.lot.head, { d: 2 })}/head, so it is not worth chasing.
                  </>
                ) : (
                  <>
                    Would change the recommendation with <span className="num font-semibold text-ink-2">{pct(v.flipProb)}</span> probability. Worth a phone call to the order buyer if
                    the value exceeds the effort.
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function WeatherCard({ lot }: { lot: LotArrival }) {
  const s = WEATHER[lot.yardId];
  const data = useMemo(() => {
    if (!s) return [];
    const i0 = dayIndex(s.start, lot.arrivalDate);
    return Array.from({ length: 15 }, (_, k) => {
      const i = i0 - 4 + k;
      return { d: k - 4, hi: s.tmax[i] ?? null, lo: s.tmin[i] ?? null };
    }).filter((x) => x.hi != null);
  }, [s, lot.arrivalDate]);
  return (
    <Card>
      <CardHeader eyebrow="Arrival weather (NOAA GHCN-Daily)" title={YARD_INDEX[lot.yardId].weatherStation} />
      <div className="grid grid-cols-3 gap-3 text-[12px]">
        <div>
          <Wind size={14} className="text-ink-3" />
          <div className="num text-[18px] font-semibold">{lot.tempSwingF != null ? `${lot.tempSwingF}°F` : "n/a"}</div>
          <div className="text-ink-3">largest day-to-day swing</div>
        </div>
        <div>
          <Thermometer size={14} className="text-ink-3" />
          <div className="num text-[18px] font-semibold">{lot.minTempF != null ? `${lot.minTempF}°F` : "n/a"}</div>
          <div className="text-ink-3">coldest low</div>
        </div>
        <div>
          <CloudSnow size={14} className="text-ink-3" />
          <div className="num text-[18px] font-semibold">{lot.precipIn != null ? `${lot.precipIn}"` : "n/a"}</div>
          <div className="text-ink-3">precipitation</div>
        </div>
      </div>
      {data.length > 0 && (
        <div className="mt-3 h-[110px]">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ left: -25, right: 5, top: 5 }}>
              <XAxis dataKey="d" tickFormatter={(v) => (v === 0 ? "arrival" : `${v > 0 ? "+" : ""}${v}`)} tickLine={false} axisLine={false} interval={2} />
              <YAxis tickLine={false} axisLine={false} />
              <ReferenceLine x={0} stroke="var(--ink-3)" strokeDasharray="3 3" />
              <Line dataKey="hi" stroke="var(--rust)" dot={false} strokeWidth={2} />
              <Line dataKey="lo" stroke="var(--sky)" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="text-[11px] text-ink-3">Observed station data, arrival week. For scheduled arrivals these observations stand in for a forecast.</div>
    </Card>
  );
}

function VetReviewCard({ a }: { a: LotAssessment }) {
  const review = useApp((s) => s.reviews[a.lot.lotId]);
  const setReview = useApp((s) => s.setReview);
  const [reviewer, setReviewer] = useState(review?.reviewer ?? "");
  const [note, setNote] = useState(review?.note ?? "");
  const [strategyId, setStrategyId] = useState(review?.strategyId ?? a.best.strategy.id);
  const save = (status: "approved" | "modified" | "declined") =>
    setReview(a.lot.lotId, { status: strategyId !== a.best.strategy.id && status === "approved" ? "modified" : status, reviewer, note, strategyId, date: new Date().toISOString() });
  return (
    <Card>
      <CardHeader eyebrow="Veterinary review" title="Veterinarian of record sign-off" right={review ? <Badge tone={review.status === "approved" ? "good" : review.status === "declined" ? "bad" : "info"}>{review.status}</Badge> : <Badge tone="warn">pending</Badge>} />
      <div className="space-y-3">
        <Field label="Option to implement">
          <select className={inputCls} value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
            {a.results.map((r) => (
              <option key={r.strategy.id} value={r.strategy.id}>
                {r.strategy.label}
                {r === a.best ? " (highest EV)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reviewer">
            <input className={inputCls} value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Name, DVM" />
          </Field>
          <Field label="Note / product & dose">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="per label" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" disabled={!reviewer} onClick={() => save("approved")}>
            Approve
          </Button>
          <Button size="sm" disabled={!reviewer} onClick={() => save("declined")}>
            Decline
          </Button>
        </div>
        {review && (
          <div className="text-[11px] text-ink-3">
            Last action {new Date(review.date).toLocaleString()} by {review.reviewer}.
          </div>
        )}
      </div>
    </Card>
  );
}

/** Run this lot through every risk model: do they agree on the risk and, more importantly, on the decision? */
function ConsensusCard({ lot, a }: { lot: LotArrival; a: LotAssessment }) {
  const params = useApp((s) => s.params);
  const { kind: activeKind } = useActiveModel();
  const [rows, setRows] = useState<ConsensusRow[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setRows(null), [lot, params]);
  const run = async () => {
    const models = [];
    for (const s of MODEL_SPECS) {
      setStatus(`Preparing ${s.short}…`);
      models.push(await ensureModel(s.kind));
    }
    setStatus("Simulating options under each model…");
    setRows(await consensusInWorker(lot, params, models));
    setStatus(null);
  };
  const counts = new Map<string, number>();
  rows?.forEach((r) => counts.set(r.bestLabel, (counts.get(r.bestLabel) ?? 0) + 1));
  const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
  const maxRisk = rows ? Math.max(...rows.map((r) => r.p90)) * 1.1 : 1;
  return (
    <Card>
      <CardHeader
        eyebrow="Model robustness"
        title="Do the other risk models agree?"
        sub="Re-runs this lot through all seven risk models with the same assumptions and decision engine. Agreement across model families means the recommendation does not hinge on one modelling choice."
        right={
          !rows && (
            <Button variant="primary" size="sm" onClick={run} disabled={!!status} icon={status ? <Spinner /> : undefined}>
              {status ?? "Compare all 7 models"}
            </Button>
          )
        }
      />
      {rows ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <table className="w-full text-[12.5px]">
            <thead className="border-b border-line text-[10.5px] tracking-wide text-ink-3 uppercase">
              <tr className="text-left">
                <th className="py-1.5 font-medium">Risk model</th>
                <th className="py-1.5 font-medium">Predicted morbidity (80% interval)</th>
                <th className="py-1.5 text-right font-medium">P(high-risk)</th>
                <th className="py-1.5 pl-3 font-medium">Recommends</th>
                <th className="py-1.5 text-right font-medium">vs SOP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.kind} className={r.kind === activeKind ? "bg-sky-soft/40" : ""}>
                  <td className="py-1.5 font-medium">
                    <ModelName kind={r.kind} short />
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="relative h-3 w-40 rounded bg-panel-2">
                        <div className="absolute top-1 h-1 rounded" style={{ left: `${(r.p10 / maxRisk) * 100}%`, width: `${((r.p90 - r.p10) / maxRisk) * 100}%`, background: `var(--m-${r.kind})`, opacity: 0.45 }} />
                        <div className="absolute top-0 h-3 w-[3px] rounded" style={{ left: `${(r.mean / maxRisk) * 100}%`, background: `var(--m-${r.kind})` }} />
                      </div>
                      <span className="num text-[11.5px]">
                        {pct(r.mean, 1)} <span className="text-ink-3">({pct(r.p10)}–{pct(r.p90)})</span>
                      </span>
                    </div>
                  </td>
                  <td className="num py-1.5 text-right">{pct(r.probHighRisk)}</td>
                  <td className="py-1.5 pl-3">
                    <StrategyChip id={r.bestId} label={r.bestLabel} muted={r.bestLabel !== top[0]} />
                  </td>
                  <td className="num py-1.5 text-right">{usd(r.deltaVsSq, { d: 2, sign: true })}/hd</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-3">
            <Callout tone={top[1] >= 6 ? "good" : top[1] >= 4 ? "warn" : "bad"} title={`${top[1]} of ${rows.length} models agree`}>
              {top[1] === rows.length
                ? `Every model family recommends ${top[0]}. The decision is robust to the choice of risk model.`
                : `${top[1] > rows.length / 2 ? "Most models recommend" : "No majority: the most common recommendation is"} ${top[0]}; ${rows.length - top[1]} prefer${rows.length - top[1] === 1 ? "s" : ""} another option. Where models disagree, the lot sits near a decision boundary. Check the value-of-information panel before acting.`}
            </Callout>
            <div className="text-[11px] leading-relaxed text-ink-3">
              Risk spread across models: {pct(Math.min(...rows.map((r) => r.mean)), 1)} to {pct(Math.max(...rows.map((r) => r.mean)), 1)}. The engine currently uses <ModelName kind={activeKind} short /> ({pct(a.risk.mean, 1)}). Value of information is not computed here.
            </div>
            <Button size="sm" onClick={run} disabled={!!status}>Re-run</Button>
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-ink-3">Tree models are trained in the background on first use (a few seconds).</div>
      )}
    </Card>
  );
}
