import { AlertTriangle, CheckCircle2, Database, Info, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Callout, Card, CardHeader, PageHeader, Segmented, Spinner, Stat, TooltipBox } from "../components/ui";
import { loadHistory, META } from "../data";
import {
  confoundingByWeight,
  driftReport,
  missingness,
  monthlySeries,
  morbidityHistogram,
  morbidityQuantiles,
  overview,
  qualityChecks,
  riskProfiles,
  spearmanMatrix,
  type Profile,
} from "../engine/eda";
import type { HistoricalLot, YardId } from "../engine/types";
import { YARD_INDEX, YARDS } from "../engine/yards";
import { fmtDate, num, pct } from "../lib/format";

const yardColor = (id: string) => `var(--y-${id})`;
const yardName = (id: string) => YARD_INDEX[id as YardId]?.name ?? id;

type Scope = "all" | YardId;

const PCT_VARS = new Set(["Buyer flag", "Auction commingled", "Vaccination unknown", "Metaphylaxis given", "BRD morbidity (outcome)"]);

/**
 * DATA EXPLORER: exploratory analysis of the historical lot records that train the risk models:
 * outcome distribution, missingness, univariate risk profiles with cluster-robust CIs, correlations,
 * seasonality, confounding by indication, data-quality checks and train/holdout drift.
 */
export default function DataExplorer() {
  const [history, setHistory] = useState<HistoricalLot[] | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);
  const lots = useMemo(() => (history ? (scope === "all" ? history : history.filter((l) => l.yardId === scope)) : []), [history, scope]);
  const yards = YARDS.map((y) => y.id);

  if (!history)
    return (
      <div className="flex items-center gap-2 p-10 text-ink-3">
        <Spinner /> Loading the historical lot records…
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidence"
        title="Data explorer"
        sub="What the training records look like before any model touches them: outcome distribution, missing records, unadjusted risk by factor, correlations, seasonality, confounding and data quality."
        right={
          <Segmented<Scope>
            size="sm"
            value={scope}
            onChange={setScope}
            options={[{ value: "all", label: "All yards" }, ...YARDS.map((y) => ({ value: y.id as Scope, label: y.name.replace(/ (Feedyard|Feeders|Cattle Co.)$/, "") }))]}
          />
        }
      />
      <Overview lots={lots} />
      <div className="grid gap-6 xl:grid-cols-2">
        <OutcomeDistribution lots={lots} yards={scope === "all" ? yards : [scope]} />
        <YardSpread lots={history} />
      </div>
      <Missingness lots={history} yards={yards} />
      <RiskProfiles lots={lots} />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Seasonality lots={lots} />
        <Confounding lots={lots} />
      </div>
      <Correlations lots={lots} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <Quality lots={history} />
        <Drift lots={history} />
      </div>
    </div>
  );
}

function Overview({ lots }: { lots: HistoricalLot[] }) {
  const o = useMemo(() => overview(lots), [lots]);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Stat label="Lot records" value={num(o.lots)} icon={<Database size={14} />} sub={`${num(o.head)} head · ${fmtDate(o.from)} → ${fmtDate(o.to)}`} />
      <Stat label="45-day BRD morbidity" value={pct(o.morbidity, 1)} sub={`95% CI ${pct(o.morbidityLo, 1)}–${pct(o.morbidityHi, 1)} (lot-clustered)`} />
      <Stat label="High-risk lots (≥ 15 %)" value={pct(o.highRiskShare, 1)} sub="Rojas et al. 2022: 10.85 % (compare the low-risk Cimarron yard: 16 %)" />
      <Stat label="BRD mortality" value={pct(o.mortality, 2)} sub={`metaphylaxis on ${pct(o.metaShare)} of head`} />
      <Stat label="Complete arrival records" value={pct(o.completeRecords)} tone={o.completeRecords < 0.6 ? "warn" : "ink"} sub="lots with no unknown field" />
    </div>
  );
}

