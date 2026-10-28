"use client";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, title, PSTAGE_LABEL, type Item, type ItemProductionStage, type ProductionStage } from "@/lib/model";
import { moveProductionStage } from "@/app/actions";

/** Direction A "Ledger" (Tom, 28 Oct): one row per item, its six production stages laid along the row.
 *  Drag a bar to move it, drag its right edge to stretch it; the planned dates save and the owner hears via the digest. */
export type GanttRow = { item: Item; stages: ItemProductionStage[] };
export type GanttProject = { id: string; enquiry_no: string | null; name: string; pm: string | null; rows: GanttRow[] };
type Props = { projects: GanttProject[]; today: string; filter: "all" | "factory" | "site"; canEdit: boolean };

const FACTORY: ProductionStage[] = ["JOINERY", "PAINT", "DELIVERY"];
const D = (s: string) => new Date(s + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86400000);
const fmt = (s: string | null) => s ? D(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "—";

function itemNow(stages: ItemProductionStage[]): { label: string; tone: string } {
  const open = stages.filter((s) => !s.na);
  if (open.some((s) => s.status === "DELAYED")) return { label: "Delayed", tone: "crit" };
  if (open.some((s) => s.status === "ON_HOLD")) return { label: "On hold", tone: "warn" };
  if (open.length && open.every((s) => s.status === "COMPLETE")) return { label: "Complete", tone: "done" };
  const cur = open.find((s) => s.status !== "COMPLETE");
  return { label: cur ? PSTAGE_LABEL[cur.stage] : "—", tone: "ok" };
}

export default function ScheduleGantt({ projects, today, filter, canEdit }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [dayW, setDayW] = useState(26);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [local, setLocal] = useState<Record<string, { ps: string; pe: string }>>({});   // optimistic dates while saving
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<{ el: HTMLDivElement; st: ItemProductionStage; projectId: string; x0: number; resize: boolean; left: number; width: number; dd: number } | null>(null);

  const inFilter = (s: ItemProductionStage) => filter === "all" || (filter === "factory") === FACTORY.includes(s.stage);
  const dated = projects.flatMap((p) => p.rows.flatMap((r) => r.stages.filter((s) => !s.na && s.planned_start && s.planned_end && inFilter(s))));
  const minD = dated.length ? addDays(dated.reduce((m, s) => s.planned_start! < m ? s.planned_start! : m, dated[0].planned_start!), -7) : addDays(today, -14);
  const maxD = dated.length ? addDays(dated.reduce((m, s) => s.planned_end! > m ? s.planned_end! : m, dated[0].planned_end!), 14) : addDays(today, 45);
  const N = days(minD, maxD) + 1;
  const dates = Array.from({ length: N }, (_, k) => addDays(minD, k));
  const months: { label: string; span: number }[] = [];
  for (let k = 0; k < N;) { const d = D(dates[k]); const mEnd = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); const span = Math.min(N - k, days(dates[k], mEnd) + 1); months.push({ label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }), span }); k += span; }
  const LEFT = 420;

  useEffect(() => { scroll.current?.scrollTo({ left: Math.max(0, days(minD, today) * dayW - 260) }); }, [dayW]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (s: ItemProductionStage) => { const l = local[s.id]; return { ps: l?.ps ?? s.planned_start!, pe: l?.pe ?? s.planned_end! }; };

  const onDown = (e: React.MouseEvent<HTMLDivElement>, st: ItemProductionStage, projectId: string) => {
    if (!canEdit || !st.planned_start || !st.planned_end) return;
    e.preventDefault();
    const el = e.currentTarget;
    drag.current = { el, st, projectId, x0: e.clientX, resize: (e.target as HTMLElement).classList.contains("h"), left: parseFloat(el.style.left), width: parseFloat(el.style.width), dd: 0 };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => { const d = drag.current; if (!d) return; const dd = Math.round((e.clientX - d.x0) / dayW); d.dd = dd; if (d.resize) d.el.style.width = Math.max(dayW - 3, d.width + dd * dayW) + "px"; else d.el.style.left = d.left + dd * dayW + "px"; };
    const up = () => {
      const d = drag.current; drag.current = null; if (!d || !d.dd) { if (d) { d.el.style.left = d.left + "px"; d.el.style.width = d.width + "px"; } return; }
      const { ps, pe } = pos(d.st);
      const nps = d.resize ? ps : addDays(ps, d.dd), npe = addDays(pe, d.resize ? Math.max(d.dd, -days(ps, pe)) : d.dd);
      setLocal((l) => ({ ...l, [d.st.id]: { ps: nps, pe: npe } }));
      start(async () => { const r = await moveProductionStage(d.projectId, d.st.id, nps, npe); if (r?.error) { setErr(r.error); setLocal((l) => { const n = { ...l }; delete n[d.st.id]; return n; }); } else { setErr(null); router.refresh(); } });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setClosed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const shown = projects.map((p) => ({ ...p, rows: p.rows.filter((r) => r.stages.some((s) => !s.na && inFilter(s))) })).filter((p) => p.rows.length);

  return (
    <div className="gantt" style={{ ["--day" as string]: dayW + "px", ["--left" as string]: LEFT + "px" }}>
      <div className="gtools">
        <span className="segs"><button type="button" className={"seg2" + (dayW === 26 ? " on" : "")} onClick={() => setDayW(26)}>Days</button><button type="button" className={"seg2" + (dayW === 12 ? " on" : "")} onClick={() => setDayW(12)}>Weeks</button></span>
        <button type="button" className="btn ghost sm" onClick={() => scroll.current?.scrollTo({ left: Math.max(0, days(minD, today) * dayW - 260), behavior: "smooth" })}>Today</button>
        <span className="glegend"><i style={{ background: "var(--navy)" }} />Factory<i style={{ background: "#2F5A8F" }} />Site<i style={{ background: "var(--crit)" }} />Delayed<i style={{ background: "var(--warn)" }} />On hold<i style={{ background: "var(--ok)" }} />Complete<i style={{ background: "#fff", border: "1.5px dashed var(--line2)" }} />Planned</span>
        {err && <span className="msg err">{err}</span>}
      </div>
      <div className="gscroll" ref={scroll}>
        <table>
          <colgroup><col style={{ width: LEFT }} />{dates.map((d) => <col key={d} style={{ width: dayW }} />)}</colgroup>
          <thead>
            <tr><th className="lcol" rowSpan={2}><div className="lhead"><span>Code</span><span>Item</span><span>Now</span><span /></div></th>{months.map((m, i) => <th key={i} className="gm" colSpan={m.span}>{m.label}</th>)}</tr>
            <tr>{dates.map((s) => { const d = D(s).getUTCDay(); return <th key={s} className={`gd${d === 5 || d === 6 ? " we" : ""}${s === today ? " today" : ""}`}>{dayW >= 20 ? D(s).getUTCDate() : (d === 0 ? D(s).getUTCDate() : "")}</th>; })}</tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td className="lcol"><div className="item"><span /><span className="nm">Nothing scheduled yet — issue an item to production and give its stages dates.</span></div></td><td colSpan={N} /></tr>}
            {shown.map((p) => (
              <Fragment key={p.id}>
                <tr className={`gproj${closed.has(p.id) ? " closed" : ""}`} onClick={() => toggle(p.id)}>
                  <td className="lcol"><div className="phead"><span className="tri">▼</span><span className="enq">{p.enquiry_no ?? "—"}</span><span className="pn">{title(p.name)}</span><span className="count">{p.rows.length} item{p.rows.length === 1 ? "" : "s"}{p.pm ? ` · PM ${title(p.pm)}` : ""}</span></div></td>
                  <td className="lane" colSpan={N}><i className="tl" style={{ left: days(minD, today) * dayW + dayW / 2 }} /></td>
                </tr>
                {!closed.has(p.id) && p.rows.map(({ item, stages }) => {
                  const now = itemNow(stages);
                  const nextOwner = stages.find((s) => !s.na && s.status !== "COMPLETE");
                  return (
                    <tr key={item.id}>
                      <td className="lcol"><div className="item"><Link href={`/projects/${item.project_id}?item=${item.id}`} className="code">{item.drawing_code}</Link><span className="nm">{item.name}{item.area ? <small> · {item.area}</small> : null}</span><span className={`chip ${now.tone}`}>{now.label}</span><span className={`av${nextOwner && !FACTORY.includes(nextOwner.stage) ? " pm" : ""}`}>{nextOwner ? (FACTORY.includes(nextOwner.stage) ? "GJ" : "PM") : "✓"}</span></div></td>
                      <td className="lane" colSpan={N}>
                        <i className="tl" style={{ left: days(minD, today) * dayW + dayW / 2 }} />
                        {stages.filter((s) => !s.na && inFilter(s)).map((s) => {
                          if (!s.planned_start || !s.planned_end) return null;
                          const { ps, pe } = pos(s);
                          const x = days(minD, ps) * dayW, w = (days(ps, pe) + 1) * dayW - 3;
                          const late = s.status !== "COMPLETE" && pe < today;
                          const cls = late && s.status !== "ON_HOLD" ? "DELAYED" : s.status;
                          return (
                            <div key={s.id} className={`bar ${cls}${FACTORY.includes(s.stage) ? "" : " site"}${canEdit ? " drag" : ""}`} style={{ left: x, width: w }} onMouseDown={(e) => onDown(e, s, item.project_id)}
                              title={`${PSTAGE_LABEL[s.stage]} — ${item.name}\n${fmt(ps)} → ${fmt(pe)} · ${days(ps, pe) + 1}d · ${FACTORY.includes(s.stage) ? "Gajanand" : "PM"}\n${s.status.replace("_", " ").toLowerCase()}${s.actual_start ? ` · started ${fmt(s.actual_start)}` : ""}${s.actual_end ? ` · done ${fmt(s.actual_end)}` : ""}${s.notes ? `\n${s.notes}` : ""}`}>
                              <span>{w > 46 ? PSTAGE_LABEL[s.stage] : ""}</span>{canEdit && <i className="h" />}
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
