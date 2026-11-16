import type { ReactNode } from "react";
import { FEATURES } from "../engine/features";
import type { ModelKind } from "../engine/model";
import { invLogit } from "../engine/rng";
import type { TreeEnsemble } from "../engine/trees";
import { MODEL_SPEC, MODEL_SPECS } from "../engine/zoo";
import { pct } from "../lib/format";

export const modelColor = (k: ModelKind) => `var(--m-${k})`;

export function ModelDot({ kind, size = 9 }: { kind: ModelKind; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: modelColor(kind) }} />;
}

export function ModelName({ kind, short }: { kind: ModelKind; short?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ModelDot kind={kind} />
      {short ? MODEL_SPEC[kind].short : MODEL_SPEC[kind].label}
    </span>
  );
}

/**
 * Legend for model overlays. With `onToggle` every entry becomes a button that
 * shows or hides that model; `values` appends a per-model metric to the entry.
 */
export function ModelLegend({
  kinds = MODEL_SPECS.map((s) => s.kind),
  extra,
  selected,
  onToggle,
  values,
}: {
  kinds?: ModelKind[];
  extra?: ReactNode;
  selected?: ModelKind[];
  onToggle?: (k: ModelKind) => void;
  values?: Partial<Record<ModelKind, string>>;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
      {kinds.map((k) => {
        const on = !selected || selected.includes(k);
        const body = (
          <>
            <span className="inline-block h-[2px] w-3.5 rounded" style={{ background: on ? modelColor(k) : "var(--line-strong)" }} />
            <span className={on ? "" : "text-ink-3 line-through"}>{MODEL_SPEC[k].short}</span>
            {on && values?.[k] && <span className="num text-ink-3">{values[k]}</span>}
          </>
        );
        return onToggle ? (
          <button key={k} type="button" onClick={() => onToggle(k)} aria-pressed={on} title={on ? "Hide this model" : "Show this model"} className="inline-flex items-center gap-1.5 rounded px-0.5 hover:text-ink">
            {body}
          </button>
        ) : (
          <span key={k} className="inline-flex items-center gap-1.5">
            {body}
          </span>
        );
      })}
      {extra}
    </div>
  );
}

const ALL_KINDS = MODEL_SPECS.map((s) => s.kind);

/** Quick selections for the comparison plots. */
export const MODEL_PRESETS: { label: string; kinds: ModelKind[] }[] = [
  { label: "All", kinds: ALL_KINDS },
  { label: "Linear", kinds: ["logit", "bayes", "rojas"] },
  { label: "Tree-based", kinds: ["tree", "forest", "gbm"] },
  { label: "Logistic vs boosted", kinds: ["logit", "gbm"] },
];

/**
 * Multi-select chips choosing which models the comparison plots draw. Each chip
 * toggles its model; "only" isolates it so a single model's plots can be read
 * on their own. Order and colour always follow the model, never the selection.
 */
