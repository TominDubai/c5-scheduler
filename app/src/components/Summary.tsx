import { PHASES, COMPLETED_STAGE, type Project } from "@/lib/model";

/** The strip above the Board and List: the numbers that matter under Rev 3, and the pipeline by phase. */
export default function Summary({ projects }: { projects: Project[] }) {
  const live = projects.filter((p) => p.stage != null && p.stage >= 3 && p.stage !== COMPLETED_STAGE);
  const late = live.filter((p) => (p.days_delayed ?? 0) > 0 && p.flow_status !== "ON_HOLD");
  const awaiting = live.filter((p) => p.flow_status === "AWAITING_ACCEPTANCE");
  const held = projects.filter((p) => p.flow_status === "ON_HOLD" && p.status !== "COMPLETED");
  const overdue = live.filter((p) => p.stage_overdue);
  return (
    <section className="summary">
      <div className="stats">
        <div className="stat"><b>{live.length}</b><span>live projects</span></div>
        <div className={`stat${late.length ? " crit" : ""}`}><b>{late.length}</b><span>past target</span></div>
        <div className={`stat${awaiting.length ? " bronze" : ""}`}><b>{awaiting.length}</b><span>awaiting acceptance</span></div>
        <div className="stat"><b>{held.length}</b><span>on hold</span></div>
        {overdue.length > 0 && <div className="stat crit"><b>{overdue.length}</b><span>stage overdue</span></div>}
      </div>
      <div className="pipe" aria-label="Projects per phase">
        {PHASES.map((ph, i) => { const n = live.filter((p) => ph.stages.includes(p.stage!)).length; return <span key={ph.key} className={`seg ph-${ph.key}`} style={{ flex: Math.max(n, 0.35) }} title={`${ph.label}: ${n}`}>{n}</span>; })}
      </div>
    </section>
  );
}
