import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, HelpCircle, Info, X } from "lucide-react";
import type { ReactNode } from "react";
import type { EvidenceKind, LotAssessment } from "../engine/types";
import { riskBand, riskColor, STRATEGY_COLOR } from "../lib/format";

export function Card({ className, children, pad = true }: { className?: string; children: ReactNode; pad?: boolean }) {
  return <div className={clsx("card", pad && "p-5", className)}>{children}</div>;
}

export function CardHeader({ title, eyebrow, right, sub }: { title: ReactNode; eyebrow?: string; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {sub && <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[30px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "ink",
  icon,
  delta,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "ink" | "good" | "bad" | "warn";
  icon?: ReactNode;
  delta?: { text: string; good: boolean } | null;
}) {
  return (
    <div className="card relative overflow-hidden p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-ink-3">
        {icon}
        {label}
      </div>
      <div
        className={clsx(
          "num mt-2 text-[26px] leading-none font-semibold",
          tone === "good" && "text-sage",
          tone === "bad" && "text-rust",
          tone === "warn" && "text-wheat",
          tone === "ink" && "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
        {delta && (
          <span className={clsx("num rounded-md px-1.5 py-0.5 font-medium", delta.good ? "bg-sage-soft text-sage" : "bg-rust-soft text-rust")}>{delta.text}</span>
        )}
        {sub}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "info" | "plum"; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        tone === "neutral" && "bg-panel-2 text-ink-2",
        tone === "good" && "bg-sage-soft text-sage",
        tone === "bad" && "bg-rust-soft text-rust",
        tone === "warn" && "bg-wheat-soft text-[color:var(--wheat)]",
        tone === "info" && "bg-sky-soft text-sky",
        tone === "plum" && "bg-panel-2 text-plum",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EvidenceBadge({ kind }: { kind: EvidenceKind }) {
  const map = { observed: ["Observed", "good"], estimated: ["Estimated", "info"], assumed: ["Assumed", "warn"] } as const;
  const [label, tone] = map[kind];
  return (
    <Badge tone={tone} className="uppercase tracking-wide">
      {label}
    </Badge>
  );
}

export function ConfidenceBadge({ level, compact }: { level: LotAssessment["confidence"]; compact?: boolean }) {
  if (level === "confident")
    return (
      <Badge tone="good">
        <CheckCircle2 size={12} /> {compact ? "Robust" : "Robust decision"}
      </Badge>
    );
  if (level === "caution")
    return (
      <Badge tone="warn">
        <HelpCircle size={12} /> {compact ? "Caution" : "Use with caution"}
      </Badge>
    );
  return (
    <Badge tone="bad">
      <AlertTriangle size={12} /> {compact ? "Need info" : "Information insufficient"}
    </Badge>
  );
}

export function StrategyChip({ id, label, muted }: { id: string; label: string; muted?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", muted ? "border-line text-ink-3" : "border-line-strong text-ink")}>
      <span className="h-2 w-2 rounded-full" style={{ background: STRATEGY_COLOR[id] }} />
      {label}
    </span>
  );
}

/** Horizontal risk meter: point estimate + 80 % interval on a 0–60 % scale. */
export function RiskMeter({ mean, p10, p90, width = 140, showLabel = true }: { mean: number; p10: number; p90: number; width?: number; showLabel?: boolean }) {
  const max = 0.6;
  const x = (v: number) => (Math.min(v, max) / max) * width;
  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={14} className="shrink-0 overflow-visible">
        <rect x={0} y={5} width={width} height={4} rx={2} fill="var(--panel-2)" />
        <rect x={x(0.15)} y={2} width={1} height={10} fill="var(--line-strong)" />
        <rect x={x(p10)} y={4} width={Math.max(2, x(p90) - x(p10))} height={6} rx={3} fill={riskColor(mean)} opacity={0.35} />
        <circle cx={x(mean)} cy={7} r={4.5} fill={riskColor(mean)} stroke="var(--panel)" strokeWidth={1.5} />
      </svg>
      {showLabel && (
        <span className="num text-[12px] font-semibold" style={{ color: riskColor(mean) }}>
          {(mean * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

export function RiskPill({ p }: { p: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${riskColor(p)} 16%, transparent)`, color: riskColor(p) }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: riskColor(p) }} />
      {riskBand(p)}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-md font-medium transition",
            size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-panel text-ink shadow-card" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  icon,
  disabled,
  className,
  type = "button",
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-[12px]" : "px-3.5 py-2 text-[13px]",
        variant === "primary" && "bg-brand text-[color:var(--bg)] hover:bg-brand-2",
        variant === "secondary" && "border border-line-strong bg-panel text-ink hover:bg-panel-2",
        variant === "ghost" && "text-ink-2 hover:bg-panel-2 hover:text-ink",
        variant === "danger" && "border border-rust/40 bg-rust-soft text-rust hover:brightness-95",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="num font-semibold text-ink">{format ? format(value) : value}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="mt-0.5 text-[11px] text-ink-3">{hint}</div>}
    </label>
  );
}

export function Callout({ tone = "info", title, children, icon }: { tone?: "info" | "warn" | "bad" | "good"; title?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  return (
    <div
      className={clsx(
        "flex gap-3 rounded-xl border p-3.5 text-[13px] leading-relaxed",
        tone === "info" && "border-sky/30 bg-sky-soft text-ink",
        tone === "warn" && "border-wheat/40 bg-wheat-soft text-ink",
        tone === "bad" && "border-rust/40 bg-rust-soft text-ink",
        tone === "good" && "border-sage/40 bg-sage-soft text-ink",
      )}
    >
      <div className={clsx("mt-0.5 shrink-0", tone === "info" && "text-sky", tone === "warn" && "text-[color:var(--wheat)]", tone === "bad" && "text-rust", tone === "good" && "text-sage")}>
        {icon ?? <Info size={16} />}
      </div>
      <div>
        {title && <div className="mb-0.5 font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col border-l border-line bg-elev shadow-pop"
            style={{ width: `min(${width}px, 100vw)` }}
            initial={{ x: width }}
            animate={{ x: 0 }}
            exit={{ x: width }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="text-[15px] font-semibold">{title}</div>
              <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-panel-2 hover:text-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1 text-[12px] font-medium text-ink-2">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-ink-3">{hint}</div>}
    </label>
  );
}

export const inputBase =
  "rounded-lg border border-line-strong bg-panel px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-2 focus:ring-2 focus:ring-brand-2/20";
export const inputCls = "w-full " + inputBase;

export function TooltipBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] shadow-pop">{children}</div>;
}
