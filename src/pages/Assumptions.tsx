import { RotateCcw, Shuffle } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Callout, Card, CardHeader, EvidenceBadge, inputCls, PageHeader, Segmented, StrategyChip } from "../components/ui";
import { assessLot } from "../engine/assess";
import { DEFAULT_PARAMS, PARAM_DEFS, PARAM_GROUPS, type ParamKey, type Params } from "../engine/params";
import { YARD_INDEX } from "../engine/yards";
import { pct, usd } from "../lib/format";
import { useEngine } from "../state/engine";
import { useActiveModel } from "../state/models";
import { useApp } from "../state/store";

export default function Assumptions() {
  const params = useApp((s) => s.params);
  const setParam = useApp((s) => s.setParam);
  const resetParams = useApp((s) => s.resetParams);
  const applyPreset = useApp((s) => s.applyPreset);
  const preset = useApp((s) => s.pricePreset);
  const [kind, setKind] = useState<"all" | "observed" | "estimated" | "assumed">("all");
  const changed = PARAM_DEFS.filter((d) => Math.abs(params[d.key] - DEFAULT_PARAMS[d.key]) > 1e-9);
  const counts = { observed: PARAM_DEFS.filter((d) => d.kind === "observed").length, estimated: PARAM_DEFS.filter((d) => d.kind === "estimated").length, assumed: PARAM_DEFS.filter((d) => d.kind === "assumed").length };

  return (
    <div>
      <PageHeader
        eyebrow="Transparency"
        title="Assumptions & sensitivity"
        sub="Every number the engine uses, where it came from, and how much the decision depends on it. Change anything: every page re-simulates."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={preset === "custom" ? ("custom" as const) : preset}
              onChange={(v) => v !== "custom" && applyPreset(v)}
              size="sm"
              options={[
                { value: "weber", label: "Weber 2024 prices" },
                { value: "ers2025", label: "USDA ERS Oct-2025 prices" },
                ...(preset === "custom" ? [{ value: "custom" as const, label: "Custom" }] : []),
              ]}
            />
            <Button icon={<RotateCcw size={14} />} onClick={resetParams} disabled={!changed.length}>
              Reset all ({changed.length})
            </Button>
          </div>
        }
      />
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <Callout tone="good" title={`${counts.observed} observed`}>
          Taken directly from a cited source or real public data (USDA, NOAA, the challenge papers).
        </Callout>
        <Callout tone="info" title={`${counts.estimated} estimated`}>
          Derived or calibrated by this tool from sources or records (formula given in each row).
        </Callout>
        <Callout tone="warn" title={`${counts.assumed} assumed`}>
          Team assumptions where no source gave a value. Treat these as the first things to replace with yard data.
        </Callout>
      </div>
      {preset === "ers2025" && (
        <Callout tone="info" title="Current-market prices">
          Feeder and fed prices from the USDA ERS Livestock & Meat Domestic Data workbook (Oklahoma City Med & Large #1 feeder steers; TX/OK/NM negotiated fed steers, October 2025). 700 and 850 lb
          values are interpolated/extrapolated from the 600–650 and 750–800 lb series. Feed, yardage and interest remain Weber's values.
        </Callout>
      )}

      <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_440px]">
        <div className="space-y-6">
          <Segmented
            value={kind}
            onChange={setKind}
            size="sm"
            options={[
              { value: "all", label: "All" },
              { value: "observed", label: "Observed" },
              { value: "estimated", label: "Estimated" },
              { value: "assumed", label: "Assumed" },
            ]}
          />
          {PARAM_GROUPS.map((g) => {
            const defs = PARAM_DEFS.filter((d) => d.group === g && (kind === "all" || d.kind === kind));
            if (!defs.length) return null;
            return (
              <Card key={g} pad={false}>
                <div className="border-b border-line px-5 py-3 text-[14px] font-semibold">{g}</div>
                <div className="divide-y divide-line">
                  {defs.map((d) => {
                    const v = params[d.key];
                    const isChanged = Math.abs(v - DEFAULT_PARAMS[d.key]) > 1e-9;
                    return (
                      <div key={d.key} className="grid gap-3 px-5 py-3.5 md:grid-cols-[1fr_260px]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium">{d.label}</span>
                            <EvidenceBadge kind={d.kind} />
                            {isChanged && <Badge tone="plum">edited</Badge>}
                          </div>
                          <div className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{d.source}</div>
                          {d.note && <div className="mt-0.5 text-[11.5px] text-ink-3 italic">{d.note}</div>}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <input type="range" className="flex-1" min={d.min} max={d.max} step={d.step} value={v} onChange={(e) => setParam(d.key, Number(e.target.value))} />
                            <input
                              type="number"
                              className={inputCls + " num w-[92px] px-2 py-1 text-right"}
                              value={v}
                              step={d.step}
                              onChange={(e) => e.target.value !== "" && setParam(d.key, Number(e.target.value))}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[10.5px] text-ink-3">
                            <span>{d.unit}</span>
                            {isChanged && (
                              <button className="hover:text-ink" onClick={() => setParam(d.key, DEFAULT_PARAMS[d.key])}>
                                reset to {DEFAULT_PARAMS[d.key]}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
        <div>
          <div className="sticky top-20">
            <Tornado params={params} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Tornado({ params }: { params: Params }) {
  const { assessments } = useEngine();
  const { model } = useActiveModel();
  const candidates = useMemo(
    () => assessments.filter((a) => a.lot.status === "scheduled").sort((a, b) => Math.abs(b.risk.mean - 0.2) < Math.abs(a.risk.mean - 0.2) ? 1 : -1).slice(0, 40),
    [assessments],
  );
  const [lotId, setLotId] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const target = candidates.find((c) => c.lot.lotId === lotId) ?? candidates[0];

  const rows = useMemo(() => {
    if (!target) return [];
    const base = assessLot(model, target.lot, params, { voi: false });
    const bestId = base.best.strategy.id;
    const adv = (a: ReturnType<typeof assessLot>) => (a.results.find((r) => r.strategy.id === bestId)!.objective - a.statusQuo.objective) / target.lot.head;
    const baseAdv = adv(base);
    // Confidence settings change labels, never option values, so they cannot appear in a value tornado.
    const keys = PARAM_DEFS.filter((d) => d.key !== "highRiskCutoff" && d.group !== "Decision confidence").map((d) => d.key) as ParamKey[];
    return keys
      .map((k) => {
        const d = PARAM_DEFS.find((x) => x.key === k)!;
        const lo = assessLot(model, target.lot, { ...params, [k]: d.min }, { voi: false });
        const hi = assessLot(model, target.lot, { ...params, [k]: d.max }, { voi: false });
        return {
          key: k,
          label: d.label,
          kind: d.kind,
          lo: adv(lo) - baseAdv,
          hi: adv(hi) - baseAdv,
          flipLo: lo.best.strategy.id !== bestId ? lo.best.strategy : null,
          flipHi: hi.best.strategy.id !== bestId ? hi.best.strategy : null,
          min: d.min,
          max: d.max,
        };
      })
      .sort((a, b) => Math.max(Math.abs(b.lo), Math.abs(b.hi)) - Math.max(Math.abs(a.lo), Math.abs(a.hi)))
      .slice(0, 14)
      .map((r) => ({ ...r, base: base, baseAdv }));
  }, [target?.lot.lotId, params, model, run]);

  if (!target) return null;
  const maxAbs = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.lo), Math.abs(r.hi)]));
  const base = rows[0]?.base;
  return (
    <Card>
      <CardHeader
        eyebrow="One-at-a-time sensitivity"
        title="Which assumptions could change this decision?"
        sub="Each parameter is swept to the ends of its plausible range. Bars show the change in the recommended option's advantage over the SOP ($/head); ⟲ marks a range end where a different option becomes best."
      />
      <div className="mb-3 flex gap-2">
        <select className={inputCls} value={target.lot.lotId} onChange={(e) => setLotId(e.target.value)}>
          {candidates.map((c) => (
            <option key={c.lot.lotId} value={c.lot.lotId}>
              {c.lot.lotId} · {YARD_INDEX[c.lot.yardId].name} · risk {pct(c.risk.mean)}
            </option>
          ))}
        </select>
        <Button icon={<Shuffle size={14} />} onClick={() => setRun((r) => r + 1)} size="sm">
          Rerun
        </Button>
      </div>
      {base && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          Recommended <StrategyChip id={base.best.strategy.id} label={base.best.strategy.short} /> vs SOP <StrategyChip id={base.statusQuo.strategy.id} label={base.statusQuo.strategy.short} muted /> advantage{" "}
          <span className="num font-semibold text-ink">{usd(rows[0].baseAdv, { d: 2, sign: true })}/hd</span>
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="mb-0.5 flex items-center justify-between gap-2 text-[11.5px]">
              <span className="truncate text-ink-2">{r.label}</span>
              <span className="flex items-center gap-1.5">
                {(
                  [
                    ["min", r.flipLo],
                    ["max", r.flipHi],
                  ] as const
                ).map(([side, f]) =>
                  f ? (
                    <Badge key={side} tone={f.antimicrobial !== base!.best.strategy.antimicrobial ? "bad" : "neutral"}>
                      {side} → {f.short}
                    </Badge>
                  ) : null,
                )}
                <EvidenceBadge kind={r.kind} />
              </span>
            </div>
            <div className="relative h-4">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-line-strong" />
              {[
                { v: r.lo, flip: r.flipLo, tone: "var(--sky)", tag: `min ${r.min}` },
                { v: r.hi, flip: r.flipHi, tone: "var(--wheat)", tag: `max ${r.max}` },
              ].map((b, i) => {
                const w = (Math.abs(b.v) / maxAbs) * 50;
                return (
                  <div
                    key={i}
                    title={`${b.tag}: ${usd(b.v, { d: 2, sign: true })}/hd${b.flip ? ` → best becomes ${b.flip.short}` : ""}`}
                    className="absolute top-0.5 h-3 rounded-sm"
                    style={{ left: b.v >= 0 ? "50%" : `${50 - w}%`, width: `${Math.max(0.5, w)}%`, background: b.tone, outline: b.flip ? "2px solid var(--rust)" : undefined }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-ink-3">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-3 rounded-sm bg-sky" /> parameter at minimum
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-3 rounded-sm bg-wheat" /> at maximum
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-3 rounded-sm outline-2 outline-rust" /> decision flips at that end
        </span>
        <span>Red badge: a different antimicrobial plan becomes best; grey: only the surveillance level changes.</span>
      </div>
    </Card>
  );
}

