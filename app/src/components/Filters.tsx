"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { PHASES, title } from "@/lib/model";

type Opt = { name: string; n: number }[];
/** Rev 3 filters: ball holder, department, waiting on, stage overdue, phase — the PM filter stays. */
export default function Filters({ pms, balls = [], depts = [], waiting = [], full = false }: { pms: Opt; balls?: Opt; depts?: Opt; waiting?: Opt; full?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const setMany = (kv: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(kv)) { if (v) q.set(k, v); else q.delete(k); }
    router.replace("?" + q.toString());
  };
  const set = (k: string, v: string) => setMany({ [k]: v });
  const active = ["pm", "ball", "dept", "phase", "waiting", "overdue", "flow"].filter((k) => sp.get(k)).length;
  return (
    <>
      {full && (
        <select id="ball" aria-label="Filter by who holds the ball" value={sp.get("ball") ?? ""} onChange={(e) => set("ball", e.target.value)}>
          <option value="">Ball holder</option>
          {balls.map((p) => <option key={p.name} value={p.name}>{title(p.name)} ({p.n})</option>)}
        </select>
      )}
      <select id="pm" aria-label="Filter by project manager" value={sp.get("pm") ?? ""} onChange={(e) => set("pm", e.target.value)}>
        <option value="">All PMs</option>
        {pms.map((p) => <option key={p.name} value={p.name}>{title(p.name)} ({p.n})</option>)}
      </select>
      {full && (
        <>
          <select id="dept" aria-label="Filter by department" value={sp.get("dept") ?? ""} onChange={(e) => set("dept", e.target.value)}>
            <option value="">Department</option>
            {depts.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.n})</option>)}
          </select>
          <select id="phase" aria-label="Filter by phase" value={sp.get("phase") ?? ""} onChange={(e) => set("phase", e.target.value)}>
            <option value="">Phase</option>
            {PHASES.map((ph) => <option key={ph.key} value={ph.key}>{ph.label}</option>)}
          </select>
          <select id="waiting" aria-label="Filter by what a project is waiting on" value={sp.get("waiting") ?? ""} onChange={(e) => set("waiting", e.target.value)}>
            <option value="">Waiting on</option>
            <option value="*">Anything (all holds)</option>
            {waiting.map((w) => <option key={w.name} value={w.name}>{title(w.name)} ({w.n})</option>)}
          </select>
          <select id="flow" aria-label="Filter by status" value={sp.get("overdue") ? "overdue" : sp.get("flow") ?? ""} onChange={(e) => { const v = e.target.value; setMany(v === "overdue" ? { flow: "", overdue: "1" } : { overdue: "", flow: v }); }}>
            <option value="">Status</option>
            <option value="ACTIVE">Active</option>
            <option value="AWAITING_ACCEPTANCE">Awaiting acceptance</option>
            <option value="ON_HOLD">On hold</option>
            <option value="overdue">Stage overdue</option>
          </select>
          {active > 0 && <button type="button" className="btn ghost sm" onClick={() => router.replace("?" + (sp.get("q") ? `q=${encodeURIComponent(sp.get("q")!)}` : ""))}>Clear ({active})</button>}
        </>
      )}
      <input id="q" type="search" placeholder="Search projects…" aria-label="Search" defaultValue={sp.get("q") ?? ""} onChange={(e) => set("q", e.target.value.trim())} />
    </>
  );
}
