import { STAGES, type Project } from "@/lib/model";

export default function Summary({ projects }: { projects: Project[] }) {
  const live = projects.filter((p) => !["COMPLETED", "LOST"].includes(p.status));
  const late = live.filter((p) => (p.days_delayed ?? 0) > 0 && p.status !== "SITE_ON_HOLD");
  return (
    <section className="summary">
      <div className="stats">
        <div className="stat"><b>{live.length}</b><span>live projects</span></div>
        <div className="stat crit"><b>{late.length}</b><span>past target</span></div>
        <div className="stat"><b>{projects.filter((p) => ["PRODUCTION", "INSTALLATION", "SNAGGING"].includes(p.status)).length}</b><span>in production or on site</span></div>
        <div className="stat"><b>{projects.filter((p) => p.status === "QUOTE").length}</b><span>in quote</span></div>
      </div>
      <div className="pipe" aria-label="Projects per stage">
        {STAGES.map(([k, l]) => { const n = projects.filter((p) => p.status === k).length; return <span key={k} className={`seg s-${k}`} style={{ flex: Math.max(n, 0.35) }} title={`${l}: ${n}`}>{n}</span>; })}
      </div>
    </section>
  );
}
