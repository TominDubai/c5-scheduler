import { STAGES, aedS, type Project } from "@/lib/model";

export default function Summary({ projects }: { projects: Project[] }) {
  const live = projects.filter((p) => !["COMPLETED", "LOST"].includes(p.status));
  const late = live.filter((p) => (p.days_delayed ?? 0) > 0 && p.status !== "SITE_ON_HOLD");
  const total = projects.reduce((s, p) => s + (p.project_value || 0), 0);
  return (
    <section className="summary">
      <div className="stats">
        <div className="stat"><b>{live.length}</b><span>live projects</span></div>
        <div className="stat crit"><b>{late.length}</b><span>past target</span></div>
        <div className="stat"><b>{aedS(total)}</b><span>pipeline value</span></div>
        <div className="stat"><b>{projects.filter((p) => p.status === "QUOTE").length}</b><span>in quote</span></div>
      </div>
      <div className="pipe" aria-label="Projects per stage">
        {STAGES.map(([k, l]) => { const n = projects.filter((p) => p.status === k).length; return <span key={k} className={`seg s-${k}`} style={{ flex: Math.max(n, 0.35) }} title={`${l}: ${n}`}>{n}</span>; })}
      </div>
    </section>
  );
}
