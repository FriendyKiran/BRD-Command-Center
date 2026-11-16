import { Database, FlaskConical, RefreshCcw, ShieldCheck, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ModelDot, ModelLegend, ModelName, ModelPicker, modelColor, TreeRules } from "../components/modelviz";
import { Badge, Button, Callout, Card, CardHeader, PageHeader, Segmented, SliderRow, Spinner, Stat, TooltipBox } from "../components/ui";
import { BACKTEST, DEFAULT_MODEL, loadEvaluation, loadHistory, META, type Evaluation } from "../data";
import { FEATURES } from "../engine/features";
import {
  bootstrapAuc,
  brierBinary,
  brierSkillMorbidity,
  calibrationDeciles,
  calibrationFit,
  decisionCurve,
  gainsCurve,
  prCurve,
  rocCurve,
  subgroupMetrics,
  thresholdStats,
  youdenThreshold,
} from "../engine/evaluation";
import { kindOf, LINEAR_KINDS, type FittedModel, type ModelKind } from "../engine/model";
import type { HistoricalLot } from "../engine/types";
import { YARD_INDEX, YARDS } from "../engine/yards";
import { MODEL_SPEC, MODEL_SPECS, type ZooOptions } from "../engine/zoo";
import { num, pct, usd } from "../lib/format";
import { trainInWorker } from "../state/engine";
import { useActiveModel, useModelCache } from "../state/models";
import { useApp } from "../state/store";

type Tab = "compare" | "evaluate" | "decisions" | "train";

const POLICY_LABEL: Record<string, string> = {
  tool: `This tool (default, $${BACKTEST.amuPenalty}/regimen stewardship weight)`,
  toolEconomic: "This tool, pure economics ($0/regimen)",
  statusQuo: "Current yard SOPs",
  blanket: "Blanket premium metaphylaxis",
  none: "No metaphylaxis",
  buyerFlag: "Order buyer's call",
  oracle: "Perfect information (upper bound)",
};

const axisLabel = (value: string) => ({ value, position: "insideBottom" as const, offset: -5, fill: "var(--ink-3)", fontSize: 11 });

export default function ModelPage() {
  const [tab, setTab] = useState<Tab>("compare");
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [evalKind, setEvalKind] = useState<ModelKind | null>(null);
  const { kind: activeKind, ready, progress } = useActiveModel();
  const setModelKind = useApp((s) => s.setModelKind);
  const custom = useApp((s) => s.customModel);
  const setCustomModel = useApp((s) => s.setCustomModel);
  useEffect(() => {
    loadEvaluation().then(setEv);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidence"
        title="Model lab"
        sub="Seven risk models trained on the same records, validated on the same 2025 holdout, and judged by the decisions they lead to, not just by accuracy. Pick the model the decision engine uses."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">
              <span className="inline-flex items-center gap-1.5">
                Engine uses: <ModelName kind={activeKind} short />
                {!ready && <Spinner size={11} />}
                {!ready && progress != null && <span className="num">{Math.round(progress * 100)}%</span>}
              </span>
            </Badge>
            {custom && kindOf(custom) === activeKind && (
              <Button size="sm" onClick={() => setCustomModel(null)}>
                Discard retrained model
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "compare", label: "Compare models" },
            { value: "evaluate", label: "Evaluate in depth" },
            { value: "decisions", label: "Decision backtest" },
            { value: "train", label: "Inspect & retrain" },
          ]}
        />
        <div className="text-[11.5px] text-ink-3">Temporal holdout: train on arrivals before 2025-01-01, test on {ev ? num(ev.test.length) : "…"} lots arriving in 2025 · high-risk = 45-day morbidity ≥ 15 %</div>
      </div>
      {!ev ? (
        <div className="flex items-center gap-2 p-8 text-ink-3">
          <Spinner /> Loading evaluation results…
        </div>
      ) : tab === "compare" ? (
        <Compare
          ev={ev}
          activeKind={activeKind}
          onUse={setModelKind}
          onInspect={(k) => {
            setEvalKind(k);
            setTab("evaluate");
          }}
        />
      ) : tab === "evaluate" ? (
        <Evaluate ev={ev} initial={evalKind ?? activeKind} />
      ) : tab === "decisions" ? (
        <Decisions ev={ev} />
      ) : (
        <Train ev={ev} activeKind={activeKind} />
      )}
    </div>
  );
}

// ── Compare ──────────────────────────────────────────────────────────────────

