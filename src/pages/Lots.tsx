import clsx from "clsx";
import { ArrowDownUp, Download, FileUp, Plus, Search, Stethoscope, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Callout, Card, ConfidenceBadge, Drawer, Field, inputBase, inputCls, PageHeader, RiskMeter, Segmented, Spinner, StrategyChip } from "../components/ui";
import { SNAPSHOT } from "../data";
import type { LotArrival, LotAssessment, Sex, SourceType, TriState, YardId } from "../engine/types";
import { SEX_LABEL, SOURCE_LABEL, YARD_INDEX, YARDS } from "../engine/yards";
import { fmtDate, num, pct, usd, valueBasis } from "../lib/format";
import { assessmentsToCsv, completeLot, CSV_COLUMNS, download, parseLotsCsv, type ParseReport } from "../lib/lotio";
import { VET_NEED, vetNeed } from "../lib/vet";
import { useEngine } from "../state/engine";
import { usePlans } from "../state/plan";
import { useApp } from "../state/store";

type SortKey = "arrival" | "risk" | "delta" | "head" | "voi";

export default function Lots() {
  const { assessments, status } = useEngine();
  const plans = usePlans();
  const reviews = useApp((s) => s.reviews);
  const params = useApp((s) => s.params);
  const added = useApp((s) => s.addedLots);
  const removeLot = useApp((s) => s.removeLot);
  const [sp, setSp] = useSearchParams();
  const yard = (sp.get("yard") ?? "all") as YardId | "all";
  const [stat, setStat] = useState<"scheduled" | "on-feed" | "all">("scheduled");
  const [conf, setConf] = useState<"all" | "insufficient" | "caution" | "confident">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "arrival", dir: 1 });
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const nav = useNavigate();

  const rows = useMemo(() => {
    const val = (a: LotAssessment): number => {
      switch (sort.k) {
        case "arrival":
          return Date.parse(a.lot.arrivalDate);
        case "risk":
          return a.risk.mean;
        case "delta":
          return (a.best.objective - a.statusQuo.objective) / a.lot.head;
        case "head":
          return a.lot.head;
        case "voi":
          return a.infoValue[0]?.value ?? 0;
      }
    };
    return assessments
      .filter((a) => (yard === "all" || a.lot.yardId === yard) && (stat === "all" || a.lot.status === stat) && (conf === "all" || a.confidence === conf))
      .filter((a) => !q || `${a.lot.lotId} ${a.lot.source ?? ""} ${YARD_INDEX[a.lot.yardId].name}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (val(a) - val(b)) * sort.dir);
  }, [assessments, yard, stat, conf, q, sort]);

  const th = (k: SortKey, label: string, cls = "", title?: string) => (
    <th className={clsx("px-3 py-2.5 font-medium", cls)} title={title}>
      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : k === "arrival" ? 1 : -1 }))}>
        {label} <ArrowDownUp size={11} className={sort.k === k ? "text-ink" : "opacity-40"} />
      </button>
    </th>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Triage"
        title="Arrivals & lots"
        sub="Every lot scheduled to arrive, and every lot still inside its first 45 days on feed. Risk is predicted from arrival records; on-feed lots are updated with pulls observed so far."
        right={
          <div className="flex flex-wrap gap-2">
            <Button icon={<Plus size={15} />} variant="primary" onClick={() => setAddOpen(true)}>
              Enter a lot
            </Button>
            <Button icon={<FileUp size={15} />} onClick={() => setUploadOpen(true)}>
              Upload CSV
            </Button>
            <Button icon={<Download size={15} />} onClick={() => download(`brd_assessments_${SNAPSHOT}.csv`, assessmentsToCsv(rows, Object.assign({}, ...Object.values(plans ?? {}).map((p) => p.plan.choice))))}>
              Export
            </Button>
          </div>
        }
      />

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <Segmented
            value={yard}
            onChange={(v) => setSp(v === "all" ? {} : { yard: v })}
            size="sm"
            options={[{ value: "all", label: "All yards" }, ...YARDS.map((y) => ({ value: y.id, label: y.name.split(" ")[0] + (y.id === "palo-duro" ? " Duro" : y.id === "arkansas-river" ? " River" : "") }))]}
          />
          <Segmented
            value={stat}
            onChange={setStat}
            size="sm"
            options={[
              { value: "scheduled", label: "Inbound" },
              { value: "on-feed", label: "On feed" },
              { value: "all", label: "All" },
            ]}
          />
          <Segmented
            value={conf}
            onChange={setConf}
            size="sm"
            options={[
              { value: "all", label: "Any confidence" },
              { value: "insufficient", label: "Need info" },
              { value: "caution", label: "Caution" },
              { value: "confident", label: "Robust" },
            ]}
          />
          <div className="relative ml-auto">
            <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
            <input className={clsx(inputBase, "w-56 pl-8")} placeholder="Search lot, source, yard" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {status !== "ready" && assessments.length === 0 ? (
          <div className="flex items-center gap-2 p-10 text-ink-3">
            <Spinner /> Scoring lots…
          </div>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[13px]">
              <thead className="border-b border-line bg-panel-2/60 text-[11px] tracking-wide text-ink-3 uppercase">
                <tr>
                  {th("arrival", "Lot / arrival")}
                  {th("head", "Cattle")}
                  <th className="px-3 py-2.5 font-medium">Records</th>
                  {th("risk", "45-day BRD risk (80% interval)")}
                  <th className="px-3 py-2.5 font-medium">Recommended</th>
                  <th className="px-3 py-2.5 font-medium">Current SOP</th>
                  {th("delta", "Δ value / head", "text-right", valueBasis(params))}
                  {th("voi", "Confidence")}
                  <th className="px-3 py-2.5 font-medium">Vet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => {
                  const delta = (a.best.objective - a.statusQuo.objective) / a.lot.head;
                  const rv = reviews[a.lot.lotId];
                  const vet = VET_NEED[vetNeed(a.best.strategy, a.statusQuo.strategy)];
                  const isAdded = added.some((l) => l.lotId === a.lot.lotId);
                  // A missing record matters when learning it could change the recommendation.
                  const mattering = a.infoValue.filter((v) => v.flipProb >= params.confFlipRelevant && v.value / a.lot.head >= params.confValueRelevant);
                  return (
                    <tr key={a.lot.lotId} className="cursor-pointer transition hover:bg-panel-2/50" onClick={() => nav(`/lots/${a.lot.lotId}`)}>
                      <td className="px-3 py-2.5">
                        <div className="num flex items-center gap-1.5 font-semibold">
                          {a.lot.lotId}
                          {isAdded && <Badge tone="info">entered</Badge>}
                        </div>
                        <div className="text-[11px] text-ink-3">
                          {YARD_INDEX[a.lot.yardId].name} · {a.lot.status === "scheduled" ? `arrives ${fmtDate(a.lot.arrivalDate)}` : `day ${a.lot.daysOnFeed} on feed`}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="num">
                          {a.lot.head} hd · {a.lot.weightLb} lb
                        </div>
                        <div className="text-[11px] text-ink-3">
                          {SEX_LABEL[a.lot.sex]} · {a.lot.source ? SOURCE_LABEL[a.lot.source] : "source unknown"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {a.risk.missing.length === 0 ? (
                          <Badge tone="good">complete</Badge>
                        ) : mattering.length ? (
                          <span title={`Unknown: ${a.risk.missing.join(", ")}. Worth confirming: ${mattering.map((v) => v.label).join(", ")}.`}>
                            <Badge tone="warn">{a.risk.missing.length} unknown</Badge>
                            <div className="mt-0.5 text-[11px] text-wheat">confirm {mattering[0].label.toLowerCase()}</div>
                          </span>
                        ) : (
                          <span title={`Unknown: ${a.risk.missing.join(", ")}. None of them would change the recommendation.`}>
                            <Badge>{a.risk.missing.length} unknown</Badge>
                            <div className="mt-0.5 text-[11px] text-ink-3">no effect on decision</div>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <RiskMeter mean={a.risk.mean} p10={a.risk.p10} p90={a.risk.p90} />
                        <div className="text-[11px] text-ink-3">
                          {pct(a.risk.p10)}–{pct(a.risk.p90)} · P(high-risk) {pct(a.risk.probHighRisk)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <StrategyChip id={a.best.strategy.id} label={a.best.strategy.short} />
                      </td>
                      <td className="px-3 py-2.5">
                        <StrategyChip id={a.statusQuo.strategy.id} label={a.statusQuo.strategy.short} muted />
                      </td>
                      <td className="num px-3 py-2.5 text-right font-semibold" style={{ color: delta > 0.5 ? "var(--sage)" : "var(--ink-3)" }}>
                        {delta > 0.005 ? usd(delta, { d: 2, sign: true }) : "same"}
                      </td>
                      <td className="px-3 py-2.5">
                        <ConfidenceBadge level={a.confidence} compact />
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        {rv ? (
                          <Badge tone={rv.status === "approved" ? "good" : rv.status === "declined" ? "bad" : "info"}>
                            <Stethoscope size={11} /> {rv.status}
                          </Badge>
                        ) : (
                          <span title={vet.title}>
                            <Badge tone={vet.tone}>
                              {vet.queue && <Stethoscope size={11} />} {vet.label}
                            </Badge>
                          </span>
                        )}
                        {isAdded && (
                          <button className="ml-2 text-ink-3 hover:text-rust" title="Remove entered lot" onClick={() => removeLot(a.lot.lotId)}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <div className="p-10 text-center text-[13px] text-ink-3">No lots match these filters.</div>}
          </div>
        )}
        <div className="border-t border-line px-4 py-2.5 text-[11px] text-ink-3">
          {num(rows.length)} lots · {num(rows.reduce((s, a) => s + a.lot.head, 0))} head · risk = expected share of the lot pulled for BRD in 45 days <em>without</em> metaphylaxis; the
          vertical tick marks the 15 % high-risk cutoff (Rojas et al. 2022).
        </div>
      </Card>

      <AddLotDrawer open={addOpen} onClose={() => setAddOpen(false)} />
      <UploadDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

function AddLotDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addLots = useApp((s) => s.addLots);
  const nav = useNavigate();
  const [f, setF] = useState({
    lotId: "",
    yardId: "llano" as YardId,
    arrivalDate: "2025-10-27",
    head: 160,
    sex: "steer" as Sex,
    weightLb: 525,
    source: "auction_multi" as SourceType | "",
    nSources: "6",
    haulMiles: "780",
    shrinkPct: "6.5",
    vaccinated: "unknown" as TriState,
    weaned: "no" as TriState,
    buyerHighRisk: true,
    penAreaM2PerHead: 16,
    bunkCmPerHead: 26,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  const submit = () => {
    const lotId = f.lotId.trim() || `NEW-${f.arrivalDate.replace(/-/g, "").slice(2)}-${Math.floor(Math.random() * 90 + 10)}`;
    const lot: LotArrival = completeLot({
      lotId,
      yardId: f.yardId,
      arrivalDate: f.arrivalDate,
      head: Number(f.head),
      sex: f.sex,
      weightLb: Number(f.weightLb),
      source: f.source || null,
      nSources: n(f.nSources),
      haulMiles: n(f.haulMiles),
      shrinkPct: n(f.shrinkPct),
      vaccinated: f.vaccinated,
      weaned: f.weaned,
      buyerHighRisk: f.buyerHighRisk,
      tempSwingF: null,
      precipIn: null,
      minTempF: null,
      penAreaM2PerHead: Number(f.penAreaM2PerHead),
      bunkCmPerHead: Number(f.bunkCmPerHead),
      febrilePct: null,
      casesToDate: null,
      daysOnFeed: null,
      status: "scheduled",
      processedWith: null,
      notes: "Entered by manager",
    });
    addLots([lot]);
    onClose();
    nav(`/lots/${lotId}`);
  };
  const tri = (k: "vaccinated" | "weaned") => (
    <Segmented value={f[k]} onChange={(v) => set(k, v)} size="sm" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "Unknown" }]} />
  );
  return (
    <Drawer open={open} onClose={onClose} title="Enter an arrival lot">
      <div className="space-y-4">
        <Callout>Leave anything you don't know blank or "Unknown". The tool will say how much each missing record matters to the decision.</Callout>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lot ID (optional)">
            <input className={inputCls} value={f.lotId} onChange={(e) => set("lotId", e.target.value)} placeholder="auto" />
          </Field>
          <Field label="Yard">
            <select className={inputCls} value={f.yardId} onChange={(e) => set("yardId", e.target.value as YardId)}>
              {YARDS.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Arrival date" hint="Weather is pulled from NOAA for the yard's station.">
            <input type="date" className={inputCls} value={f.arrivalDate} onChange={(e) => set("arrivalDate", e.target.value)} />
          </Field>
          <Field label="Head">
            <input type="number" className={inputCls} value={f.head} onChange={(e) => set("head", Number(e.target.value))} />
          </Field>
          <Field label="Average arrival weight (lb)">
            <input type="number" className={inputCls} value={f.weightLb} onChange={(e) => set("weightLb", Number(e.target.value))} />
          </Field>
          <Field label="Sex">
            <select className={inputCls} value={f.sex} onChange={(e) => set("sex", e.target.value as Sex)}>
              {Object.entries(SEX_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source">
            <select className={inputCls} value={f.source} onChange={(e) => set("source", e.target.value as SourceType | "")}>
              <option value="">Unknown</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Number of sources commingled">
            <input className={inputCls} value={f.nSources} onChange={(e) => set("nSources", e.target.value)} placeholder="unknown" />
          </Field>
          <Field label="Haul distance (mi)">
            <input className={inputCls} value={f.haulMiles} onChange={(e) => set("haulMiles", e.target.value)} placeholder="unknown" />
          </Field>
          <Field label="Transit shrink (%)">
            <input className={inputCls} value={f.shrinkPct} onChange={(e) => set("shrinkPct", e.target.value)} placeholder="unknown" />
          </Field>
          <Field label="Pen area (m²/head)">
            <input type="number" className={inputCls} value={f.penAreaM2PerHead} onChange={(e) => set("penAreaM2PerHead", Number(e.target.value))} />
          </Field>
          <Field label="Bunk space (cm/head)">
            <input type="number" className={inputCls} value={f.bunkCmPerHead} onChange={(e) => set("bunkCmPerHead", Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Respiratory vaccination before arrival">{tri("vaccinated")}</Field>
        <Field label="Weaned ≥ 45 days">{tri("weaned")}</Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={f.buyerHighRisk} onChange={(e) => set("buyerHighRisk", e.target.checked)} /> Order buyer flagged this lot as high risk
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Score this lot
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

function UploadDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addLots = useApp((s) => s.addLots);
  const [report, setReport] = useState<ParseReport | null>(null);
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (file: File) => {
    setName(file.name);
    setReport(parseLotsCsv(await file.text()));
  };
  return (
    <Drawer open={open} onClose={onClose} title="Upload arrival records (CSV)" width={640}>
      <div className="space-y-4">
        <div
          className="grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line-strong bg-panel-2/50 p-8 text-center hover:border-brand-2"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) onFile(file);
          }}
        >
          <FileUp className="mb-2 text-ink-3" />
          <div className="text-[13px] font-medium">Drop a CSV here or click to choose</div>
          <div className="mt-1 text-[12px] text-ink-3">
            or{" "}
            <a className="text-sky underline" href="./templates/arrivals_template.csv" download onClick={(e) => e.stopPropagation()}>
              download the template
            </a>{" "}
            (6 example lots)
          </div>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
        {report && (
          <div className="space-y-3">
            <div className="text-[13px]">
              <span className="font-semibold">{name}</span>: {report.lots.length} valid lots, {report.errors.length} rejected rows, {report.warnings.length} warnings.
            </div>
            {report.errors.length > 0 && (
              <Callout tone="bad" title="Rejected rows">
                <ul className="list-disc pl-4">
                  {report.errors.slice(0, 8).map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </Callout>
            )}
            {report.warnings.length > 0 && (
              <Callout tone="warn" title="Warnings (rows kept)">
                <ul className="list-disc pl-4">
                  {report.warnings.slice(0, 8).map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </Callout>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setReport(null)}>Clear</Button>
              <Button
                variant="primary"
                disabled={!report.lots.length}
                onClick={() => {
                  addLots(report.lots.filter((l) => l.status !== "history"));
                  setReport(null);
                  onClose();
                }}
              >
                Add {report.lots.filter((l) => l.status !== "history").length} lots
              </Button>
            </div>
          </div>
        )}
        <div>
          <div className="eyebrow mb-2">Columns</div>
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-line">
              {CSV_COLUMNS.map(([c, d, ex]) => (
                <tr key={c}>
                  <td className="num py-1.5 pr-3 font-semibold">{c}</td>
                  <td className="py-1.5 pr-3 text-ink-2">{d}</td>
                  <td className="num py-1.5 text-ink-3">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
}
