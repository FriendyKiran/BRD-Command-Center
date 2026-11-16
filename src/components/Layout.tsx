import clsx from "clsx";
import {
  BookOpenCheck,
  ClipboardSignature,
  Cpu,
  DatabaseZap,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Moon,
  PlayCircle,
  Scale,
  Stethoscope,
  Sun,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { SNAPSHOT } from "../data";
import { MODEL_SPEC } from "../engine/zoo";
import { useEngine, useEngineDriver } from "../state/engine";
import { useActiveModel } from "../state/models";
import { useApp } from "../state/store";
import { fmtDate } from "../lib/format";
import { Spinner } from "./ui";
import { DECISION_DRAWS } from "../engine/assess";

const NAV: { to: string; label: string; icon: ReactNode; group: string }[] = [
  { to: "/", label: "Command Center", icon: <LayoutDashboard size={17} />, group: "Operate" },
  { to: "/lots", label: "Arrivals & Lots", icon: <ListChecks size={17} />, group: "Operate" },
  { to: "/plan", label: "Yard Planner", icon: <Gauge size={17} />, group: "Operate" },
  { to: "/summary", label: "Decision Summary", icon: <ClipboardSignature size={17} />, group: "Operate" },
  { to: "/assumptions", label: "Assumptions & Sensitivity", icon: <Scale size={17} />, group: "Understand" },
  { to: "/data", label: "Data Explorer", icon: <DatabaseZap size={17} />, group: "Understand" },
  { to: "/model", label: "Model Lab", icon: <FlaskConical size={17} />, group: "Understand" },
  { to: "/demo", label: "Demonstration Case", icon: <PlayCircle size={17} />, group: "Understand" },
  { to: "/about", label: "Data, Licenses & Credits", icon: <BookOpenCheck size={17} />, group: "Understand" },
];

export function Layout() {
  useEngineDriver();
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const { status, progress, assessments, ms } = useEngine();
  const active = useActiveModel();
  const selectedKind = useApp((s) => s.modelKind);
  const loc = useLocation();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);


  return (
    <div className="flex min-h-full">
      <aside className="no-print sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-elev lg:flex">
        <div className="flex items-center gap-3 px-5 pt-5 pb-6">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-[color:var(--bg)] shadow-card">
            <svg viewBox="0 0 32 32" width="22" height="22">
              <path d="M7 20c2-6 6-9 9-9s7 3 9 9" stroke="var(--wheat)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <circle cx="16" cy="21" r="3" fill="var(--rust)" />
            </svg>
          </div>
          <div>
            <div className="font-display text-[17px] leading-tight font-semibold">BRD Command</div>
            <div className="text-[11px] text-ink-3">Post-arrival decision aid</div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 px-3">
          {["Operate", "Understand"].map((g) => (
            <div key={g}>
              <div className="eyebrow mb-1.5 px-2">{g}</div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === g).map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === "/"}
                    className={({ isActive }) =>
                      clsx(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                        isActive ? "bg-panel text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-panel-2 hover:text-ink",
                      )
                    }
                  >
                    <span className="text-ink-3">{n.icon}</span>
                    {n.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="m-3 rounded-xl border border-line bg-panel p-3 text-[11px] leading-relaxed text-ink-3">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink-2">
            <Stethoscope size={13} /> Veterinary oversight
          </div>
          Medication-related options are decision support only and require review by the yard's veterinarian of record before use.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-4 border-b border-line bg-bg/85 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            <span className="h-2 w-2 rounded-full bg-sage" />
            Operating date <span className="num font-semibold text-ink">{fmtDate(SNAPSHOT, "long")}</span>
            <span className="hidden rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-3 uppercase md:inline">Demo snapshot</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <NavLink to="/model" className="hidden items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 text-[11.5px] text-ink-2 hover:text-ink md:flex" title="Risk model used by the decision engine">
              <span className="h-2 w-2 rounded-full" style={{ background: `var(--m-${selectedKind})` }} />
              {active.ready ? MODEL_SPEC[active.kind].short : <>Training {MODEL_SPEC[selectedKind].short} {Math.round((active.progress ?? 0) * 100)}%</>}
            </NavLink>
            <div className="flex items-center gap-2 text-[12px] text-ink-3">
              {status === "running" ? (
                <>
                  <Spinner /> Re-simulating {Math.round(progress * 100)}%
                </>
              ) : status === "ready" ? (
                <>
                  <Cpu size={14} /> {assessments.length} lots · {(ms / 1000).toFixed(1)} s · {`${(assessments.reduce((n, a) => n + a.results.length, 0) * DECISION_DRAWS / 1000).toFixed(0)}k`} simulations
                </>
              ) : status === "error" ? (
                <span className="text-rust">Engine error</span>
              ) : (
                <>
                  <Spinner /> Starting engine
                </>
              )}
            </div>
            <button onClick={toggleTheme} className="rounded-lg border border-line bg-panel p-2 text-ink-2 hover:text-ink" aria-label="Toggle theme">
              {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
          </div>
        </header>
        <MobileNav />
        <main className="print-full mx-auto w-full max-w-[1480px] flex-1 px-6 py-7">
          <Outlet />
        </main>
        <footer className="no-print border-t border-line px-6 py-4 text-[11px] text-ink-3">
          Synthetic demonstration data calibrated to published sources; weather is real NOAA data. Not for use with real animals without local validation and veterinary oversight.
        </footer>
      </div>
    </div>
  );
}

function MobileNav() {
  return (
    <div className="no-print scroll-thin flex gap-1 overflow-x-auto border-b border-line bg-elev px-3 py-2 lg:hidden">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => clsx("rounded-md px-2.5 py-1.5 text-[12px] whitespace-nowrap", isActive ? "bg-panel font-semibold text-ink shadow-card" : "text-ink-3")}>
          {n.label}
        </NavLink>
      ))}
    </div>
  );
}