function OutcomeDistribution({ lots, yards }: { lots: HistoricalLot[]; yards: string[] }) {
  const data = useMemo(() => morbidityHistogram(lots, yards), [lots, yards]);
  return (
    <Card>
      <CardHeader eyebrow="Outcome" title="Distribution of 45-day lot morbidity" sub="Lots by 45-day morbidity (detected cases ÷ head). Right-skewed: most lots stay under 10 %, and a long tail of wrecks drives the losses. Dashed line: the 15 % high-risk cutoff." />
      <div className="h-[280px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: -10, right: 10, top: 10, bottom: 10 }} barCategoryGap={1}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="bin" type="number" domain={[0, 0.5]} tickFormatter={(v) => pct(v)} ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5]} />
            <YAxis allowDecimals={false} />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox>
                    <div className="text-ink-3">
                      Morbidity {pct(Number(payload[0].payload.bin))}–{pct(Number(payload[0].payload.bin) + 0.02)}
                    </div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="num">
                        {yardName(String(p.dataKey))}: {String(p.value)} lots
                      </div>
                    ))}
                  </TooltipBox>
                ) : null
              }
            />
            <ReferenceLine x={0.15} stroke="var(--rust)" strokeDasharray="4 3" />
            {yards.map((y, i) => (
              <Bar key={y} dataKey={y} stackId="a" fill={yardColor(y)} name={yardName(y)} radius={i === yards.length - 1 ? [3, 3, 0, 0] : undefined} barSize={14} />
            ))}
            {yards.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function YardSpread({ lots }: { lots: HistoricalLot[] }) {
  const q = useMemo(() => morbidityQuantiles(lots, (l) => l.yardId).sort((a, b) => a.p50 - b.p50), [lots]);
  const max = Math.max(...q.map((r) => r.p90)) * 1.1;
  const x = (v: number) => `${(v / max) * 100}%`;
  return (
    <Card>
      <CardHeader eyebrow="Between-yard variation" title="Lot morbidity by yard" sub="Bar: 25th–75th percentile of lots; whiskers: 10th–90th; tick: median; dot: mean. The yards differ by design in cattle mix and record keeping." />
      <div className="mt-4 space-y-5">
        {q.map((r) => (
          <div key={r.group} className="grid grid-cols-[150px_1fr] items-center gap-3">
            <div className="text-[12.5px]">
              <div className="flex items-center gap-1.5 font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: yardColor(r.group) }} />
                {yardName(r.group)}
              </div>
              <div className="pl-4 text-[11px] text-ink-3">{num(r.n)} lots</div>
            </div>
            <div className="relative h-8" title={`P10 ${pct(r.p10, 1)} · P25 ${pct(r.p25, 1)} · median ${pct(r.p50, 1)} · P75 ${pct(r.p75, 1)} · P90 ${pct(r.p90, 1)} · mean ${pct(r.mean, 1)}`}>
              <div className="absolute top-1/2 h-px bg-ink-3" style={{ left: x(r.p10), width: `calc(${x(r.p90)} - ${x(r.p10)})` }} />
              <div className="absolute top-1/2 h-4 -translate-y-1/2 rounded" style={{ left: x(r.p25), width: `calc(${x(r.p75)} - ${x(r.p25)})`, background: yardColor(r.group), opacity: 0.35 }} />
              <div className="absolute top-1/2 h-5 w-[2px] -translate-y-1/2 bg-ink" style={{ left: x(r.p50) }} />
              <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel" style={{ left: x(r.mean), background: yardColor(r.group) }} />
              <div className="num absolute -bottom-2 text-[10px] text-ink-3" style={{ left: x(r.p90) }}>
                &nbsp;{pct(r.p90)}
              </div>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[150px_1fr] gap-3">
          <div />
          <div className="relative h-4 border-t border-line text-[10px] text-ink-3">
            {[0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3].filter((v) => v <= max).map((v) => (
              <span key={v} className="num absolute -translate-x-1/2 pt-0.5" style={{ left: x(v) }}>
                {pct(v)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Missingness({ lots, yards }: { lots: HistoricalLot[]; yards: string[] }) {
  const rows = useMemo(() => missingness(lots, yards), [lots, yards]);
  return (
    <Card>
      <CardHeader
        eyebrow="Incomplete records"
        title="Missingness, and whether it is informative"
        sub="Left: share of lots with each field unknown, by yard (darker = more missing). Right: BRD morbidity when the field is missing vs recorded. A gap means records are not missing at random, which is why the models carry explicit 'unknown' indicators instead of silently imputing."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-[2px] text-[12px]">
          <thead className="text-[10.5px] tracking-wide text-ink-3 uppercase">
            <tr>
              <th className="pb-1 text-left font-medium">Field</th>
              <th className="pb-1 text-right font-medium">All</th>
              {yards.map((y) => (
                <th key={y} className="pb-1 text-center font-medium normal-case">
                  {yardName(y).split(" ").slice(0, 2).join(" ")}
                </th>
              ))}
              <th className="pb-1 pl-4 text-right font-medium">Morbidity if missing</th>
              <th className="pb-1 text-right font-medium">if recorded</th>
              <th className="pb-1 text-right font-medium">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ratioV = r.whenMissing.lots ? r.whenMissing.rate / r.whenPresent.rate : NaN;
              const sig = r.whenMissing.lots > 0 && (r.whenMissing.lo > r.whenPresent.hi || r.whenMissing.hi < r.whenPresent.lo);
              return (
                <tr key={r.field}>
                  <td className="pr-2 text-ink-2">{r.field}</td>
                  <td className="num pr-1 text-right font-semibold">{pct(r.overall)}</td>
                  {yards.map((y) => {
                    const v = r.byYard[y];
                    return (
                      <td key={y} className="num rounded-[4px] py-1 text-center" title={`${yardName(y)}: ${pct(v, 1)} unknown`} style={{ background: `color-mix(in oklab, var(--wheat) ${Math.round(Math.min(1, v / 0.5) * 80)}%, var(--panel-2))` }}>
                        {pct(v)}
                      </td>
                    );
                  })}
                  <td className="num pl-4 text-right">{r.whenMissing.lots ? `${pct(r.whenMissing.rate, 1)} ±${((r.whenMissing.hi - r.whenMissing.rate) * 100).toFixed(1)}` : "—"}</td>
                  <td className="num text-right">{pct(r.whenPresent.rate, 1)}</td>
                  <td className="num text-right font-semibold" style={{ color: sig ? (ratioV > 1 ? "var(--rust)" : "var(--sage)") : "var(--ink-3)" }}>
                    {Number.isFinite(ratioV) ? `×${ratioV.toFixed(2)}${sig ? "" : " ns"}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-ink-3">± = 95% CI half-width (lot-clustered). "ns" = intervals overlap, no clear difference.</div>
    </Card>
  );
}

function ProfileChart({ p }: { p: Profile }) {
  const data = p.cells.map((c) => ({ ...c, err: [c.rate - c.lo, c.hi - c.rate] }));
  const overall = p.cells.reduce((s, c) => s + c.rate * c.head, 0) / p.cells.reduce((s, c) => s + c.head, 0);
  return (
    <div className="card p-3.5">
      <div className="text-[12.5px] font-semibold">{p.label}</div>
      <div className="h-[190px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: data.length > 4 ? 2 : -18, right: 6, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="level" tick={{ fontSize: 9.5 }} interval={0} height={data.length > 4 ? 52 : 24} angle={data.length > 4 ? -35 : 0} textAnchor={data.length > 4 ? "end" : "middle"} />
            <YAxis tickFormatter={(v) => pct(v)} tick={{ fontSize: 10 }} domain={[0, "auto"]} />
            <ReferenceLine y={overall} stroke="var(--ink-3)" strokeDasharray="3 3" />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox>
                    <div className="font-medium">{payload[0].payload.level}</div>
                    <div className="num">
                      Morbidity {pct(payload[0].payload.rate, 1)} ({pct(payload[0].payload.lo, 1)}–{pct(payload[0].payload.hi, 1)})
                    </div>
                    <div className="num text-ink-3">
                      {num(payload[0].payload.lots)} lots · {num(payload[0].payload.head)} head · {pct(payload[0].payload.highRiskShare)} high-risk
                    </div>
                  </TooltipBox>
                ) : null
              }
            />
            <Bar dataKey="rate" fill="var(--sky)" radius={[4, 4, 0, 0]} barSize={22}>
              <ErrorBar dataKey="err" width={5} stroke="var(--ink-2)" strokeWidth={1.2} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {p.note && <div className="mt-1 text-[10.5px] leading-snug text-rust">{p.note}</div>}
    </div>
  );
}

function RiskProfiles({ lots }: { lots: HistoricalLot[] }) {
  const profiles = useMemo(() => riskProfiles(lots), [lots]);
  return (
    <Card>
      <CardHeader
        eyebrow="Univariate risk profiles"
        title="Unadjusted BRD morbidity by risk factor"
        sub="Head-weighted morbidity with 95% cluster-robust CIs (lots are the sampling unit). Dashed line: overall rate. These are raw associations; factors travel together (light cattle are also commingled and unvaccinated), which is what the multivariable models untangle."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {profiles.map((p) => (
          <ProfileChart key={p.id} p={p} />
        ))}
      </div>
    </Card>
  );
}

function Seasonality({ lots }: { lots: HistoricalLot[] }) {
  const data = useMemo(() => monthlySeries(lots).map((m) => ({ ...m, band: [m.lo, m.hi] })), [lots]);
  const [view, setView] = useState<"morbidity" | "meta" | "arrivals">("morbidity");
  return (
    <Card>
      <CardHeader
        eyebrow="Time"
        title="Seasonality and trend"
        sub="Arrivals peak in the fall run (calves off grass), and so does BRD: weaning stress, commingling and weather all coincide."
        right={<Segmented size="sm" value={view} onChange={setView} options={[{ value: "morbidity", label: "BRD morbidity" }, { value: "meta", label: "Metaphylaxis" }, { value: "arrivals", label: "Arrivals" }]} />}
      />
      <div className="h-[280px]">
        <ResponsiveContainer>
          {view !== "arrivals" ? (
            <ComposedChart data={data} margin={{ left: -5, right: 10, top: 10, bottom: 10 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tickFormatter={(v) => pct(v)} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipBox>
                      <div className="font-medium">{payload[0].payload.month}</div>
                      <div className="num">
                        Morbidity {pct(payload[0].payload.morbidity, 1)} ({pct(payload[0].payload.lo, 1)}–{pct(payload[0].payload.hi, 1)})
                      </div>
                      <div className="num">Metaphylaxis on {pct(payload[0].payload.metaShare)} of head</div>
                      <div className="num text-ink-3">{payload[0].payload.lots} lots arrived</div>
                    </TooltipBox>
                  ) : null
                }
              />
              {view === "morbidity" && <Area dataKey="band" stroke="none" fill="var(--rust)" fillOpacity={0.15} isAnimationActive={false} legendType="none" />}
              {view === "morbidity" ? (
                <Line dataKey="morbidity" stroke="var(--rust)" strokeWidth={2} dot={false} isAnimationActive={false} name="BRD morbidity" />
              ) : (
                <Line dataKey="metaShare" stroke="var(--sky)" strokeWidth={2} dot={false} isAnimationActive={false} name="Share of head given metaphylaxis" />
              )}
            </ComposedChart>
          ) : (
            <BarChart data={data} margin={{ left: -5, right: 10, top: 10, bottom: 10 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tickFormatter={(v) => num(v)} />
              <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox><div className="font-medium">{payload[0].payload.month}</div><div className="num">{num(payload[0].payload.head)} head in {payload[0].payload.lots} lots</div></TooltipBox> : null)} />
              <Bar dataKey="head" fill="var(--brand-2)" radius={[3, 3, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="text-[11px] text-ink-3">{view === "morbidity" ? "Head-weighted 45-day morbidity by arrival month; shaded band: 95% CI." : view === "meta" ? "Share of arriving head given metaphylaxis, by month." : "Head arriving per month."}</div>
    </Card>
  );
}

function Confounding({ lots }: { lots: HistoricalLot[] }) {
  const data = useMemo(() => confoundingByWeight(lots), [lots]);
  return (
    <Card>
      <CardHeader
        eyebrow="Why naive comparisons mislead"
        title="Confounding by indication"
        sub="Pooled over all lots, treated lots look sicker than untreated ones (risk profile above). Split by weight, treatment looks protective for light calves but nearly useless for heavy cattle, because heavy lots only get treated when someone expects them to break (hover: buyer-flag rates)."
      />
      <div className="h-[230px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: -10, right: 10, top: 10, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="band" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => pct(v)} />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox>
                    <div className="font-medium">{payload[0].payload.band}</div>
                    <div className="num">
                      Treated: {pct(payload[0].payload.treated, 1)} ({payload[0].payload.treatedLots} lots, {pct(payload[0].payload.buyerFlagTreated)} buyer-flagged)
                    </div>
                    <div className="num">
                      Untreated: {pct(payload[0].payload.untreated, 1)} ({payload[0].payload.untreatedLots} lots, {pct(payload[0].payload.buyerFlagUntreated)} buyer-flagged)
                    </div>
                  </TooltipBox>
                ) : null
              }
            />
            <Bar dataKey="untreated" name="No metaphylaxis" fill="var(--ink-3)" radius={[4, 4, 0, 0]} barSize={18} />
            <Bar dataKey="treated" name="Metaphylaxis given" fill="var(--sky)" radius={[4, 4, 0, 0]} barSize={18} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
        {data.map((d) => (
          <span key={d.band}>
            {d.band}: buyer-flagged <span className="num font-semibold text-ink-2">{pct(d.buyerFlagTreated)}</span> of treated vs <span className="num font-semibold text-ink-2">{pct(d.buyerFlagUntreated)}</span> of untreated
          </span>
        ))}
      </div>
      <Callout tone="info" title="How the tool handles it">
        The risk models include metaphylaxis given as a covariate and still under- or over-estimate its effect (Model lab → learned RR). The decision engine therefore uses an explicit, editable efficacy assumption (RR 0.5, after Rojas et al.) rather than
        trusting a confounded estimate.
      </Callout>
    </Card>
  );
}

function Correlations({ lots }: { lots: HistoricalLot[] }) {
  const m = useMemo(() => spearmanMatrix(lots), [lots]);
  const cell = (a: string, b: string) => m.cells.find((c) => c.a === a && c.b === b)!;
  return (
    <Card>
      <CardHeader
        eyebrow="Structure"
        title="Spearman rank correlations"
        sub="Pairwise-complete lots. Red = move together, blue = opposite; the first column is the outcome. Strong predictor–predictor correlations (e.g. weight and buyer flag) are why univariate profiles overstate single factors."
      />
      <div className="overflow-x-auto">
        <table className="mx-auto border-separate border-spacing-[2px] text-[11px]">
          <thead>
            <tr>
              <th />
              {m.vars.map((v) => (
                <th key={v.id} className="h-24 w-12 align-bottom font-medium text-ink-2">
                  <div className="mx-auto w-4 [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{v.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.vars.map((r) => (
              <tr key={r.id}>
                <td className="pr-2 text-right whitespace-nowrap text-ink-2">{r.label}</td>
                {m.vars.map((c) => {
                  const v = cell(r.id, c.id);
                  const a = Math.min(1, Math.abs(v.rho) / 0.6);
                  const hue = v.rho >= 0 ? "var(--rust)" : "var(--sky)";
                  return (
                    <td
                      key={c.id}
                      title={`${r.label} × ${c.label}: ρ = ${v.rho.toFixed(2)} (n = ${num(v.n)})`}
                      className="num h-9 w-12 rounded-[4px] text-center"
                      style={{ background: r.id === c.id ? "var(--panel-2)" : `color-mix(in oklab, ${hue} ${Math.round(a * 80)}%, var(--panel-2))`, color: a > 0.55 && r.id !== c.id ? "white" : "var(--ink-2)" }}
                    >
                      {r.id === c.id ? "" : v.rho.toFixed(2).replace("0.", ".")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Quality({ lots }: { lots: HistoricalLot[] }) {
  const checks = useMemo(() => qualityChecks(lots), [lots]);
  const icon = { ok: <CheckCircle2 size={15} className="text-sage" />, info: <Info size={15} className="text-sky" />, warn: <AlertTriangle size={15} className="text-wheat" />, error: <XCircle size={15} className="text-rust" /> };
  const failing = checks.filter((c) => c.severity === "error" || c.severity === "warn").length;
  return (
    <Card>
      <CardHeader
        eyebrow="Data quality"
        title="Record validation report"
        sub="Integrity rules applied to every historical record; the CSV importer applies the same range checks to uploaded lots."
        right={<Badge tone={failing ? "bad" : "good"}>{failing ? `${failing} failing` : "All integrity checks pass"}</Badge>}
      />
      <table className="w-full text-[12.5px]">
        <tbody className="divide-y divide-line">
          {checks.map((c) => (
            <tr key={c.check}>
              <td className="w-6 py-1.5">{icon[c.severity]}</td>
              <td className="py-1.5 font-medium">{c.check}</td>
              <td className="py-1.5 text-ink-3">{c.rule}</td>
              <td className="num py-1.5 text-right">{c.failures === 0 ? "0" : `${num(c.failures)} (${pct(c.failures / lots.length, 1)})`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[11px] text-ink-3">Blue rows are expected gaps (incomplete histories, missing weather), handled by the models rather than errors. Seed {META.seed}.</div>
    </Card>
  );
}

function Drift({ lots }: { lots: HistoricalLot[] }) {
  const rows = useMemo(() => driftReport(lots, "2025-01-01"), [lots]);
  return (
    <Card>
      <CardHeader
        eyebrow="Is the holdout like the training data?"
        title="Covariate drift: 2023–24 vs 2025 arrivals"
        sub="Standardized mean difference (|SMD| > 0.1 notable, > 0.25 large) and population stability index (PSI > 0.1 moderate, > 0.25 major shift). Small values mean the temporal holdout tests the model on familiar inputs. This table cannot see concept drift (the same inputs carrying a different risk); that shows up instead as the gap between cross-validated and holdout AUC in the Model Lab."
      />
      <table className="w-full text-[12.5px]">
        <thead className="border-b border-line text-[10.5px] tracking-wide text-ink-3 uppercase">
          <tr className="text-right">
            <th className="py-1.5 text-left font-medium">Variable</th>
            <th className="py-1.5 font-medium">2023–24</th>
            <th className="py-1.5 font-medium">2025</th>
            <th className="py-1.5 font-medium">SMD</th>
            <th className="py-1.5 font-medium">PSI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const big = Math.abs(r.smd) > 0.25 || r.psi > 0.25;
            const mid = Math.abs(r.smd) > 0.1 || r.psi > 0.1;
            const share = PCT_VARS.has(r.variable);
            const fmt = (v: number) => (share ? pct(v, 1) : Math.abs(v) >= 100 ? num(v) : Math.abs(v) >= 1.5 ? v.toFixed(1) : v.toFixed(2));
            return (
              <tr key={r.variable} className="text-right">
                <td className="py-1.5 text-left">{r.variable}</td>
                <td className="num py-1.5 text-ink-2">{fmt(r.train)}</td>
                <td className="num py-1.5 text-ink-2">{fmt(r.test)}</td>
                <td className="num py-1.5 font-semibold" style={{ color: big ? "var(--rust)" : mid ? "var(--wheat)" : undefined }}>
                  {r.smd >= 0 ? "+" : "−"}
                  {Math.abs(r.smd).toFixed(2)}
                </td>
                <td className="num py-1.5">{Number.isFinite(r.psi) ? r.psi.toFixed(3) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
