import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Lock, Pill, Skull, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Callout, Card, CardHeader, PageHeader, Segmented, SliderRow, Spinner, Stat, StrategyChip, TooltipBox } from "../components/ui";
import { planPortfolio, type PlanInput } from "../engine/optimize";
import type { LotAssessment, StrategyResult, YardId } from "../engine/types";
import { YARDS } from "../engine/yards";
import { fmtDate, num, pct, signed, usd } from "../lib/format";
import { useYards } from "../state/engine";
import { usePlans, useShadow } from "../state/plan";
import { useApp } from "../state/store";

type PolicyFn = (a: LotAssessment) => StrategyResult;

const regimens = (r: StrategyResult) => r.metaphylaxisRegimens + r.therapeuticRegimens;

export default function Planner() {
  const [sp, setSp] = useSearchParams();
  const yardId = (sp.get("yard") ?? "llano") as YardId;
  const plans = usePlans();
  const yards = useYards();
  const yard = yards.find((y) => y.id === yardId)!;
  const setCapacity = useApp((s) => s.setCapacity);
  const amuCap = useApp((s) => s.amuCap[yardId] ?? null);
  const setAmuCap = useApp((s) => s.setAmuCap);
  const params = useApp((s) => s.params);
  const setParam = useApp((s) => s.setParam);
  const locks = useApp((s) => s.locks);
  const yp = plans?.[yardId];
  const shadow = useShadow(yp);

  const policies = useMemo(() => {
    if (!yp) return [];
    const as = yp.assessments;
    const pick = (id: string): PolicyFn => (a) => a.results.find((r) => r.strategy.id === id) ?? a.results[0];
    const evalPolicy = (label: string, f: PolicyFn, note: string) => {
      const rs = as.map(f);
      // Re-use the planner's calendar accounting by locking every lot to the policy's option.
      const lockedPlan = planPortfolio({ ...yp.input, locked: Object.fromEntries(as.map((a, i) => [a.lot.lotId, rs[i].strategy.id])) });
      return {
        label,
        note,
        value: rs.reduce((s, r) => s + r.lotValue.mean, 0),
        deaths: rs.reduce((s, r) => s + r.deaths, 0),
        amu: rs.reduce((s, r) => s + regimens(r), 0),
        peakHosp: Math.max(...lockedPlan.hospital),
        feasible: lockedPlan.feasible,
      };
    };
    const planRs = as.map((a) => a.results.find((r) => r.strategy.id === yp.plan.choice[a.lot.lotId])!);
    return [
      {
        label: "Optimised plan",
        note: "Best expected value within capacity and stewardship limits",
        value: planRs.reduce((s, r) => s + r.lotValue.mean, 0),
        deaths: planRs.reduce((s, r) => s + r.deaths, 0),
        amu: planRs.reduce((s, r) => s + regimens(r), 0),
        peakHosp: Math.max(...yp.plan.hospital),
        feasible: yp.plan.feasible,
      },
      evalPolicy("Current SOP", (a) => a.statusQuo, yard.sop.summary),
      evalPolicy("Unconstrained best", (a) => a.best, "Each lot's best option, ignoring yard capacity"),
      evalPolicy("Blanket premium metaphylaxis", pick("prem-std"), "Every arrival gets premium metaphylaxis"),
      evalPolicy("No metaphylaxis", pick("none-std"), "Pull-and-treat only"),
      evalPolicy("Buyer's call", (a) => (a.lot.buyerHighRisk && a.lot.status === "scheduled" ? pick("prem-std")(a) : a.statusQuo.strategy.antimicrobial === "none" || a.lot.status === "on-feed" ? a.statusQuo : pick("none-std")(a)), "Metaphylaxis only when the order buyer flags the lot"),
    ];
  }, [yp, yard]);

  const frontier = useMemo(() => {
    if (!yp) return [];
    return [0, 2, 5, 10, 15, 25, 40, 60, 90].map((lambda) => {
      const as = yp.assessments.map((a) => ({
        ...a,
        results: a.results.map((r) => ({ ...r, objective: r.lotValue.mean - lambda * regimens(r) - params.deathPenalty * r.deaths })),
      }));
      const input: PlanInput = { ...yp.input, assessments: as };
      const p = planPortfolio(input);
      const rs = as.map((a) => a.results.find((r) => r.strategy.id === p.choice[a.lot.lotId])!);
      return { lambda, value: rs.reduce((s, r) => s + r.lotValue.mean, 0), amu: rs.reduce((s, r) => s + regimens(r), 0), deaths: rs.reduce((s, r) => s + r.deaths, 0) };
    });
  }, [yp, params.deathPenalty]);

  if (!yp || !plans)
    return (
      <div className="flex items-center gap-2 p-10 text-ink-3">
        <Spinner /> Building yard plans…
      </div>
    );
  const p = yp.plan;
  const cap = yard.hospitalPenHead - yard.hospitalBaseline;
  const sq = policies[1];
  const chart = p.calendar.map((d, t) => ({ d: fmtDate(d), plan: p.hospital[t], p90: p.hospitalP90[t], sq: p.hospitalStatusQuo[t], riders: p.riders[t], ridersSq: p.ridersStatusQuo[t] }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Portfolio decision"
        title="Yard planner"
        sub="Chooses one option for every inbound and on-feed lot to maximise expected value while respecting hospital pens, pen-rider hours, chute time and an optional antimicrobial cap. Change any constraint and the plan re-optimises instantly."
        right={<Segmented value={yardId} onChange={(v) => setSp({ yard: v })} options={YARDS.map((y) => ({ value: y.id, label: y.name.replace(" Feedyard", "").replace(" Feeders", "").replace(" Cattle Co.", "") }))} />}
      />

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader eyebrow={`${yard.town}, ${yard.state}`} title="Binding constraints" sub={yard.character} />
            <div className="space-y-4">
              <SliderRow label="Hospital-pen capacity (head)" value={yard.hospitalPenHead} min={40} max={900} step={10} onChange={(v) => setCapacity(yardId, "hospitalPenHead", v)} />
              <SliderRow label="…already occupied by older cattle" value={yard.hospitalBaseline} min={0} max={300} step={5} onChange={(v) => setCapacity(yardId, "hospitalBaseline", v)} />
              <SliderRow label="Receiving-crew rider hours / day" value={yard.riderHoursPerDay} min={2} max={60} step={0.5} onChange={(v) => setCapacity(yardId, "riderHoursPerDay", v)} />
              <SliderRow label="Chute hours / day" value={yard.chuteHoursPerDay} min={2} max={30} step={1} onChange={(v) => setCapacity(yardId, "chuteHoursPerDay", v)} />
              <div className="rounded-lg border border-line p-3">
                <label className="flex items-center gap-2 text-[13px] font-medium">
                  <input type="checkbox" checked={amuCap != null} onChange={(e) => setAmuCap(yardId, e.target.checked ? Math.round((sq?.amu ?? 1000) * 0.85) : null)} /> Cap antimicrobial regimens
                </label>
                {amuCap != null && (
                  <div className="mt-3">
                    <SliderRow label="Max regimens in plan" value={amuCap} min={50} max={Math.max(200, Math.round((sq?.amu ?? 1000) * 1.6))} step={10} onChange={(v) => setAmuCap(yardId, v)} hint={`Current SOP uses ${num(sq?.amu ?? 0)}`} />
                  </div>
                )}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader eyebrow="Values" title="What else matters" sub="Turn these up to make stewardship and welfare explicit in the objective (applies to every page)." />
            <div className="space-y-4">
              <SliderRow label="Stewardship weight ($ / regimen)" value={params.amuPenalty} min={0} max={60} step={1} onChange={(v) => setParam("amuPenalty", v)} format={(v) => usd(v)} />
              <SliderRow label="Welfare weight ($ / BRD death)" value={params.deathPenalty} min={0} max={2000} step={25} onChange={(v) => setParam("deathPenalty", v)} format={(v) => usd(v)} />
            </div>
          </Card>
          {shadow && (
            <Card>
              <CardHeader eyebrow="Shadow prices" title="What one more unit is worth" sub="Gain in expected value from relaxing each constraint by 10 %." />
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-ink-2">Hospital pen space</span>
                  <span className="num font-semibold">{usd(shadow.hospitalPerHead, { d: 2 })} / head-space</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">Rider time</span>
                  <span className="num font-semibold">{usd(shadow.riderPerHour, { d: 2 })} / hour·day</span>
                </div>
                {shadow.amuPerRegimen != null && (
                  <div className="flex justify-between">
                    <span className="text-ink-2">Antimicrobial cap</span>
                    <span className="num font-semibold">{usd(shadow.amuPerRegimen, { d: 2 })} / regimen</span>
                  </div>
                )}
                <p className="pt-1 text-[11px] text-ink-3">A shadow price of $0 means the constraint is not binding at current settings.</p>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {p.feasible ? (
            <Callout tone="good" icon={<CheckCircle2 size={16} />} title="Plan fits within every constraint">
              {yp.assessments.length} lots ({num(yp.assessments.reduce((s, a) => s + a.lot.head, 0))} head) planned over {p.calendar.length} days.
            </Callout>
          ) : (
            <Callout tone="bad" icon={<AlertTriangle size={16} />} title="No plan satisfies every constraint: the operation needs a decision">
              <ul className="list-disc pl-4">
                {p.violations.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
              <div className="mt-1">
                Options: open temporary hospital pens, shorten hospital stays (treat-and-return), add rider hours, or defer arrivals. Most of the load comes from lots already on feed
                that the plan cannot change.
              </div>
            </Callout>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Expected value vs SOP" value={usd(p.value - p.statusQuoValue, { sign: true, compact: true })} tone={p.value >= p.statusQuoValue ? "good" : "bad"} icon={<TrendingUp size={14} />} sub="objective incl. weights" />
            <Stat label="BRD deaths" value={num(p.deaths, 0)} icon={<Skull size={14} />} delta={{ text: `${signed(p.deaths - p.deathsStatusQuo, 1)} vs SOP`, good: p.deaths <= p.deathsStatusQuo }} />
            <Stat label="Antimicrobial regimens" value={num(p.amu)} icon={<Pill size={14} />} delta={{ text: `${signed(((p.amu - p.amuStatusQuo) / Math.max(1, p.amuStatusQuo)) * 100)}%`, good: p.amu <= p.amuStatusQuo }} />
            <Stat label="Hospital peak / capacity" value={`${num(Math.max(...p.hospital))} / ${num(cap)}`} tone={Math.max(...p.hospital) > cap ? "bad" : "ink"} sub={`SOP peak ${num(Math.max(...p.hospitalStatusQuo))}`} />
          </div>

          <Card pad={false}>
            <div className="p-5 pb-2">
              <CardHeader eyebrow="Compared against the current operating approach" title="Management policies for this yard" sub="Expected feeding-period net value for the planned lots. Absolute margins move with cattle and feed prices (see Assumptions); compare policies by their difference from the SOP. Each policy is checked against the same capacity calendar." />
            </div>
            <table className="w-full text-[13px]">
              <thead className="border-y border-line bg-panel-2/60 text-[10.5px] tracking-wide text-ink-3 uppercase">
                <tr className="text-left">
                  <th className="px-5 py-2 font-medium">Policy</th>
                  <th className="px-3 py-2 text-right font-medium">Net value</th>
                  <th className="px-3 py-2 text-right font-medium">vs SOP</th>
                  <th className="px-3 py-2 text-right font-medium">BRD deaths</th>
                  <th className="px-3 py-2 text-right font-medium">Regimens</th>
                  <th className="px-3 py-2 text-right font-medium">Hospital peak</th>
                  <th className="px-5 py-2 font-medium">Feasible?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {policies.map((pol, i) => (
                  <tr key={pol.label} className={clsx(i === 0 && "bg-sage-soft/40")}>
                    <td className="px-5 py-2.5">
                      <div className="font-semibold">{pol.label}</div>
                      <div className="text-[11px] text-ink-3">{pol.note}</div>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{usd(pol.value, { compact: true })}</td>
                    <td className="num px-3 py-2.5 text-right font-semibold" style={{ color: pol.value - sq.value >= 0 ? "var(--sage)" : "var(--rust)" }}>
                      {i === 1 ? "—" : usd(pol.value - sq.value, { sign: true, compact: true })}
                    </td>
                    <td className="num px-3 py-2.5 text-right">{num(pol.deaths, 1)}</td>
                    <td className="num px-3 py-2.5 text-right">{num(pol.amu)}</td>
                    <td className="num px-3 py-2.5 text-right" style={{ color: pol.peakHosp > cap ? "var(--rust)" : undefined }}>
                      {num(pol.peakHosp)}
                    </td>
                    <td className="px-5 py-2.5">{pol.feasible ? <Badge tone="good">yes</Badge> : <Badge tone="bad">over capacity</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-6 2xl:grid-cols-2">
            <Card>
              <CardHeader eyebrow="Capacity calendar" title="Hospital-pen census" sub="Plan (solid) with 90th-percentile band vs SOP (dashed); red line = free capacity." />
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <ComposedChart data={chart} margin={{ left: -10, right: 10, top: 5 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="d" interval={7} tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip content={({ active, payload, label }) => (active && payload?.length ? <TooltipBox><div className="font-semibold">{label}</div><div className="num">Plan {num(payload[0].payload.plan)} (P90 {num(payload[0].payload.p90)})</div><div className="num text-ink-3">SOP {num(payload[0].payload.sq)}</div></TooltipBox> : null)} />
                    <Area dataKey="p90" fill="var(--sky)" fillOpacity={0.12} stroke="none" />
                    <Line dataKey="sq" stroke="var(--ink-3)" strokeDasharray="5 4" dot={false} />
                    <Line dataKey="plan" stroke="var(--sky)" strokeWidth={2.4} dot={false} />
                    <ReferenceLine y={cap} stroke="var(--rust)" strokeDasharray="6 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardHeader eyebrow="Capacity calendar" title="Pen-rider hours" sub="Enhanced surveillance roughly doubles riding time for the first 4 weeks on feed." />
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <ComposedChart data={chart} margin={{ left: -10, right: 10, top: 5 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="d" interval={7} tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip content={({ active, payload, label }) => (active && payload?.length ? <TooltipBox><div className="font-semibold">{label}</div><div className="num">Plan {num(payload[0].payload.riders, 1)} h</div><div className="num text-ink-3">SOP {num(payload[0].payload.ridersSq, 1)} h</div></TooltipBox> : null)} />
                    <Line dataKey="ridersSq" stroke="var(--ink-3)" strokeDasharray="5 4" dot={false} />
                    <Area dataKey="riders" stroke="var(--wheat)" fill="var(--wheat)" fillOpacity={0.15} strokeWidth={2.2} />
                    <ReferenceLine y={yard.riderHoursPerDay} stroke="var(--rust)" strokeDasharray="6 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              eyebrow="Stewardship frontier"
              title="How much value does each cut in antimicrobial use cost?"
              sub="Each point re-optimises the plan with a higher $ weight per regimen. The curve shows how much antimicrobial use can be cut before profit falls sharply. The diamond is the current SOP; the ring is your current setting."
            />
            <div className="h-[300px]">
              <ResponsiveContainer>
                <ScatterChart margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                  <CartesianGrid />
                  <XAxis type="number" dataKey="amu" name="Regimens" tickLine={false} axisLine={false} domain={["auto", "auto"]} label={{ value: "antimicrobial regimens in plan", position: "insideBottom", offset: -5, fill: "var(--ink-3)", fontSize: 11 }} />
                  <YAxis type="number" dataKey="value" tickFormatter={(v) => usd(v, { compact: true })} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox><div className="font-semibold">Weight {usd(payload[0].payload.lambda ?? 0)}/regimen</div><div className="num">Value {usd(payload[0].payload.value, { compact: true })}</div><div className="num">{num(payload[0].payload.amu)} regimens · {num(payload[0].payload.deaths ?? 0, 1)} deaths</div></TooltipBox> : null)} />
                  <Scatter data={frontier} line={{ stroke: "var(--brand-2)", strokeWidth: 2 }} fill="var(--brand-2)" />
                  {sq && <ReferenceDot ifOverflow="extendDomain" x={sq.amu} y={sq.value} r={7} fill="var(--rust)" stroke="var(--panel)" shape={(p: { cx?: number; cy?: number }) => <path d={`M${p.cx} ${(p.cy ?? 0) - 9} L${(p.cx ?? 0) + 9} ${p.cy} L${p.cx} ${(p.cy ?? 0) + 9} L${(p.cx ?? 0) - 9} ${p.cy} Z`} fill="var(--rust)" stroke="var(--panel)" strokeWidth={2} />} />}
                  <ReferenceDot x={policies[0]?.amu} y={policies[0]?.value} r={10} fill="none" stroke="var(--ink)" strokeWidth={2} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card pad={false}>
            <div className="p-5 pb-2">
              <CardHeader eyebrow="Lot assignments" title="What the plan does with each lot" sub="Locks set on a lot page are honoured here. Rows where capacity forced a different choice than the lot's own best option are flagged." />
            </div>
            <div className="scroll-thin max-h-[520px] overflow-y-auto">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 border-y border-line bg-panel-2 text-[10.5px] tracking-wide text-ink-3 uppercase">
                  <tr className="text-left">
                    <th className="px-5 py-2 font-medium">Lot</th>
                    <th className="px-3 py-2 font-medium">Risk</th>
                    <th className="px-3 py-2 font-medium">Planned</th>
                    <th className="px-3 py-2 font-medium">Lot's own best</th>
                    <th className="px-3 py-2 font-medium">Current SOP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...yp.assessments]
                    .sort((a, b) => a.lot.arrivalDate.localeCompare(b.lot.arrivalDate))
                    .map((a) => {
                      const planned = a.results.find((r) => r.strategy.id === p.choice[a.lot.lotId])!;
                      const forced = planned.strategy.id !== a.best.strategy.id;
                      return (
                        <tr key={a.lot.lotId} className={clsx(forced && "bg-wheat-soft/40")}>
                          <td className="px-5 py-2">
                            <Link to={`/lots/${a.lot.lotId}`} className="num font-semibold hover:underline">
                              {a.lot.lotId}
                            </Link>
                            <div className="text-[11px] text-ink-3">
                              {a.lot.status === "scheduled" ? `arrives ${fmtDate(a.lot.arrivalDate)}` : `day ${a.lot.daysOnFeed}`} · {a.lot.head} hd
                            </div>
                          </td>
                          <td className="num px-3 py-2">{pct(a.risk.mean)}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <StrategyChip id={planned.strategy.id} label={planned.strategy.short} />
                              {locks[a.lot.lotId] && <Lock size={12} className="text-ink-3" />}
                              {forced && !locks[a.lot.lotId] && <Badge tone="warn">capacity</Badge>}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <StrategyChip id={a.best.strategy.id} label={a.best.strategy.short} muted />
                          </td>
                          <td className="px-3 py-2">
                            <StrategyChip id={a.statusQuo.strategy.id} label={a.statusQuo.strategy.short} muted />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