function Compare({ ev, activeKind, onUse, onInspect }: { ev: Evaluation; activeKind: ModelKind; onUse: (k: ModelKind) => void; onInspect: (k: ModelKind) => void }) {
  const labels = useMemo(() => ev.test.map((l) => l.highRisk), [ev]);
  const [sel, setSel] = useState<ModelKind[]>(() => MODEL_SPECS.map((s) => s.kind));
  const toggle = (k: ModelKind) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : MODEL_SPECS.map((x) => x.kind).filter((x) => x === k || s.includes(x))));
  const shown = ev.models.filter((m) => sel.includes(m.kind));
  const single = shown.length === 1 ? shown[0].kind : null;
  const width = (k: ModelKind) => (single ? 2.6 : k === activeKind ? 2.6 : 1.6);
  const training = useModelCache((s) => s.training);
  const stats = useMemo(() => {
    const scores = Object.fromEntries(ev.models.map((m) => [m.kind, m.metrics.scores!]));
    const boot = bootstrapAuc({ ...scores, buyer: ev.test.map((l) => (l.buyer ? 1 : 0)) }, labels, "logit", 400);
    return ev.models.map((m) => {
      const s = m.metrics.scores!;
      return {
        m,
        boot: boot[m.kind],
        ap: prCurve(s, labels).ap,
        bss: brierSkillMorbidity(s, ev.test).skill,
        cal: calibrationFit(s, ev.test),
        bt: BACKTEST.models?.find((b) => b.kind === m.kind),
      };
    });
  }, [ev, labels]);
  const buyerBoot = useMemo(() => bootstrapAuc({ logit: ev.models[0].metrics.scores!, buyer: ev.test.map((l) => (l.buyer ? 1 : 0)) }, labels, "logit", 400).buyer, [ev, labels]);
  const best = [...stats].sort((a, b) => a.m.metrics.logLoss! - b.m.metrics.logLoss!)[0];
  const rojas = stats.find((s) => s.m.kind === "rojas")!;
  const logit = stats.find((s) => s.m.kind === "logit")!;
  const prevalence = labels.filter(Boolean).length / labels.length;

  const rocs = useMemo(() => ev.models.map((m) => ({ kind: m.kind, data: rocCurve(m.metrics.scores!, labels) })), [ev, labels]);
  const prs = useMemo(() => ev.models.map((m) => ({ kind: m.kind, data: prCurve(m.metrics.scores!, labels).curve })), [ev, labels]);
  const groups = ev.models[0].metrics.importance!.map((g) => g.group);
  const valuesOf = (f: (s: (typeof stats)[number]) => string) => Object.fromEntries(stats.map((s) => [s.m.kind, f(s)])) as Partial<Record<ModelKind, string>>;
  const legend = (values?: Partial<Record<ModelKind, string>>, kinds?: ModelKind[]) => <ModelLegend kinds={kinds} selected={sel} onToggle={toggle} values={values} />;
  const focus = single ? stats.find((s) => s.m.kind === single)! : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Best holdout log loss" value={MODEL_SPEC[best.m.kind].short} icon={<Trophy size={14} />} tone="good" sub={`AUC ${best.m.metrics.auc.toFixed(3)} · log loss ${best.m.metrics.logLoss!.toFixed(4)}`} />
        <Stat label="Richer records vs Rojas predictors" value={`+${(logit.m.metrics.auc - rojas.m.metrics.auc).toFixed(3)} AUC`} icon={<Database size={14} />} sub={`${rojas.m.metrics.auc.toFixed(3)} with Rojas's predictors (paper: 0.785)`} />
        <Stat label="Best model vs order buyer" value={`${logit.m.metrics.auc.toFixed(3)} vs ${logit.m.metrics.aucBuyer.toFixed(3)}`} icon={<ShieldCheck size={14} />} sub={`buyer 95% CI ${buyerBoot.lo.toFixed(3)}–${buyerBoot.hi.toFixed(3)}`} />
        <Stat label="High-risk lots in holdout" value={pct(prevalence, 1)} icon={<FlaskConical size={14} />} sub={`${labels.filter(Boolean).length} of ${labels.length} lots · PR baseline`} />
      </div>

      <Card>
        <CardHeader
          eyebrow="Leaderboard"
          title="Every model on the same holdout"
          sub="AUC with paired-bootstrap 95% CIs (400 resamples of lots); Δ vs the penalized logistic with its CI and bootstrap p-value. Lower log loss and ECE are better; calibration slope near 1 means predictions are neither too extreme nor too timid."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-[12.5px]">
            <thead className="border-b border-line text-[10.5px] tracking-wide text-ink-3 uppercase">
              <tr className="text-right">
                <th className="py-2 text-left font-medium">Model</th>
                <th className="py-2 pl-3 font-medium">AUC [95% CI]</th>
                <th className="py-2 pl-3 font-medium">Δ AUC vs logistic</th>
                <th className="py-2 pl-3 font-medium">5-fold CV AUC</th>
                <th className="py-2 pl-3 font-medium">PR-AUC</th>
                <th className="py-2 pl-3 font-medium">Log loss</th>
                <th className="py-2 pl-3 font-medium">Brier skill</th>
                <th className="py-2 pl-3 font-medium">ECE</th>
                <th className="py-2 pl-3 font-medium">Cal. slope</th>
                <th className="py-2 pl-3 font-medium">Δ $/hd vs SOP</th>
                <th className="py-2 pl-3 font-medium">Train</th>
                <th className="py-2 pl-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stats.map(({ m, boot, ap, bss, cal, bt }) => (
                <tr key={m.kind} className={m.kind === activeKind ? "bg-sky-soft/40" : ""}>
                  <td className="py-2 text-left">
                    <div className="font-medium">
                      <ModelName kind={m.kind} />
                    </div>
                    <div className="pl-4 text-[10.5px] text-ink-3">{MODEL_SPEC[m.kind].family}</div>
                  </td>
                  <td className="num py-2 pl-3 text-right">
                    <span className="font-semibold">{m.metrics.auc.toFixed(3)}</span> <span className="text-ink-3">[{boot.lo.toFixed(3)}–{boot.hi.toFixed(3)}]</span>
                  </td>
                  <td className="num py-2 pl-3 text-right">
                    {m.kind === "logit" ? (
                      <span className="text-ink-3">reference</span>
                    ) : (
                      <span title={`95% CI ${boot.diffLo.toFixed(3)} to ${boot.diffHi.toFixed(3)}`}>
                        {boot.diff >= 0 ? "+" : "−"}
                        {Math.abs(boot.diff).toFixed(3)} <span className="text-ink-3">p {boot.p < 0.001 ? "<0.001" : boot.p.toFixed(2)}</span>
                      </span>
                    )}
                  </td>
                  <td className="num py-2 pl-3 text-right">
                    {m.cv.aucMean.toFixed(3)} <span className="text-ink-3">± {m.cv.aucSd.toFixed(3)}</span>
                  </td>
                  <td className="num py-2 pl-3 text-right">{ap.toFixed(3)}</td>
                  <td className="num py-2 pl-3 text-right">{m.metrics.logLoss!.toFixed(4)}</td>
                  <td className="num py-2 pl-3 text-right">{pct(bss, 1)}</td>
                  <td className="num py-2 pl-3 text-right">{(m.metrics.ece! * 100).toFixed(2)} pt</td>
                  <td className="num py-2 pl-3 text-right" style={{ color: Math.abs(cal.slope - 1) > 0.2 ? "var(--rust)" : undefined }}>
                    {cal.slope.toFixed(2)}
                  </td>
                  <td className="num py-2 pl-3 text-right font-semibold">{bt ? usd(bt.valueDef, { d: 2, sign: true }) : "—"}</td>
                  <td className="num py-2 pl-3 text-right text-ink-3">{m.trainMs < 1000 ? `${Math.round(m.trainMs)} ms` : `${(m.trainMs / 1000).toFixed(1)} s`}</td>
                  <td className="py-2 pl-3 text-right">
                    {m.kind === activeKind ? (
                      <Badge tone="good">In use</Badge>
                    ) : (
                      <Button size="sm" onClick={() => onUse(m.kind)} disabled={training[m.kind] != null}>
                        {training[m.kind] != null ? <Spinner size={11} /> : "Use"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="text-ink-2">
                <td className="py-2 text-left">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rotate-45 bg-ink-3" /> Order buyer's high-risk call
                  </span>
                  <div className="pl-4 text-[10.5px] text-ink-3">Human baseline (binary)</div>
                </td>
                <td className="num py-2 pl-3 text-right">
                  {logit.m.metrics.aucBuyer.toFixed(3)} <span className="text-ink-3">[{buyerBoot.lo.toFixed(3)}–{buyerBoot.hi.toFixed(3)}]</span>
                </td>
                <td className="num py-2 pl-3 text-right">
                  −{Math.abs(buyerBoot.diff).toFixed(3)} <span className="text-ink-3">p {buyerBoot.p < 0.001 ? "<0.001" : buyerBoot.p.toFixed(2)}</span>
                </td>
                <td colSpan={9} className="py-2 pl-3 text-right text-[11px] text-ink-3">
                  A yes/no call has no probability, so ranking and calibration metrics do not apply.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[11px] text-ink-3">
          Δ $/hd vs SOP: each model drives the full decision engine (default stewardship weight) on the 2025 lots, scored against the hidden truth (see Decision backtest). Cross-validation uses 5 random folds of all {num(ev.trainLots + ev.test.length)} historical lots.
        </div>
        {logit.m.cv.aucMean - logit.m.metrics.auc > 0.02 && (
          <div className="mt-3">
            <Callout tone="info" title="Why cross-validation looks better than the holdout">
              Random 5-fold CV ({logit.m.cv.aucMean.toFixed(3)}) is more optimistic than the 2025 holdout ({logit.m.metrics.auc.toFixed(3)}). Random folds share outbreak periods and seasons with their training lots, and 2025 cattle carry a slightly different risk for the same records. The temporal holdout is the honest estimate of how a model trained today would do next season.
            </Callout>
          </div>
        )}
      </Card>

      <div className="no-print sticky top-[58px] z-20 -mx-1 rounded-xl border border-line bg-bg/90 px-3 py-2.5 backdrop-blur">
        <ModelPicker selected={sel} onChange={setSel} active={activeKind} />
        {focus ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2 text-[12px] text-ink-2">
            <span className="font-semibold text-ink">
              <ModelName kind={focus.m.kind} />
            </span>
            <span>
              AUC <span className="num font-semibold">{focus.m.metrics.auc.toFixed(3)}</span> <span className="num text-ink-3">[{focus.boot.lo.toFixed(3)}–{focus.boot.hi.toFixed(3)}]</span>
            </span>
            <span>
              PR-AUC <span className="num font-semibold">{focus.ap.toFixed(3)}</span>
            </span>
            <span>
              log loss <span className="num font-semibold">{focus.m.metrics.logLoss!.toFixed(4)}</span>
            </span>
            <span>
              ECE <span className="num font-semibold">{(focus.m.metrics.ece! * 100).toFixed(2)} pt</span>
            </span>
            <span>
              cal. slope <span className="num font-semibold">{focus.cal.slope.toFixed(2)}</span>
            </span>
            {focus.bt && (
              <span>
                Δ value <span className="num font-semibold">{usd(focus.bt.valueDef, { d: 2, sign: true })}/hd</span>
              </span>
            )}
            <Button size="sm" className="ml-auto" onClick={() => onInspect(focus.m.kind)}>
              Thresholds, decision curve & subgroups →
            </Button>
          </div>
        ) : (
          <div className="mt-1.5 text-[11px] text-ink-3">Tick models to overlay them, click “only” to read one model on its own, or click any chart legend entry to hide or show that model.</div>
        )}
      </div>

      {shown.length === 0 && <Callout tone="info">No models selected. Pick at least one above to draw the comparison plots.</Callout>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            eyebrow="Discrimination"
            title={single ? `ROC curve · ${MODEL_SPEC[single].short}` : "ROC curves"}
            sub={single ? `Shaded area = AUC ${focus!.m.metrics.auc.toFixed(3)}: the chance a random high-risk lot is ranked above a random low-risk one. Diamond: the order buyer's call.` : "Ranking lots by risk: higher and further left is better. Diamond: the order buyer's call."}
          />
          <div className="h-[300px]">
            <ResponsiveContainer>
              <ComposedChart margin={{ left: 0, right: 15, top: 10, bottom: 10 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="fpr" domain={[0, 1]} tickFormatter={(v) => pct(v)} label={axisLabel("false-positive rate")} allowDuplicatedCategory={false} />
                <YAxis type="number" domain={[0, 1]} tickFormatter={(v) => pct(v)} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--line-strong)" strokeDasharray="4 4" />
                <Tooltip content={<CurveTip x="fpr" y="tpr" xl="FPR" yl="TPR" />} />
                {single && <Area data={rocs.find((r) => r.kind === single)!.data} dataKey="tpr" name={`${single}-area`} type="stepAfter" stroke="none" fill={modelColor(single)} fillOpacity={0.12} isAnimationActive={false} tooltipType="none" />}
                {rocs
                  .filter((r) => sel.includes(r.kind))
                  .map((r) => (
                    <Line key={r.kind} data={r.data} dataKey="tpr" name={r.kind} stroke={modelColor(r.kind)} strokeWidth={width(r.kind)} dot={false} type="stepAfter" isAnimationActive={false} />
                  ))}
                <ReferenceDot x={logit.m.metrics.rocBuyer.fpr} y={logit.m.metrics.rocBuyer.tpr} r={6} fill="var(--ink-3)" stroke="var(--panel)" strokeWidth={2} shape={(p: { cx?: number; cy?: number }) => <path d={`M${p.cx} ${(p.cy ?? 0) - 7}l7 7-7 7-7-7z`} fill="var(--ink-2)" stroke="var(--panel)" strokeWidth={2} />} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {legend(valuesOf((s) => `AUC ${s.m.metrics.auc.toFixed(3)}`))}
        </Card>
        <Card>
          <CardHeader
            eyebrow="Rare-event view"
            title={single ? `Precision–recall · ${MODEL_SPEC[single].short}` : "Precision–recall curves"}
            sub={`Of the lots a model flags, how many truly go high-risk? The dashed line is the ${pct(prevalence, 1)} base rate, so precision well above it is real lift.${single ? ` Shaded area = average precision ${focus!.ap.toFixed(3)}.` : ""}`}
          />
          <div className="h-[300px]">
            <ResponsiveContainer>
              <ComposedChart margin={{ left: 0, right: 15, top: 10, bottom: 10 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="recall" domain={[0, 1]} tickFormatter={(v) => pct(v)} label={axisLabel("recall (sensitivity)")} allowDuplicatedCategory={false} />
                <YAxis type="number" domain={[0, 1]} tickFormatter={(v) => pct(v)} />
                <ReferenceLine y={prevalence} stroke="var(--line-strong)" strokeDasharray="4 4" />
                <Tooltip content={<CurveTip x="recall" y="precision" xl="Recall" yl="Precision" />} />
                {single && <Area data={prs.find((r) => r.kind === single)!.data} dataKey="precision" name={`${single}-area`} stroke="none" fill={modelColor(single)} fillOpacity={0.12} isAnimationActive={false} tooltipType="none" />}
                {prs
                  .filter((r) => sel.includes(r.kind))
                  .map((r) => (
                    <Line key={r.kind} data={r.data} dataKey="precision" name={r.kind} stroke={modelColor(r.kind)} strokeWidth={width(r.kind)} dot={false} isAnimationActive={false} />
                  ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {legend(valuesOf((s) => `AP ${s.ap.toFixed(3)}`))}
        </Card>
        <Card>
          <CardHeader eyebrow="Calibration" title="Predicted vs observed morbidity by decile" sub="Each line joins ten groups of holdout lots ranked by predicted risk (head-weighted). On the diagonal = the predicted percentage is the percentage that got sick." />
          <div className="h-[300px]">
            <ResponsiveContainer>
              <LineChart margin={{ left: 0, right: 15, top: 10, bottom: 10 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="predicted" domain={[0, 0.3]} ticks={[0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]} tickFormatter={(v) => pct(v)} label={axisLabel("predicted morbidity")} allowDuplicatedCategory={false} />
                <YAxis type="number" domain={[0, 0.3]} ticks={[0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]} tickFormatter={(v) => pct(v)} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 0.3, y: 0.3 }]} stroke="var(--line-strong)" strokeDasharray="4 4" ifOverflow="hidden" />
                <Tooltip content={<CurveTip x="predicted" y="observed" xl="Predicted" yl="Observed" />} />
                {shown.map((m) => (
                  <Line key={m.kind} data={m.metrics.calibration} dataKey="observed" name={m.kind} stroke={modelColor(m.kind)} strokeWidth={single ? 2.4 : m.kind === activeKind ? 2.4 : 1.4} dot={{ r: single ? 4.5 : 2.5, strokeWidth: single ? 2 : 0, stroke: "var(--panel)", fill: modelColor(m.kind) }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {legend(valuesOf((s) => `ECE ${(s.m.metrics.ece! * 100).toFixed(1)} pt`))}
        </Card>
        <Card>
          <CardHeader eyebrow="What each model relies on" title="Permutation importance by risk factor" sub="Increase in holdout log loss (×1000) when one risk-factor group is shuffled across lots. Darker = the model leans on it more. Model-agnostic, so linear and tree models are comparable." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-[11px]">
              <thead>
                <tr>
                  <th />
                  {shown.map((m) => (
                    <th key={m.kind} className="pb-1 text-center font-medium text-ink-2">
                      <div className="flex flex-col items-center gap-1">
                        <ModelDot kind={m.kind} />
                        {MODEL_SPEC[m.kind].short}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g}>
                    <td className="pr-2 text-right whitespace-nowrap text-ink-2">{g}</td>
                    {shown.map((m) => {
                      const v = m.metrics.importance!.find((i) => i.group === g)!.value * 1000;
                      const a = Math.max(0, Math.min(1, v / 20));
                      return (
                        <td
                          key={m.kind}
                          title={`${MODEL_SPEC[m.kind].short} · ${g}: +${v.toFixed(2)} ×10⁻³ log loss`}
                          className="num rounded-[4px] px-1 py-1 text-center"
                          style={{ background: `color-mix(in oklab, var(--sky) ${Math.round(a * 85)}%, var(--panel-2))`, color: a > 0.5 ? "white" : "var(--ink-2)" }}
                        >
                          {v < 0.05 ? "·" : v.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-ink-3">
            · = no measurable effect on the holdout. Arrival season scores zero because the 2025 holdout contains only January–September arrivals (outcomes need 45 days, and the
            snapshot is dated 20 October). The strongest season effect, the October–December fall run (×{Math.exp(DEFAULT_MODEL.coef[1 + FEATURES.findIndex((f) => f.name === "q4")]).toFixed(2)} odds vs April–June in the logistic model), is learned
            from the 2023 and 2024 fall runs and cannot be tested on this holdout.
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader eyebrow="Is more data worth it?" title="Learning curves" sub="Holdout AUC when each model is trained on a random fraction of the pre-2025 lots. A curve still rising at the right edge would gain from more records." />
          <div className="h-[280px]">
            <ResponsiveContainer>
              <LineChart margin={{ left: 0, right: 15, top: 10, bottom: 10 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="lots" domain={["dataMin", "dataMax"]} tickFormatter={(v) => num(v)} label={axisLabel("training lots")} allowDuplicatedCategory={false} />
                <YAxis type="number" domain={[0.6, 0.85]} ticks={[0.6, 0.65, 0.7, 0.75, 0.8, 0.85]} tickFormatter={(v) => v.toFixed(2)} />
                <Tooltip content={<CurveTip x="lots" y="auc" xl="Lots" yl="AUC" fx={(v) => num(v)} fy={(v) => v.toFixed(3)} />} />
                {shown
                  .filter((m) => m.learningCurve.length)
                  .map((m) => (
                    <Line key={m.kind} data={m.learningCurve} dataKey="auc" name={m.kind} stroke={modelColor(m.kind)} strokeWidth={single ? 2.4 : 1.8} dot={{ r: 3, strokeWidth: 0, fill: modelColor(m.kind) }} isAnimationActive={false} />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {legend(
            Object.fromEntries(ev.models.filter((m) => m.learningCurve.length).map((m) => [m.kind, `${m.learningCurve[0].auc.toFixed(3)} → ${m.learningCurve[m.learningCurve.length - 1].auc.toFixed(3)}`])),
            ev.models.filter((m) => m.learningCurve.length).map((m) => m.kind),
          )}
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODEL_SPECS.map((s) => (
            <div key={s.kind} className={`card p-3.5 ${s.kind === activeKind ? "ring-2 ring-sky/50" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-semibold">
                  <ModelName kind={s.kind} />
                </div>
                <Badge>{s.family}</Badge>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">{s.description}</p>
              <div className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
                <div>
                  <span className="font-semibold text-sage">+</span> {s.strengths}
                </div>
                <div>
                  <span className="font-semibold text-rust">−</span> {s.cautions}
                </div>
                <div className="mt-1 italic">Uncertainty: {s.uncertainty}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CurveTip({ active, payload, x, y, xl, yl, fx = (v: number) => pct(v, 1), fy = (v: number) => pct(v, 1) }: {
  active?: boolean;
  payload?: { name?: string; payload: Record<string, number>; color?: string }[];
  x: string;
  y: string;
  xl: string;
  yl: string;
  fx?: (v: number) => string;
  fy?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipBox>
      <div className="mb-1 text-ink-3">
        {xl} <span className="num">{fx(payload[0].payload[x])}</span>
      </div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <ModelDot kind={p.name as ModelKind} size={7} />
          <span className="text-ink-2">{MODEL_SPEC[p.name as ModelKind]?.short ?? p.name}</span>
          <span className="num ml-auto pl-3 font-semibold">
            {yl} {fy(p.payload[y])}
          </span>
        </div>
      ))}
    </TooltipBox>
  );
}

// ── Evaluate one model in depth ──────────────────────────────────────────────

function Evaluate({ ev, initial }: { ev: Evaluation; initial: ModelKind }) {
  const [kind, setKind] = useState<ModelKind>(initial);
  const custom = useApp((s) => s.customModel);
  const res = ev.models.find((m) => m.kind === kind)!;
  const metrics = custom && kindOf(custom) === kind && custom.metrics?.scores ? custom.metrics : res.metrics;
  const labels = useMemo(() => ev.test.map((l) => l.highRisk), [ev]);
  const s = metrics.scores!;
  const ph = metrics.pHigh!;
  const youden = useMemo(() => youdenThreshold(ph, labels), [ph, labels]);
  const buyerShare = ev.test.filter((l) => l.buyer).length / ev.test.length;
  const buyerThr = useMemo(() => [...ph].sort((a, b) => b - a)[Math.floor(buyerShare * ph.length)], [ph, buyerShare]);
  const [thr, setThr] = useState(0.4);
  const st = thresholdStats(ph, labels, thr);
  const buyerSt = thresholdStats(ev.test.map((l) => (l.buyer ? 1 : 0)), labels, 0.5);
  const dca = useMemo(() => {
    const pts = Array.from({ length: 30 }, (_, i) => 0.03 + i * 0.02);
    const buyer = decisionCurve(ev.test.map((l) => (l.buyer ? 1 : 0)), labels, pts);
    return decisionCurve(ph, labels, pts).map((d, i) => ({ ...d, buyer: buyer[i].model }));
  }, [ph, labels, ev]);
  const gains = useMemo(() => {
    const g = gainsCurve(s, labels);
    return g.map((p) => ({ ...p, random: p.share }));
  }, [s, labels]);
  const subgroup = useMemo(() => subgroupMetrics(s, ev.test), [s, ev]);
  const cal = useMemo(() => calibrationFit(s, ev.test), [s, ev]);
  const bb = useMemo(() => brierBinary(ph, labels), [ph, labels]);
  const dist = useMemo(() => {
    const bins = 20;
    const rows = Array.from({ length: bins }, (_, b) => ({ bin: `${b * 5}–${b * 5 + 5}%`, x: b / bins, high: 0, low: 0 }));
    ph.forEach((p, i) => {
      const b = Math.min(bins - 1, Math.floor(p * bins));
      if (labels[i]) rows[b].high++;
      else rows[b].low++;
    });
    return rows;
  }, [ph, labels]);
  const deciles = useMemo(() => calibrationDeciles(s, ev.test), [s, ev]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink-3">Model:</span>
        {MODEL_SPECS.map((m) => (
          <button
            key={m.kind}
            onClick={() => setKind(m.kind)}
            className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${kind === m.kind ? "border-ink bg-panel text-ink shadow-card" : "border-line text-ink-3 hover:text-ink"}`}
          >
            <ModelName kind={m.kind} short />
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="AUC (high-risk lots)" value={metrics.auc.toFixed(3)} sub={`CV ${res.cv.aucMean.toFixed(3)} ± ${res.cv.aucSd.toFixed(3)}`} />
        <Stat label="PR-AUC (avg precision)" value={prCurve(s, labels).ap.toFixed(3)} sub={`base rate ${pct(labels.filter(Boolean).length / labels.length, 1)}`} />
        <Stat label="Calibration slope / CITL" value={`${cal.slope.toFixed(2)} / ${cal.citl >= 0 ? "+" : ""}${cal.citl.toFixed(2)}`} tone={Math.abs(cal.slope - 1) < 0.15 && Math.abs(cal.citl) < 0.1 ? "good" : "warn"} sub="ideal 1 / 0 (log-odds)" />
        <Stat label="Brier, P(high-risk)" value={bb.brier.toFixed(4)} sub={`skill ${pct(bb.skill, 1)} vs base rate`} />
        <Stat label="Learned premium RR" value={metrics.metaRREstimate.premium.toFixed(2)} sub={`economy ${metrics.metaRREstimate.economy.toFixed(2)} · biased by confounding`} />
      </div>

      <Card>
        <CardHeader
          eyebrow="Operating point"
          title="Threshold explorer"
          sub="Flag a lot as high-risk when the model's probability of ≥ 15 % morbidity exceeds the threshold. Move it to trade missed high-risk lots against false alarms."
        />
        <div className="grid gap-6 lg:grid-cols-[1fr_300px_1fr]">
          <div className="space-y-3">
            <SliderRow label="P(high-risk) threshold" value={thr} min={0.02} max={0.95} step={0.01} onChange={setThr} format={(v) => pct(v)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setThr(+youden.threshold.toFixed(2))}>
                Youden-optimal ({pct(youden.threshold)})
              </Button>
              <Button size="sm" onClick={() => setThr(+buyerThr.toFixed(2))}>
                Same flag rate as buyers ({pct(buyerShare)})
              </Button>
            </div>
            <table className="w-full text-[12.5px]">
              <thead className="text-[10.5px] tracking-wide text-ink-3 uppercase">
                <tr className="text-right">
                  <th className="py-1 text-left font-medium">Metric</th>
                  <th className="py-1 font-medium">Model</th>
                  <th className="py-1 font-medium">Buyer call</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(
                  [
                    ["Lots flagged", "flagged"],
                    ["Sensitivity (recall)", "sensitivity"],
                    ["Specificity", "specificity"],
                    ["PPV (precision)", "ppv"],
                    ["NPV", "npv"],
                    ["F1", "f1"],
                    ["Accuracy", "accuracy"],
                  ] as const
                ).map(([l, k]) => (
                  <tr key={k}>
                    <td className="py-1 text-ink-2">{l}</td>
                    <td className="num py-1 text-right font-semibold">{k === "f1" ? st[k].toFixed(3) : pct(st[k], 1)}</td>
                    <td className="num py-1 text-right text-ink-3">{k === "f1" ? buyerSt[k].toFixed(3) : pct(buyerSt[k], 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="mb-2 text-center text-[11px] text-ink-3">Confusion matrix · {ev.test.length} holdout lots</div>
            <div className="grid grid-cols-[auto_1fr_1fr] gap-1 text-center text-[12px]">
              <div />
              <div className="text-[10.5px] text-ink-3 uppercase">Went high-risk</div>
              <div className="text-[10.5px] text-ink-3 uppercase">Stayed low</div>
              <div className="self-center text-[10.5px] text-ink-3 uppercase [writing-mode:vertical-rl] rotate-180">Flagged</div>
              <Cell n={st.tp} label="True positive" tone="good" />
              <Cell n={st.fp} label="False alarm" tone="warn" />
              <div className="self-center text-[10.5px] text-ink-3 uppercase [writing-mode:vertical-rl] rotate-180">Not flagged</div>
              <Cell n={st.fn} label="Missed" tone="bad" />
              <Cell n={st.tn} label="True negative" tone="neutral" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              Accuracy is misleading here: calling every lot low-risk would score {pct(1 - labels.filter(Boolean).length / labels.length, 1)} (Rojas et al. make the same point). Use sensitivity/PPV, or better, the decision curve.
            </p>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-ink-3">Distribution of P(high-risk) by what actually happened</div>
            <div className="h-[230px]">
              <ResponsiveContainer>
                <BarChart data={dist} margin={{ left: -10, right: 8, top: 5, bottom: 5 }} barGap={0} barCategoryGap={1}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="x" tickFormatter={(v) => pct(v)} interval={3} />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox><div className="text-ink-3">P(high-risk) {payload[0].payload.bin}</div><div className="num">Went high-risk: {payload[0].payload.high}</div><div className="num">Stayed low: {payload[0].payload.low}</div></TooltipBox> : null)} />
                  <Bar dataKey="low" stackId="a" fill="var(--sage)" name="Stayed low" />
                  <Bar dataKey="high" stackId="a" fill="var(--rust)" radius={[3, 3, 0, 0]} name="Went high-risk" />
                  <ReferenceLine x={Math.floor(thr * 20) / 20} stroke="var(--ink)" strokeDasharray="3 3" />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            eyebrow="Clinical usefulness"
            title="Decision curve (net benefit)"
            sub="x-axis: the P(high-risk) at which you would act on a lot. Net benefit = true positives − false positives × odds of that threshold, per lot. Above the other lines = using the model beats treating every lot, treating none (zero line), or following the buyer."
          />
          <div className="h-[280px]">
            <ResponsiveContainer>
              <LineChart data={dca} margin={{ left: 0, right: 15, top: 10, bottom: 10 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="pt" domain={[0.03, 0.61]} ticks={[0.05, 0.15, 0.25, 0.35, 0.45, 0.55]} tickFormatter={(v) => pct(v)} />
                <YAxis domain={[-0.05, 0.35]} allowDataOverflow tickFormatter={(v) => v.toFixed(2)} />
                <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox><div className="text-ink-3">Threshold {pct(payload[0].payload.pt)}</div>{payload.map((p) => <div key={String(p.dataKey)} className="num">{String(p.name)}: {Number(p.value).toFixed(3)}</div>)}</TooltipBox> : null)} />
                <ReferenceLine y={0} stroke="var(--line-strong)" />
                <Line dataKey="model" name={MODEL_SPEC[kind].short} stroke={modelColor(kind)} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                <Line dataKey="buyer" name="Order buyer" stroke="var(--ink-3)" strokeWidth={1.6} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                <Line dataKey="all" name="Treat all lots" stroke="var(--rust)" strokeWidth={1.4} dot={false} isAnimationActive={false} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="Targeting" title="Cumulative gains" sub="Share of all high-risk lots caught when the riskiest X % of lots (by this model) get attention. The diagonal is random selection." />
          <div className="h-[280px]">
            <ResponsiveContainer>
              <ComposedChart data={gains} margin={{ left: 0, right: 15, top: 10, bottom: 10 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="share" domain={[0, 1]} tickFormatter={(v) => pct(v)} label={axisLabel("share of lots flagged, riskiest first")} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => pct(v)} />
                <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox><div className="num">Flag top {pct(payload[0].payload.share)} → catch {pct(payload[0].payload.captured)} of high-risk lots</div></TooltipBox> : null)} />
                <Line dataKey="random" stroke="var(--line-strong)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                <Line dataKey="captured" stroke={modelColor(kind)} strokeWidth={2.4} dot={{ r: 2.5, fill: modelColor(kind), strokeWidth: 0 }} isAnimationActive={false} />
                <Scatter data={[{ share: buyerSt.flagged, captured: buyerSt.sensitivity }]} dataKey="captured" fill="var(--ink-2)" shape="diamond" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[11px] text-ink-3">Diamond: the order buyers flag {pct(buyerSt.flagged)} of lots and catch {pct(buyerSt.sensitivity)} of high-risk ones.</div>
        </Card>
        <Card>
          <CardHeader eyebrow="Subgroups" title="Performance within each yard" sub="A model can look good overall but fail one operation. Predicted vs observed are head-weighted morbidity." />
          <table className="w-full text-[12.5px]">
            <thead className="border-b border-line text-[10.5px] tracking-wide text-ink-3 uppercase">
              <tr className="text-right">
                <th className="py-1.5 text-left font-medium">Yard</th>
                <th className="py-1.5 font-medium">Lots</th>
                <th className="py-1.5 font-medium">High-risk</th>
                <th className="py-1.5 font-medium">AUC</th>
                <th className="py-1.5 font-medium">Predicted</th>
                <th className="py-1.5 font-medium">Observed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {subgroup.map((g) => (
                <tr key={g.group} className="text-right">
                  <td className="py-1.5 text-left">{YARD_INDEX[g.group as keyof typeof YARD_INDEX]?.name ?? g.group}</td>
                  <td className="num py-1.5">{g.lots}</td>
                  <td className="num py-1.5">{g.positives}</td>
                  <td className="num py-1.5 font-semibold">{Number.isFinite(g.auc) ? g.auc.toFixed(3) : "—"}</td>
                  <td className="num py-1.5">{pct(g.predicted, 1)}</td>
                  <td className="num py-1.5" style={{ color: Math.abs(g.predicted - g.observed) > 0.015 ? "var(--rust)" : undefined }}>
                    {pct(g.observed, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[11px] text-ink-3">Yards with few high-risk lots have wide AUC uncertainty; red = predicted and observed differ by more than 1.5 points.</div>
        </Card>
        <Card>
          <CardHeader eyebrow="Calibration detail" title="Deciles and cross-validation" />
          <div className="grid gap-4 sm:grid-cols-2">
            <table className="w-full text-[12px]">
              <thead className="text-[10.5px] tracking-wide text-ink-3 uppercase">
                <tr className="text-right">
                  <th className="py-1 text-left font-medium">Decile</th>
                  <th className="py-1 font-medium">Pred.</th>
                  <th className="py-1 font-medium">Obs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {deciles.map((d, i) => (
                  <tr key={i} className="text-right">
                    <td className="py-1 text-left text-ink-3">{i + 1}</td>
                    <td className="num py-1">{pct(d.predicted, 1)}</td>
                    <td className="num py-1">{pct(d.observed, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <table className="w-full text-[12px]">
                <thead className="text-[10.5px] tracking-wide text-ink-3 uppercase">
                  <tr className="text-right">
                    <th className="py-1 text-left font-medium">CV fold</th>
                    <th className="py-1 font-medium">AUC</th>
                    <th className="py-1 font-medium">Log loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {res.cv.folds.map((f) => (
                    <tr key={f.fold} className="text-right">
                      <td className="py-1 text-left text-ink-3">{f.fold}</td>
                      <td className="num py-1">{f.auc.toFixed(3)}</td>
                      <td className="num py-1">{f.logLoss.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 space-y-1 text-[11.5px] text-ink-2">
                <div>
                  Calibration intercept (with slope) <span className="num font-semibold">{cal.intercept.toFixed(2)}</span>
                </div>
                <div>
                  Morbidity Brier <span className="num font-semibold">{metrics.brier.toFixed(4)}</span> · ECE <span className="num font-semibold">{(metrics.ece! * 100).toFixed(2)} pt</span>
                </div>
                <div>
                  Lot-variation κ <span className="num font-semibold">{res.concentration.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Cell({ n, label, tone }: { n: number; label: string; tone: "good" | "bad" | "warn" | "neutral" }) {
  const bg = { good: "var(--sage-soft)", bad: "var(--rust-soft)", warn: "var(--wheat-soft)", neutral: "var(--panel-2)" }[tone];
  return (
    <div className="rounded-lg px-2 py-3" style={{ background: bg }}>
      <div className="num text-[22px] leading-none font-semibold">{n}</div>
      <div className="mt-1 text-[10.5px] text-ink-2">{label}</div>
    </div>
  );
}

// ── Decision backtest ────────────────────────────────────────────────────────

/** The tool's choices (made with default assumptions) re-scored in worlds where those assumptions are wrong. */
function StressCard() {
  const worlds = BACKTEST.stress ?? [];
  if (!worlds.length) return null;
  const g = (w: (typeof worlds)[number], p: string) => w.rows.find((r) => r.policy === p)!;
  const wins = worlds.filter((w) => w.toolBeatsSop).length;
  const fewerDeaths = worlds.filter((w) => w.toolFewerDeaths).length;
  const lessAmu = worlds.filter((w) => w.toolUsesLessAmu).length;
  const captured = worlds.map((w) => w.captured ?? 0);
  const delta = (v: number) => (
    <span style={{ color: v >= 0 ? "var(--sage)" : "var(--rust)" }}>{usd(v, { d: 2, sign: true })}</span>
  );
  return (
    <Card>
      <CardHeader
        eyebrow="What if our assumptions are wrong?"
        title="Robustness: the same decisions scored in different worlds"
        sub="The tool always decides with the dashboard's default assumptions. Its choices are then re-scored in worlds where drug efficacy, BRD costs, drug or cattle prices, surveillance or missed-case mortality differ from what it assumed. It is never told which world it is in. The order buyer's call and blanket metaphylaxis are scored the same way."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Beats current SOPs" value={`${wins} of ${worlds.length} worlds`} tone={wins === worlds.length ? "good" : "warn"} sub="net value per head" />
        <Stat label="Fewer BRD deaths than SOPs" value={`${fewerDeaths} of ${worlds.length} worlds`} tone={fewerDeaths === worlds.length ? "good" : "warn"} />
        <Stat label="Share of perfect-information gain captured" value={`${Math.round(Math.min(...captured) * 100)}–${Math.round(Math.max(...captured) * 100)}%`} sub={`antimicrobial use ≤ SOP in ${lessAmu} of ${worlds.length} worlds`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[12.5px]">
          <thead className="border-b border-line text-[10.5px] tracking-wide text-ink-3 uppercase">
            <tr className="text-right">
              <th className="py-2 text-left font-medium">World</th>
              <th className="py-2 pl-3 font-medium">This tool Δ $/hd</th>
              <th className="py-2 pl-3 font-medium">Order buyer</th>
              <th className="py-2 pl-3 font-medium">Blanket premium</th>
              <th className="py-2 pl-3 font-medium">Perfect info</th>
              <th className="py-2 pl-3 font-medium">Gain captured</th>
              <th className="py-2 pl-3 font-medium">Regimens /100 hd (tool vs SOP)</th>
              <th className="py-2 pl-3 font-medium">BRD mortality (tool vs SOP)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {worlds.map((w) => {
              const t = g(w, "tool");
              const s = g(w, "statusQuo");
              return (
                <tr key={w.id} className={`text-right ${w.id === "base" ? "bg-sage-soft/40" : ""}`}>
                  <td className="py-2 pr-3 text-left">
                    <div className="font-medium">{w.label}</div>
                    <div className="text-[10.5px] text-ink-3">{w.detail}</div>
                  </td>
                  <td className="num py-2 pl-3 font-semibold">{delta(t.deltaPerHead)}</td>
                  <td className="num py-2 pl-3">{delta(g(w, "buyerFlag").deltaPerHead)}</td>
                  <td className="num py-2 pl-3">{delta(g(w, "blanket").deltaPerHead)}</td>
                  <td className="num py-2 pl-3 text-ink-3">{usd(g(w, "oracle").deltaPerHead, { d: 2, sign: true })}</td>
                  <td className="num py-2 pl-3">{w.captured == null ? "—" : `${Math.round(w.captured * 100)}%`}</td>
                  <td className="num py-2 pl-3" style={{ color: t.regimensPer100 <= s.regimensPer100 ? "var(--sage)" : undefined }}>
                    {t.regimensPer100.toFixed(0)} vs {s.regimensPer100.toFixed(0)}
                  </td>
                  <td className="num py-2 pl-3" style={{ color: t.bRdMortalityPct <= s.bRdMortalityPct ? "var(--sage)" : "var(--rust)" }}>
                    {t.bRdMortalityPct.toFixed(2)}% vs {s.bRdMortalityPct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-[11px] text-ink-3">
        Perfect information = the most valuable option for each lot if its true risk and drug response were known: an upper bound no real tool can reach. The gap between the tool and that bound is the value of better records and better prediction.
      </div>
    </Card>
  );
}

function Decisions({ ev }: { ev: Evaluation }) {
  const sq = BACKTEST.policies.find((p) => p.policy === "statusQuo")!;
  const tool = BACKTEST.policies.find((p) => p.policy === "tool")!;
  const econ = BACKTEST.policies.find((p) => p.policy === "toolEconomic")!;
  const oracle = BACKTEST.policies.find((p) => p.policy === "oracle")!;
  const lam = BACKTEST.amuPenalty;
  const scatter = (BACKTEST.models ?? []).map((b) => ({ ...b, auc: ev.models.find((m) => m.kind === b.kind)!.metrics.auc, logLoss: ev.models.find((m) => m.kind === b.kind)!.metrics.logLoss! }));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          eyebrow="Decision quality, not just accuracy"
          title="Policy backtest on 2025 arrivals the model never saw"
          sub={`Model trained on arrivals before 2025-01-01, then asked to choose an option for each of ${num(BACKTEST.lots)} lots (${num(BACKTEST.head)} head) arriving in 2025 using arrival-day records only. Every policy is scored against the hidden truth: each lot's true BRD risk and its true response to each drug class, which the tool never sees.`}
        />
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line text-[10.5px] tracking-wide text-ink-3 uppercase">
              <tr className="text-left">
                <th className="py-2 font-medium">Policy</th>
                <th className="py-2 pl-3 text-right font-medium">Net value /hd</th>
                <th className="py-2 pl-3 text-right font-medium">vs SOP</th>
                <th className="py-2 pl-3 text-right font-medium">Regimens /100 hd</th>
                <th className="py-2 pl-3 text-right font-medium">BRD mortality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {BACKTEST.policies.map((p) => (
                <tr key={p.policy} className={p.policy === "tool" ? "bg-sage-soft/40" : p.policy === "oracle" ? "text-ink-3 italic" : ""}>
                  <td className="py-2 font-medium">{POLICY_LABEL[p.policy]}</td>
                  <td className="num py-2 pl-3 text-right">{usd(p.valuePerHead, { d: 2 })}</td>
                  <td className="num py-2 pl-3 text-right font-semibold" style={{ color: p.policy === "oracle" ? undefined : p.deltaPerHead >= 0 ? "var(--sage)" : "var(--rust)" }}>
                    {p.policy === "statusQuo" ? "—" : usd(p.deltaPerHead, { d: 2, sign: true })}
                  </td>
                  <td className="num py-2 pl-3 text-right">{p.regimensPer100.toFixed(1)}</td>
                  <td className="num py-2 pl-3 text-right">{p.bRdMortalityPct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <Callout tone="good" title="Headline">
              At its default stewardship weight (${lam}/regimen) the tool earned <b>{usd(tool.deltaPerHead, { d: 2, sign: true })}/head</b> over the yards' current procedures, used{" "}
              <b>{tool.regimensPer100 <= sq.regimensPer100 ? `${Math.round((1 - tool.regimensPer100 / sq.regimensPer100) * 100)}% fewer` : `${Math.round((tool.regimensPer100 / sq.regimensPer100 - 1) * 100)}% more`} antimicrobial regimens</b>, and cut BRD mortality from {sq.bRdMortalityPct.toFixed(2)}% to{" "}
              <b>{tool.bRdMortalityPct.toFixed(2)}%</b>. Pure economics ($0) earns {usd(econ.deltaPerHead, { d: 2, sign: true })}/head but uses {Math.round((econ.regimensPer100 / sq.regimensPer100 - 1) * 100)}% more antimicrobials. It captures{" "}
              {Math.round((tool.deltaPerHead / oracle.deltaPerHead) * 100)}% of the gain that perfect knowledge of every lot's true risk would allow.
            </Callout>
            <Callout tone="info" title={`Where the $${lam} default comes from`}>
              It is derived, not chosen: the smallest weight at which the tool's own expected antimicrobial use on the {num(BACKTEST.stewardship.lots)} lots of 2024 is no higher than the yards' current SOPs. That turns
              leadership's "accountable antimicrobial use" into a testable commitment: no more antibiotics than today. Set it to $0 for pure economics on the Assumptions page.
            </Callout>
            <div className="mt-3 text-[11px] text-ink-3">{BACKTEST.note} Because outcomes are simulated, this backtest shows the decision logic works as intended; it does not prove field efficacy.</div>
          </div>
        </div>
      </Card>

      <StressCard />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader eyebrow="Same engine, different risk model" title="Which model makes the best decisions?" sub="Each risk model drives the identical decision engine on the 2025 lots. Value is per head relative to the yards' current SOPs, scored against the hidden truth." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead className="border-b border-line text-[10.5px] tracking-wide text-ink-3 uppercase">
                <tr className="text-right">
                  <th className="py-2 text-left font-medium" rowSpan={2}>
                    Risk model
                  </th>
                  <th className="py-1 font-medium" colSpan={3}>
                    No stewardship weight
                  </th>
                  <th className="py-1 font-medium" colSpan={3}>
                    Default (${lam} / regimen)
                  </th>
                </tr>
                <tr className="text-right">
                  <th className="py-1 font-medium">Δ $/hd</th>
                  <th className="py-1 font-medium">Regimens</th>
                  <th className="py-1 font-medium">Mortality</th>
                  <th className="py-1 font-medium">Δ $/hd</th>
                  <th className="py-1 font-medium">Regimens</th>
                  <th className="py-1 font-medium">Mortality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...(BACKTEST.models ?? [])].sort((a, b) => b.valueDef - a.valueDef).map((b) => (
                  <tr key={b.kind} className="text-right">
                    <td className="py-1.5 text-left font-medium">
                      <ModelName kind={b.kind} short />
                    </td>
                    <td className="num py-1.5 font-semibold text-sage">{usd(b.value0, { d: 2, sign: true })}</td>
                    <td className="num py-1.5">{b.regimens0.toFixed(1)}</td>
                    <td className="num py-1.5">{b.mortality0.toFixed(2)}%</td>
                    <td className="num py-1.5 font-semibold text-sage">{usd(b.valueDef, { d: 2, sign: true })}</td>
                    <td className="num py-1.5">{b.regimensDef.toFixed(1)}</td>
                    <td className="num py-1.5">{b.mortalityDef.toFixed(2)}%</td>
                  </tr>
                ))}
                <tr className="text-right text-ink-3">
                  <td className="py-1.5 text-left">Current SOPs (reference)</td>
                  <td className="num py-1.5">—</td>
                  <td className="num py-1.5">{sq.regimensPer100.toFixed(1)}</td>
                  <td className="num py-1.5">{sq.bRdMortalityPct.toFixed(2)}%</td>
                  <td className="num py-1.5">—</td>
                  <td className="num py-1.5">{sq.regimensPer100.toFixed(1)}</td>
                  <td className="num py-1.5">{sq.bRdMortalityPct.toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[11px] text-ink-3">Regimens per 100 head; BRD mortality over 45 days. Every model beats current procedures; the ranking follows prediction quality.</div>
        </Card>
        <Card>
          <CardHeader eyebrow="Does accuracy pay?" title="Holdout AUC vs decision value" sub="Better-ranking models earn more per head: at the default stewardship weight the logistic, Bayesian, model-average and boosted models are within about $0.45/head of each other, while dropping the richer arrival records (Rojas predictors) costs about $2.20/head. The logistic and Bayesian points overlap." />
          <div className="h-[280px]">
            <ResponsiveContainer>
              <ScatterChart margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="auc" domain={["dataMin - 0.01", "dataMax + 0.01"]} tickFormatter={(v) => v.toFixed(2)} label={axisLabel("holdout AUC")} />
                <YAxis type="number" dataKey="valueDef" tickFormatter={(v) => `$${v.toFixed(1)}`} domain={["dataMin - 0.3", "dataMax + 0.3"]} />
                <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox><ModelName kind={payload[0].payload.kind} /><div className="num">AUC {payload[0].payload.auc.toFixed(3)}</div><div className="num">{usd(payload[0].payload.valueDef, { d: 2, sign: true })}/hd vs SOP</div></TooltipBox> : null)} />
                {scatter.map((s) => (
                  <Scatter key={s.kind} data={[s]} fill={modelColor(s.kind)} shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={7} fill={modelColor(s.kind)} stroke="var(--panel)" strokeWidth={2} />} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <ModelLegend kinds={scatter.map((s) => s.kind)} />
        </Card>
      </div>
    </div>
  );
}

// ── Inspect & retrain ────────────────────────────────────────────────────────

function Train({ ev, activeKind }: { ev: Evaluation; activeKind: ModelKind }) {
  const [kind, setKind] = useState<ModelKind>(activeKind);
  const [history, setHistory] = useState<HistoricalLot[] | null>(null);
  const [training, setTraining] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opts, setOpts] = useState<ZooOptions>({});
  const custom = useApp((s) => s.customModel);
  const setCustomModel = useApp((s) => s.setCustomModel);
  const setModelKind = useApp((s) => s.setModelKind);
  const cached = useModelCache((s) => s.trained);
  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);
  useEffect(() => setOpts({}), [kind]);
  const res = ev.models.find((m) => m.kind === kind)!;
  const model: FittedModel | undefined = custom && kindOf(custom) === kind ? custom : cached[kind];
  const m = model?.metrics ?? res.metrics;
  const linear = LINEAR_KINDS.includes(kind);
  const coef = linear ? [...m.coefTable].filter((c) => !c.name.startsWith("yard") && c.coef !== 0).sort((a, b) => b.coef - a.coef) : [];
  const treeEns = kind === "tree" ? (model?.trees?.point ?? res.tree) : undefined;
  const set = (k: keyof ZooOptions, v: number) => setOpts((o) => ({ ...o, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink-3">Model:</span>
        {MODEL_SPECS.map((s) => (
          <button
            key={s.kind}
            onClick={() => setKind(s.kind)}
            className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${kind === s.kind ? "border-ink bg-panel text-ink shadow-card" : "border-line text-ink-3 hover:text-ink"}`}
          >
            <ModelName kind={s.kind} short />
          </button>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        {linear ? (
          <Card>
            <CardHeader
              eyebrow="Learned effects"
              title={`Risk-factor coefficients (log-odds, 90% ${kind === "bayes" ? "posterior" : "bootstrap"} interval)`}
              sub={kind === "rojas" ? "Only the predictors Rojas et al. 2022 had; all other effects are fixed at zero." : "Positive = raises the odds of BRD. Directions agree with the risk-factor literature supplied with the challenge (Adekunle et al. 2026); effects whose interval spans zero (e.g. pen and bunk space) are indistinguishable from none in these records."}
            />
            <div className="space-y-1">
              {coef.map((c) => {
                const scale = (v: number) => 50 + (Math.max(-2, Math.min(2, v)) / 2) * 50;
                return (
                  <div key={c.name} className="grid grid-cols-[190px_1fr_54px] items-center gap-2 text-[11.5px]">
                    <span className="truncate text-ink-2">{c.label}</span>
                    <div className="relative h-4">
                      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-line-strong" />
                      <div className="absolute top-[7px] h-[2px]" style={{ left: `${scale(c.lo)}%`, width: `${scale(c.hi) - scale(c.lo)}%`, background: c.coef > 0 ? "var(--rust)" : "var(--sage)", opacity: 0.5 }} />
                      <div className="absolute top-[4px] h-2 w-2 -translate-x-1/2 rounded-full" style={{ left: `${scale(c.coef)}%`, background: c.coef > 0 ? "var(--rust)" : "var(--sage)" }} />
                    </div>
                    <span className="num text-right">
                      {c.coef >= 0 ? "+" : ""}
                      {c.coef.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : treeEns ? (
          <Card>
            <CardHeader eyebrow="Readable rules" title="The decision tree as a rule book" sub="Each path ends in the pooled 45-day BRD morbidity of the training lots that reach it, and the share of head that falls there." />
            <TreeRules ensemble={treeEns} />
          </Card>
        ) : (
          <Card>
            <CardHeader eyebrow="What the model relies on" title="Permutation importance" sub="Increase in holdout log loss when a risk-factor group is shuffled. Tree ensembles have no coefficients; per-lot explanations on lot pages use ablation (set the group to its average and see how far the prediction moves)." />
            <div className="h-[340px]">
              <ResponsiveContainer>
                <BarChart data={[...m.importance!].sort((a, b) => b.value - a.value).map((i) => ({ ...i, v: i.value * 1000 }))} layout="vertical" margin={{ left: 40, right: 20 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => v.toFixed(1)} />
                  <YAxis type="category" dataKey="group" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox>{payload[0].payload.group}: +{payload[0].payload.v.toFixed(2)} ×10⁻³ log loss</TooltipBox> : null)} />
                  <Bar dataKey="v" fill={modelColor(kind)} radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <div className="space-y-6">
          <Card>
            <CardHeader
              eyebrow="Your data"
              title={`Retrain: ${MODEL_SPEC[kind].label}`}
              sub="Re-fits on the records in a background thread and re-runs the temporal validation. With a yard's own records, this is where the model becomes theirs."
            />
            <div className="space-y-3">
              {(kind === "logit" || kind === "rojas") && <SliderRow label="L2 penalty λ" value={opts.lambda ?? 2} min={0.1} max={50} step={0.1} onChange={(v) => set("lambda", v)} hint="Higher = more conservative coefficients" />}
              {kind === "bayes" && <SliderRow label="Prior precision (1 / prior SD²)" value={opts.lambda ?? 1} min={0.05} max={25} step={0.05} onChange={(v) => set("lambda", v)} hint="Higher = stronger shrinkage toward no effect" />}
              {(kind === "tree" || kind === "gbm" || kind === "forest") && (
                <SliderRow label="Tree depth" value={opts.depth ?? (kind === "tree" ? 4 : kind === "forest" ? 8 : 3)} min={1} max={kind === "gbm" ? 6 : 10} step={1} onChange={(v) => set("depth", v)} />
              )}
              {kind === "gbm" && <SliderRow label="Boosting rounds" value={opts.rounds ?? 150} min={20} max={400} step={10} onChange={(v) => set("rounds", v)} />}
              {kind === "forest" && <SliderRow label="Trees" value={opts.trees ?? 150} min={30} max={400} step={10} onChange={(v) => set("trees", v)} />}
              {kind === "stack" && <div className="text-[12px] text-ink-3">The model average re-trains its three members with their default settings.</div>}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                icon={training != null ? <Spinner /> : <RefreshCcw size={14} />}
                disabled={!history || training != null}
                onClick={async () => {
                  setTraining(0);
                  setErr(null);
                  try {
                    const mm = await trainInWorker(history!, kind, opts, true, setTraining);
                    setCustomModel(mm);
                    setModelKind(kind);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  }
                  setTraining(null);
                }}
              >
                {training != null ? `Training… ${Math.round(training * 100)}%` : `Retrain & use (${history ? num(history.length) : "…"} lots)`}
              </Button>
              {err && <span className="text-[12px] text-rust">{err}</span>}
            </div>
            {model?.metrics && model === custom && (
              <div className="mt-3 rounded-lg bg-sage-soft/50 p-2.5 text-[12px] text-ink-2">
                Retrained: holdout AUC <span className="num font-semibold">{model.metrics.auc.toFixed(3)}</span> (bundled {res.metrics.auc.toFixed(3)}), log loss{" "}
                <span className="num font-semibold">{model.metrics.logLoss?.toFixed(4)}</span>. The Evaluate tab now shows this version.
              </div>
            )}
            <div className="mt-3 text-[11px] text-ink-3">
              Settings: {Object.entries(model?.hyper ?? res.hyper ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ")}
            </div>
          </Card>
          <Card>
            <CardHeader eyebrow="Provenance" title="Training records by yard" />
            {history ? (
              <table className="w-full text-[12.5px]">
                <thead className="text-[10.5px] tracking-wide text-ink-3 uppercase">
                  <tr className="text-left">
                    <th className="py-1.5 font-medium">Yard</th>
                    <th className="py-1.5 text-right font-medium">Lots</th>
                    <th className="py-1.5 text-right font-medium">Morbidity</th>
                    <th className="py-1.5 text-right font-medium">High-risk</th>
                    <th className="py-1.5 text-right font-medium">Vacc. unknown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {YARDS.map((y) => {
                    const ls = history.filter((l) => l.yardId === y.id);
                    const hd = ls.reduce((s, l) => s + l.head, 0);
                    return (
                      <tr key={y.id}>
                        <td className="py-1.5">{YARD_INDEX[y.id].name}</td>
                        <td className="num py-1.5 text-right">{num(ls.length)}</td>
                        <td className="num py-1.5 text-right">{pct(ls.reduce((s, l) => s + l.brdTreated45, 0) / hd, 1)}</td>
                        <td className="num py-1.5 text-right">{pct(ls.filter((l) => l.highRisk).length / ls.length)}</td>
                        <td className="num py-1.5 text-right">{pct(ls.filter((l) => l.vaccinated === "unknown").length / ls.length)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <Spinner />
            )}
            <div className="mt-3 text-[11px] text-ink-3">
              Generated with seed {META.seed}; history {META.historyStart} → arrivals completing 45 days before {META.snapshot}; NOAA weather coverage {pct(META.weatherCoverage)}.
            </div>
          </Card>
        </div>
      </div>
      <Callout tone="info" title="How to read these numbers">
        Records are synthetic (no operational data was provided). The lowest-risk yard is calibrated to Rojas et al. 2022 (45-day morbidity 7.2 % vs 6.3 % published) and the order-buyer call to the managers in that study
        (sensitivity 80 % vs 84 %, specificity 59 % vs 60 %); the other yards are riskier by design. The hidden process adds interactions, thresholds, record errors, an unrecorded pathogen pressure and a 2025 strain shift, so no
        model can be perfect. The penalized logistic still leads because most of the learnable signal is additive and about 2,300 training lots are too few for trees to pin down the interactions (see the learning curves).
        Real-world performance must be re-established on each yard's own records using the retrain panel.
      </Callout>
    </div>
  );
}

