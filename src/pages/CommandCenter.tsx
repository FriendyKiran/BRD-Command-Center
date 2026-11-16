import { motion } from "framer-motion";
import { Activity, AlertTriangle, ArrowRight, BedDouble, CalendarClock, Pill, Skull, TrendingUp, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, CardHeader, ConfidenceBadge, RiskMeter, Spinner, Stat, StrategyChip, TooltipBox } from "../components/ui";
import { YardMap, type YardMapDatum } from "../components/YardMap";
import { SNAPSHOT } from "../data";
import type { LotAssessment, YardId } from "../engine/types";
import { SOURCE_LABEL } from "../engine/yards";
import { fmtDate, num, pct, riskColor, signed, usd } from "../lib/format";
import { useEngine, useYards } from "../state/engine";
import { YARD_INDEX } from "../engine/yards";
import { usePlans } from "../state/plan";
import { useApp } from "../state/store";

const DAY = 86400000;

export default function CommandCenter() {
  const { assessments, status } = useEngine();
  const plans = usePlans();
  const yards = useYards();
  const nav = useNavigate();
  const params = useApp((s) => s.params);
  const [yardSel, setYardSel] = useState<YardId | null>(null);

  const mapData: YardMapDatum[] = useMemo(
    () =>
      yards.map((y) => {
        const as = assessments.filter((a) => a.lot.yardId === y.id);
        const head = as.reduce((s, a) => s + a.lot.head, 0);
        const risk = head ? as.reduce((s, a) => s + a.risk.mean * a.lot.head, 0) / head : 0;
        return { id: y.id, head, risk, scheduled: as.filter((a) => a.lot.status === "scheduled").length };
      }),
    [assessments, yards],
  );

  if (!plans || status === "idle")
    return (
      <div className="flex h-[60vh] items-center justify-center gap-3 text-ink-3">
        <Spinner size={20} /> Scoring every lot and simulating options…
      </div>
    );

  const allPlans = Object.values(plans);
  const tot = (f: (p: (typeof allPlans)[number]["plan"]) => number) => allPlans.reduce((s, p) => s + f(p.plan), 0);
  const deltaValue = tot((p) => p.value - p.statusQuoValue);
  const deaths = tot((p) => p.deaths);
  const deathsSQ = tot((p) => p.deathsStatusQuo);
  const amu = tot((p) => p.amu);
  const amuSQ = tot((p) => p.amuStatusQuo);
  const headWindow = assessments.reduce((s, a) => s + a.lot.head, 0);
  const scheduled = assessments.filter((a) => a.lot.status === "scheduled");
  // Treatment starts in the next 14 days ≈ hospital head-days in that window ÷ days per treatment.
  const next14Cases = allPlans.reduce((s, p) => s + p.plan.hospital.slice(0, 14).reduce((a, b) => a + b, 0), 0) / Math.max(1, params.hospitalDaysPerTreatment);
  const needInfo = assessments.filter((a) => a.confidence === "insufficient");

  const attention = [...assessments]
    .filter((a) => a.lot.status === "scheduled")
    .map((a) => ({ a, score: (a.infoValue[0]?.value ?? 0) + (a.confidence === "insufficient" ? 500 : 0) + a.risk.probHighRisk * 300 }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 6)
    .map((x) => x.a);
  const tracking = assessments
    .filter((a) => a.lot.status === "on-feed" && a.risk.mean > a.arrivalRiskMean * 1.35 && a.risk.mean > 0.1)
    .sort((a, b) => b.risk.mean / b.arrivalRiskMean - a.risk.mean / a.arrivalRiskMean)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl border border-line shadow-card">
        <img src="./images/feedlot-hero.jpg" alt="Cattle in feedlot pens in the Texas Panhandle at dawn (USDA photo, public domain)" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f1a14f2] via-[#0f1a14cc] to-[#0f1a1433]" />
        <div className="relative grid gap-6 p-7 text-[#f4f1e8] md:grid-cols-[1.3fr_1fr] md:p-9">
          <div>
            <div className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-[#e8c37a] uppercase">Fall run · four yards · first 45 days on feed</div>
            <h1 className="font-display text-[34px] leading-[1.1] font-semibold md:text-[40px]">
              {num(scheduled.length)} lots inbound in the next two weeks.
              <br />
              <span className="text-[#e8c37a]">{needInfo.length} need more information</span> before you decide.
            </h1>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-[#d9d6cb]">
              Every arrival is scored for 45-day BRD risk, seven management options are simulated against yard economics and capacity, and the plan is
              compared against each yard's current operating procedure. Uncertainty and missing records are shown, not hidden.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/lots" className="inline-flex items-center gap-1.5 rounded-lg bg-[#e8c37a] px-3.5 py-2 text-[13px] font-semibold text-[#1d2420] hover:brightness-105">
                Open triage queue <ArrowRight size={15} />
              </Link>
              <Link to="/demo" className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-white/10">
                Walk through the demonstration case
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 self-end">
            {[
              { k: "Head in 45-day window", v: num(headWindow), i: <Activity size={14} /> },
              { k: "Projected BRD treatments, next 14 d", v: num(next14Cases), i: <BedDouble size={14} /> },
              { k: "Plan vs current SOP", v: usd(deltaValue, { sign: true, compact: true }), i: <TrendingUp size={14} /> },
              { k: "Antimicrobial regimens vs SOP", v: `${signed(((amu - amuSQ) / amuSQ) * 100)}%`, i: <Pill size={14} /> },
            ].map((x) => (
              <div key={x.k} className="rounded-xl border border-white/15 bg-white/8 p-3.5 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 text-[11px] text-[#cfcabd]">
                  {x.i}
                  {x.k}
                </div>
                <div className="num mt-1.5 text-[22px] font-semibold text-white">{x.v}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Map + yard cards */}
      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader
            eyebrow="Operation"
            title="Where the risk is"
            sub="Marker size = head in their first 45 days on feed; colour = head-weighted expected BRD morbidity. Click a yard for its summary."
          />
          <YardMap data={mapData} height={520} selected={yardSel} onSelect={(id) => setYardSel(id === yardSel ? null : id)} />
          <YardFocus yardId={yardSel} assessments={assessments} onClose={() => setYardSel(null)} />
        </Card>
        <div className="grid gap-3">
          {yards.map((y) => {
            const p = plans[y.id];
            const d = mapData.find((m) => m.id === y.id)!;
            const peak = Math.max(...p.plan.hospital);
            const cap = y.hospitalPenHead - y.hospitalBaseline;
            const bands = [0, 0, 0, 0, 0];
            p.assessments.forEach((a) => (bands[a.risk.mean < 0.06 ? 0 : a.risk.mean < 0.12 ? 1 : a.risk.mean < 0.2 ? 2 : a.risk.mean < 0.32 ? 3 : 4] += a.lot.head));
            return (
              <button
                key={y.id}
                onClick={() => nav(`/plan?yard=${y.id}`)}
                className={`card group p-4 text-left transition hover:-translate-y-0.5 hover:shadow-pop ${yardSel === y.id ? "ring-2 ring-brand-2" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold">{y.name}</div>
                    <div className="text-[12px] text-ink-3">
                      {y.town}, {y.state} · {y.character}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-[15px] font-semibold" style={{ color: p.plan.value - p.plan.statusQuoValue >= 0 ? "var(--sage)" : "var(--rust)" }}>
                      {usd(p.plan.value - p.plan.statusQuoValue, { sign: true, compact: true })}
                    </div>
                    <div className="text-[11px] text-ink-3">vs current SOP</div>
                  </div>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-panel-2">
                  {bands.map((b, i) => (
                    <div key={i} style={{ width: `${(b / Math.max(1, d.head)) * 100}%`, background: `var(--risk-${i})` }} />
                  ))}
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px] text-ink-3">
                  <div>
                    <span className="num block text-[13px] font-semibold text-ink">{num(d.head)}</span>head in window
                  </div>
                  <div>
                    <span className="num block text-[13px] font-semibold" style={{ color: peak > cap ? "var(--rust)" : "var(--ink)" }}>
                      {num(peak)} / {num(cap)}
                    </span>
                    hospital peak / capacity
                  </div>
                  <div>
                    <span className="num block text-[13px] font-semibold text-ink">
                      {num(p.plan.amu)} <span className="text-ink-3">({signed(((p.plan.amu - p.plan.amuStatusQuo) / Math.max(1, p.plan.amuStatusQuo)) * 100)}%)</span>
                    </span>
                    antimicrobial regimens
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Plan vs status quo */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Expected net value vs current SOPs"
          value={usd(deltaValue, { sign: true, compact: true })}
          tone={deltaValue >= 0 ? "good" : "bad"}
          icon={<TrendingUp size={14} />}
          sub={`${usd(deltaValue / Math.max(1, headWindow), { d: 2, sign: true })}/head across ${num(headWindow)} head`}
        />
        <Stat
          label="Expected BRD deaths"
          value={num(deaths)}
          icon={<Skull size={14} />}
          delta={{ text: `${signed(deaths - deathsSQ)} vs SOP`, good: deaths <= deathsSQ }}
          sub="45-day window"
        />
        <Stat
          label="Antimicrobial regimens"
          value={num(amu)}
          icon={<Pill size={14} />}
          delta={{ text: `${signed(((amu - amuSQ) / amuSQ) * 100)}%`, good: amu <= amuSQ }}
          sub="metaphylaxis + treatments"
        />
        <Stat
          label="Lots needing information"
          value={num(needInfo.length)}
          tone={needInfo.length ? "warn" : "good"}
          icon={<AlertTriangle size={14} />}
          sub="decision could flip with missing records"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ArrivalCalendar assessments={assessments} />
        <HospitalOutlook plans={plans} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Before trucks unload" title="Decisions that need attention" sub="Ranked by value of missing information and probability of a high-risk lot." right={<Link to="/lots" className="text-[12px] font-medium text-sky hover:underline">All lots →</Link>} />
          <div className="divide-y divide-line">
            {attention.map((a) => (
              <AttentionRow key={a.lot.lotId} a={a} />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="Already on feed" title="Lots tracking above their arrival prediction" sub="Bayesian update from pulls observed so far. These pens warrant a second look by the pen riders and the veterinarian." />
          {tracking.length === 0 ? (
            <div className="text-[13px] text-ink-3">No on-feed lot is running materially above expectation.</div>
          ) : (
            <div className="divide-y divide-line">
              {tracking.map((a) => (
                <Link key={a.lot.lotId} to={`/lots/${a.lot.lotId}`} className="flex items-center gap-4 py-3 hover:bg-panel-2/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      {a.lot.lotId} <Badge>{a.lot.daysOnFeed} DOF</Badge>
                    </div>
                    <div className="truncate text-[12px] text-ink-3">
                      {a.lot.casesToDate} pulls of {a.lot.head} head · {a.lot.weightLb} lb · {a.lot.source ? SOURCE_LABEL[a.lot.source] : "source unknown"}
                    </div>
                  </div>
                  <div className="text-right text-[12px]">
                    <div className="num">
                      <span className="text-ink-3">{pct(a.arrivalRiskMean)}</span> → <span className="font-semibold" style={{ color: riskColor(a.risk.mean) }}>{pct(a.risk.mean)}</span>
                    </div>
                    <div className="text-ink-3">arrival → updated</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function AttentionRow({ a }: { a: LotAssessment }) {
  const top = a.infoValue[0];
  return (
    <Link to={`/lots/${a.lot.lotId}`} className="flex items-center gap-4 py-3 transition hover:bg-panel-2/50">
      <div className="w-[92px] shrink-0">
        <div className="num text-[13px] font-semibold">{a.lot.lotId}</div>
        <div className="text-[11px] text-ink-3">arrives {fmtDate(a.lot.arrivalDate)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <RiskMeter mean={a.risk.mean} p10={a.risk.p10} p90={a.risk.p90} width={110} />
          <ConfidenceBadge level={a.confidence} compact />
        </div>
        <div className="mt-1 truncate text-[12px] text-ink-3">
          {top && top.value > 0
            ? `Ask the order buyer: ${top.label.toLowerCase()} is worth ≈ ${usd(top.value)} to this decision`
            : a.confidenceReasons[0]}
        </div>
      </div>
      <StrategyChip id={a.best.strategy.id} label={a.best.strategy.short} />
    </Link>
  );
}

function ArrivalCalendar({ assessments }: { assessments: LotAssessment[] }) {
  const yards = useYards();
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.parse(SNAPSHOT) + i * DAY).toISOString().slice(0, 10));
  const nav = useNavigate();
  return (
    <Card>
      <CardHeader eyebrow="Inbound" title="Arrival calendar" sub="Each square is a lot scheduled to arrive, coloured by predicted BRD risk; outline = information insufficient." right={<CalendarClock size={18} className="text-ink-3" />} />
      <div className="scroll-thin overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[150px_repeat(14,1fr)] gap-1 text-[10px] text-ink-3">
            <div />
            {days.map((d) => (
              <div key={d} className="text-center">
                <div className="font-semibold text-ink-2">{new Date(d + "T12:00Z").toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" })}</div>
                {new Date(d + "T12:00Z").getUTCDate()}
              </div>
            ))}
            {yards.map((y) => (
              <Row key={y.id} label={y.name} days={days} lots={assessments.filter((a) => a.lot.yardId === y.id && a.lot.status === "scheduled")} onClick={(id) => nav(`/lots/${id}`)} />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 text-[11px] text-ink-3">
        <Truck size={14} /> Risk scale
        {["<6%", "6–12%", "12–20%", "20–32%", ">32%"].map((l, i) => (
          <span key={l} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(--risk-${i})` }} />
            {l}
          </span>
        ))}
      </div>
    </Card>
  );
}

function Row({ label, days, lots, onClick }: { label: string; days: string[]; lots: LotAssessment[]; onClick: (id: string) => void }) {
  return (
    <>
      <div className="flex items-center pr-2 text-[12px] font-medium text-ink-2">{label}</div>
      {days.map((d) => {
        const ls = lots.filter((a) => a.lot.arrivalDate === d);
        return (
          <div key={d} className="flex min-h-[38px] flex-wrap content-start gap-0.5 rounded-md bg-panel-2/60 p-1">
            {ls.map((a) => (
              <button
                key={a.lot.lotId}
                title={`${a.lot.lotId}: ${a.lot.head} hd, ${a.lot.weightLb} lb, risk ${pct(a.risk.mean)}`}
                onClick={() => onClick(a.lot.lotId)}
                className="h-3.5 w-3.5 rounded-[3px] transition hover:scale-125"
                style={{ background: riskColor(a.risk.mean), outline: a.confidence === "insufficient" ? "2px solid var(--ink)" : undefined, outlineOffset: 1 }}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function HospitalOutlook({ plans }: { plans: NonNullable<ReturnType<typeof usePlans>> }) {
  const yards = useYards();
  const all = Object.values(plans);
  const cal = all[0].plan.calendar;
  const cap = yards.reduce((s, y) => s + y.hospitalPenHead - y.hospitalBaseline, 0);
  const data = cal.slice(0, 45).map((d, t) => ({
    d: fmtDate(d),
    plan: all.reduce((s, p) => s + p.plan.hospital[t], 0),
    sq: all.reduce((s, p) => s + p.plan.hospitalStatusQuo[t], 0),
    p90: all.reduce((s, p) => s + p.plan.hospitalP90[t], 0),
  }));
  return (
    <Card>
      <CardHeader eyebrow="Capacity" title="Hospital-pen outlook, all yards" sub="Expected head in hospital pens from cattle in their first 45 days: optimised plan (solid) vs current SOPs (dashed); band to the 90th percentile." />
      <div className="h-[250px]">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: -10, right: 10, top: 5 }}>
            <defs>
              <linearGradient id="hosp" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--sky)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--sky)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="d" interval={6} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox>
                    <div className="mb-1 font-semibold">{label}</div>
                    <div className="num">Plan: {num(payload[0].payload.plan)} head</div>
                    <div className="num text-ink-3">P90: {num(payload[0].payload.p90)}</div>
                    <div className="num text-ink-3">Current SOP: {num(payload[0].payload.sq)}</div>
                  </TooltipBox>
                ) : null
              }
            />
            <Area dataKey="p90" stroke="none" fill="url(#hosp)" />
            <Area dataKey="sq" stroke="var(--ink-3)" strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
            <Area dataKey="plan" stroke="var(--sky)" fill="none" strokeWidth={2.2} />
            <ReferenceLine y={cap} stroke="var(--rust)" strokeDasharray="6 3" label={{ value: `capacity ${cap}`, position: "insideTopRight", fill: "var(--rust)", fontSize: 11 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Summary of the yard clicked on the map, with links to its plan and its lots. */
function YardFocus({ yardId, assessments, onClose }: { yardId: YardId | null; assessments: LotAssessment[]; onClose: () => void }) {
  const nav = useNavigate();
  if (!yardId) return <div className="mt-3 text-[12px] text-ink-3">Click a yard on the map for its summary.</div>;
  const y = YARD_INDEX[yardId];
  const as = assessments.filter((a) => a.lot.yardId === yardId);
  const inbound = as.filter((a) => a.lot.status === "scheduled");
  const head = inbound.reduce((s, a) => s + a.lot.head, 0);
  const risk = head ? inbound.reduce((s, a) => s + a.risk.mean * a.lot.head, 0) / head : 0;
  const needInfo = inbound.filter((a) => a.confidence === "insufficient").length;
  const changed = inbound.filter((a) => a.best.strategy.id !== a.statusQuo.strategy.id).length;
  const top = [...inbound].sort((a, b) => b.risk.mean - a.risk.mean)[0];
  return (
    <div className="mt-4 rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold">{y.name}</div>
          <div className="text-[12px] text-ink-3">
            {y.town}, {y.state} · current SOP: {y.sop.summary}
          </div>
        </div>
        <button onClick={onClose} className="text-[12px] text-ink-3 hover:text-ink" aria-label="Close yard summary">
          ✕
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-ink-3 sm:grid-cols-4">
        <div>
          <span className="num block text-[15px] font-semibold text-ink">{inbound.length}</span>lots inbound ({num(head)} hd)
        </div>
        <div>
          <span className="num block text-[15px] font-semibold" style={{ color: riskColor(risk) }}>{pct(risk)}</span>head-weighted risk, inbound
        </div>
        <div>
          <span className="num block text-[15px] font-semibold text-ink">{changed}</span>lots where the tool changes the SOP's call
        </div>
        <div>
          <span className="num block text-[15px] font-semibold" style={{ color: needInfo ? "var(--rust)" : "var(--ink)" }}>{needInfo}</span>need more information
        </div>
      </div>
      {top && (
        <div className="mt-3 text-[12px] text-ink-2">
          Highest-risk inbound lot:{" "}
          <Link to={`/lots/${top.lot.lotId}`} className="num font-medium text-brand-2 hover:underline">
            {top.lot.lotId}
          </Link>{" "}
          ({pct(top.risk.mean)}, {num(top.lot.head)} hd, arrives {fmtDate(top.lot.arrivalDate)})
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<ArrowRight size={13} />} onClick={() => nav(`/plan?yard=${yardId}`)}>
          Open yard plan
        </Button>
        <Button size="sm" onClick={() => nav(`/lots?yard=${yardId}`)}>
          See this yard's lots
        </Button>
      </div>
    </div>
  );
}
