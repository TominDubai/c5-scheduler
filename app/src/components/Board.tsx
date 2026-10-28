"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STAGES, SIDE, aedS, fmtDShort, title, ini, tone, delayText, type Project, type Status } from "@/lib/model";
import { setStatus } from "@/app/actions";
import type { ItemCounts } from "@/lib/model";
import Progress from "@/components/Progress";

const STATUS_OPTIONS: [Status, string][] = [...STAGES, ...SIDE];

export default function Board({ projects, canEdit }: { projects: Project[]; canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(projects);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  /** Shared by drag-and-drop and the card's status dropdown: optimistic move, rolled back on error. */
  function move(id: string, stage: Status) {
    const p = rows.find((r) => r.id === id);
    if (!p || p.status === stage) return;
    const prev = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, status: stage } : r)));
    start(async () => {
      const res = await setStatus(p.id, stage);
      if (res?.error) { setRows(prev); setErr(res.error); } else { setErr(null); router.refresh(); }
    });
  }

  function drop(stage: Status) {
    const id = dragId;
    setOver(null); setDragId(null);
    if (!id || !canEdit) return;
    move(id, stage);
  }

  const cols = [...STAGES, ...SIDE].map(([k, l]) => {
    const items = rows.filter((p) => p.status === k).sort((a, b) => (b.days_delayed ?? -9e9) - (a.days_delayed ?? -9e9));
    return (
      <section key={k} className={`col${k === "SITE_ON_HOLD" || k === "LOST" ? " side" : ""}${over === k ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (over !== k) setOver(k); }} onDragLeave={() => setOver(null)} onDrop={() => drop(k)}>
        <header><h2>{l}</h2><span className="count">{items.length}</span></header>
        <div className="cards">
          {items.length === 0 && <div className="empty">{canEdit ? "Drop a project here" : "Nothing here"}</div>}
          {items.map((p) => (
            <Card key={p.id} p={p} canEdit={canEdit} dragging={dragId === p.id}
              onDragStart={() => setDragId(p.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
              onStatus={(stage) => move(p.id, stage)} />
          ))}
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

function Card({ p, canEdit, dragging, onDragStart, onDragEnd, onStatus }: {
  p: Project; canEdit: boolean; dragging: boolean;
  onDragStart: () => void; onDragEnd: () => void; onStatus: (stage: Status) => void;
}) {
  const router = useRouter();
  const t = tone(p);
  // Keep interactions inside the status dropdown from opening the project or starting a card drag.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <article className={`card ${t}${dragging ? " dragging" : ""}`} draggable={canEdit} onDragStart={onDragStart} onDragEnd={onDragEnd}
      tabIndex={0} role="link" onClick={() => router.push(`/projects/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/projects/${p.id}`)}>
      <div className="card-top"><span className="enq">{p.enquiry_no ?? "—"}</span><span className={`pill ${t}`}>{delayText(p)}</span></div>
      <h3>{title(p.name)}</h3>
      <div className="client">{title(p.client)}{p.contractor ? ` · ${p.contractor}` : ""}</div>
      <div className="card-foot">
        <span className="who"><b className="av">{ini(p.pm)}</b>{p.pm ? title(p.pm) : "No PM"}{p.pm2 ? ` + ${title(p.pm2)}` : ""}</span>
        <span className="val">{p.project_value ? aedS(p.project_value) : "—"}</span>
      </div>
      {p.items && p.items.items_total > 0 && <ItemsStrip c={p.items} />}
      <div className="dates"><span>Start {fmtDShort(p.start_date)}</span><span>Target {fmtDShort(p.target_date)}{p.target_rev ? <span className="rev" title={`Target revised ${p.target_rev} time${p.target_rev === 1 ? "" : "s"}`}>R{p.target_rev}</span> : null}</span></div>
      <div className="card-status" onClick={stop} onKeyDown={stop} onMouseDown={stop} onDragStart={(e) => e.preventDefault()}>
        <select aria-label={`Status for ${title(p.name)}`} value={p.status} disabled={!canEdit} draggable={false}
          onChange={(e) => onStatus(e.target.value as Status)}>
          {STATUS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
    </article>
  );
}

/** Tiny progress strip on the card: items complete / on site / in production / approved / still in drawings. */
function ItemsStrip({ c }: { c: ItemCounts }) {
  const appr = c.items_approved - c.items_in_production - c.items_on_site;
  const todo = c.items_total - c.items_approved;
  return (
    <div className="card-items" title={`${c.items_total} items: ${c.items_complete} complete, ${c.items_on_site - c.items_complete} on site, ${c.items_in_production} in production, ${Math.max(appr, 0)} approved, ${todo} in drawings${c.items_attention ? ` · ${c.items_attention} need attention` : ""}`}>
      <Progress done={c.items_complete} site={c.items_on_site - c.items_complete} prod={c.items_in_production} appr={Math.max(appr, 0)} todo={todo} />
      <small>{c.items_approved}/{c.items_total} approved{c.items_in_production ? ` · ${c.items_in_production} in production` : ""}{c.items_attention ? <b className="crit"> · {c.items_attention} ⚠</b> : null}</small>
    </div>
  );
}
