"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STAGES, SIDE, aedS, fmtDShort, title, ini, tone, delayText, type Project, type Status } from "@/lib/model";
import { setStatus } from "@/app/actions";

export default function Board({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(projects);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function drop(stage: Status) {
    if (!dragId) return;
    const p = rows.find((r) => r.id === dragId);
    setOver(null); setDragId(null);
    if (!p || p.status === stage) return;
    const prev = rows;
    setRows(rows.map((r) => (r.id === dragId ? { ...r, status: stage } : r)));
    start(async () => {
      const res = await setStatus(p.id, stage);
      if (res?.error) { setRows(prev); setErr(res.error); } else { setErr(null); router.refresh(); }
    });
  }

  const cols = [...STAGES, ...SIDE].map(([k, l]) => {
    const items = rows.filter((p) => p.status === k).sort((a, b) => (b.days_delayed ?? -9e9) - (a.days_delayed ?? -9e9));
    const val = items.reduce((s, p) => s + (p.project_value || 0), 0);
    return (
      <section key={k} className={`col${k === "SITE_ON_HOLD" || k === "LOST" ? " side" : ""}${over === k ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (over !== k) setOver(k); }} onDragLeave={() => setOver(null)} onDrop={() => drop(k)}>
        <header><h2>{l}</h2><span className="count">{items.length}</span><span className="colval">{val ? aedS(val) : ""}</span></header>
        <div className="cards">
          {items.length === 0 && <div className="empty">Drop a project here</div>}
          {items.map((p) => <Card key={p.id} p={p} dragging={dragId === p.id} onDragStart={() => setDragId(p.id)} onDragEnd={() => { setDragId(null); setOver(null); }} />)}
        </div>
      </section>
    );
  });

  return (
    <>
      {err && <div className="msg err" style={{ padding: "0 24px" }}>Couldn’t move that project: {err}</div>}
      <div className="board" aria-busy={pending}>{cols}</div>
    </>
  );
}

function Card({ p, dragging, onDragStart, onDragEnd }: { p: Project; dragging: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const router = useRouter();
  const t = tone(p);
  return (
    <article className={`card ${t}${dragging ? " dragging" : ""}`} draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      tabIndex={0} role="link" onClick={() => router.push(`/projects/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/projects/${p.id}`)}>
      <div className="card-top"><span className="enq">{p.enquiry_no ?? "—"}</span><span className={`pill ${t}`}>{delayText(p)}</span></div>
      <h3>{title(p.name)}</h3>
      <div className="client">{title(p.client)}{p.contractor ? ` · ${p.contractor}` : ""}</div>
      <div className="card-foot">
        <span className="who"><b className="av">{ini(p.pm)}</b>{p.pm ? title(p.pm) : "No PM"}{p.pm2 ? ` + ${title(p.pm2)}` : ""}</span>
        <span className="val">{p.project_value ? aedS(p.project_value) : "—"}</span>
      </div>
      <div className="dates"><span>Start {fmtDShort(p.start_date)}</span><span>Target {fmtDShort(p.target_date)}</span></div>
    </article>
  );
}