export function ModelPicker({ selected, onChange, active }: { selected: ModelKind[]; onChange: (kinds: ModelKind[]) => void; active?: ModelKind }) {
  const toggle = (k: ModelKind) => onChange(selected.includes(k) ? selected.filter((x) => x !== k) : ALL_KINDS.filter((x) => x === k || selected.includes(x)));
  const same = (kinds: ModelKind[]) => kinds.length === selected.length && kinds.every((k) => selected.includes(k));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-[12px] text-ink-3">Plot:</span>
      <div className="flex flex-wrap gap-1.5">
        {MODEL_SPECS.map(({ kind }) => {
          const on = selected.includes(kind);
          return (
            <div key={kind} className={`group inline-flex items-center overflow-hidden rounded-full border text-[12px] font-medium transition ${on ? "border-ink/40 bg-panel text-ink shadow-card" : "border-line text-ink-3"}`}>
              <button type="button" aria-pressed={on} onClick={() => toggle(kind)} className="inline-flex items-center gap-1.5 py-1 pr-1.5 pl-2.5 hover:text-ink">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border" style={{ borderColor: modelColor(kind), background: on ? modelColor(kind) : "transparent" }}>
                  {on && (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {MODEL_SPEC[kind].short}
                {kind === active && <span className="text-[10px] text-ink-3">(in use)</span>}
              </button>
              <button type="button" onClick={() => onChange([kind])} title={`Show only ${MODEL_SPEC[kind].short}`} className="border-l border-line py-1 pr-2.5 pl-1.5 text-[10.5px] text-ink-3 hover:bg-panel-2 hover:text-ink">
                only
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1">
        {MODEL_PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => onChange(p.kinds)} className={`rounded-md px-2 py-0.5 text-[11.5px] transition ${same(p.kinds) ? "bg-ink text-bg" : "text-ink-3 hover:bg-panel-2 hover:text-ink"}`}>
            {p.label}
          </button>
        ))}
        {active && (
          <button type="button" onClick={() => onChange([active])} className={`rounded-md px-2 py-0.5 text-[11.5px] transition ${same([active]) ? "bg-ink text-bg" : "text-ink-3 hover:bg-panel-2 hover:text-ink"}`}>
            In use
          </button>
        )}
      </div>
    </div>
  );
}

const BINARY_TEXT: Record<string, [string, string]> = {
  vacc_no: ["vaccinated or unknown", "not vaccinated"],
  vacc_unknown: ["vaccination recorded", "vaccination unknown"],
  wean_no: ["weaned or unknown", "not weaned ≥ 45 d"],
  wean_unknown: ["weaning recorded", "weaning unknown"],
  buyer_high: ["buyer did not flag", "buyer flagged high risk"],
  src_auction_multi: ["not auction-commingled", "auction, commingled"],
  src_auction_single: ["not single-source auction", "auction, single source"],
  src_precond: ["not preconditioned", "preconditioned"],
  src_unknown: ["source recorded", "source unknown"],
  meta_premium: ["no premium metaphylaxis", "premium metaphylaxis given"],
  meta_economy: ["no economy metaphylaxis", "economy metaphylaxis given"],
  yard_ll: ["other yards", "Llano Estacado"],
  yard_cv: ["other yards", "Cimarron Valley"],
  yard_ar: ["other yards", "Arkansas River"],
};

/** Translate a split on an engineered feature back into the manager's units. */
function describeSplit(j: number, t: number): [string, string] {
  const f = FEATURES[j];
  const r = (v: number) => Math.round(v);
  switch (f.name) {
    case "wt_below":
      return [`weight ≥ ${r(800 - 100 * t)} lb`, `weight < ${r(800 - 100 * t)} lb`];
    case "wt_below_sq":
      return [`weight ≥ ${r(800 - 100 * Math.sqrt(t))} lb`, `weight < ${r(800 - 100 * Math.sqrt(t))} lb`];
    case "wt_above":
      return [`weight ≤ ${r(800 + 100 * t)} lb`, `weight > ${r(800 + 100 * t)} lb`];
    case "log_sources":
      return [`≤ ${r(Math.exp(t) - 1)} origins`, `> ${r(Math.exp(t) - 1)} origins`];
    case "haul_250":
      return [`haul ≤ ${r(250 * t)} mi`, `haul > ${r(250 * t)} mi`];
    case "log_head":
      return [`≤ ${r(Math.exp(t))} head`, `> ${r(Math.exp(t))} head`];
    case "shrink_over4":
      return [`shrink ≤ ${(4 + t).toFixed(1)} %`, `shrink > ${(4 + t).toFixed(1)} %`];
    case "swing_over15":
      return [`temp swing ≤ ${r(15 + t)} °F`, `temp swing > ${r(15 + t)} °F`];
    case "crowding":
      return [`pen ≥ ${(16 - t).toFixed(1)} m²/hd`, `pen < ${(16 - t).toFixed(1)} m²/hd`];
    case "bunk_short":
      return [`bunk ≥ ${r(25 - t)} cm/hd`, `bunk < ${r(25 - t)} cm/hd`];
    default:
      return BINARY_TEXT[f.name] ?? [`not: ${f.label}`, f.label];
  }
}

/** A single boosted-mode tree rendered as nested if/else rules with each leaf's risk. */
export function TreeRules({ ensemble }: { ensemble: TreeEnsemble }) {
  const t = ensemble.trees[0];
  const total = t.w[0];
  const node = (i: number, cond: string, depth: number): ReactNode => {
    const leaf = t.f[i] < 0;
    const risk = leaf ? invLogit(ensemble.base + ensemble.lr * t.v[i]) : null;
    const [l, r] = leaf ? ["", ""] : describeSplit(t.f[i], t.t[i]);
    return (
      <div key={`${i}-${cond}`} className={depth ? "ml-4 border-l border-line pl-3" : ""}>
        <div className="flex items-center gap-2 py-0.5 text-[12px]">
          <span className={leaf ? "text-ink" : "text-ink-2"}>{cond}</span>
          {leaf && risk != null && (
            <>
              <span className="num ml-auto rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: risk >= 0.15 ? "var(--rust-soft)" : risk >= 0.08 ? "var(--wheat-soft)" : "var(--sage-soft)" }}>
                {pct(risk, 1)}
              </span>
              <span className="num w-14 text-right text-[10.5px] text-ink-3">{pct(t.w[i] / total)} hd</span>
            </>
          )}
        </div>
        {!leaf && (
          <>
            {node(t.l[i], l, depth + 1)}
            {node(t.r[i], r, depth + 1)}
          </>
        )}
      </div>
    );
  };
  return <div className="font-mono text-[12px]">{node(0, "All lots", 0)}</div>;
}
