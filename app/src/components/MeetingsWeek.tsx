"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveMeeting, cancelMeeting } from "@/app/actions";
import { addDays, fmtDay, fmtDayLong, hm, mins, title as tc, DAY_START, DAY_END, WEEK_DAYS, LOCATION_LABEL, type Meeting, type MeetingLocation } from "@/lib/model";

type PersonLite = { id: string; name: string; role: string };
type ProjectLite = { id: string; name: string; enquiry_no: string | null };
type Draft = Partial<Meeting> & { meeting_date: string; location: MeetingLocation };
const HOUR = 56; // px per hour on the desktop grid

/** side-by-side columns for meetings that overlap within one lane (site meetings can; room ones can't) */
function layout(ms: Meeting[]) {
  const sorted = [...ms].sort((a, b) => mins(a.start_time) - mins(b.start_time) || mins(b.end_time) - mins(a.end_time));
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: Meeting[] = []; let colEnds: number[] = []; let clusterEnd = -1;
  const flush = () => { for (const m of cluster) out.get(m.id)!.cols = colEnds.length; cluster = []; colEnds = []; };
  for (const m of sorted) {
    const s = mins(m.start_time), e = mins(m.end_time);
    if (s >= clusterEnd) { flush(); clusterEnd = -1; }
    let col = colEnds.findIndex((end) => end <= s);
    if (col === -1) { col = colEnds.length; colEnds.push(e); } else colEnds[col] = e;
    out.set(m.id, { col, cols: 1 }); cluster.push(m); clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return out;
}

function Block({ m, onOpen, pos }: { m: Meeting; onOpen: () => void; pos: { col: number; cols: number } }) {
  const top = ((mins(m.start_time) - DAY_START * 60) / 60) * HOUR;
  const h = Math.max(((mins(m.end_time) - mins(m.start_time)) / 60) * HOUR, 22);
  const w = 100 / pos.cols;
  return (
    <button type="button" className={`mblock ${m.location.toLowerCase()}`} style={{ top, height: h, left: `${pos.col * w}%`, width: `calc(${w}% - 3px)` }} onClick={onOpen} title={`${hm(m.start_time)}–${hm(m.end_time)} ${m.title}`}>
      <span className="mtime">{hm(m.start_time)}–{hm(m.end_time)}</span>
      <span className="mtitle">{m.title}</span>
      {h >= 44 && m.attendees.length > 0 && <span className="mwho">{m.attendees.map(tc).join(", ")}</span>}
    </button>
  );
}

function Form({ draft, people, projects, onClose }: { draft: Draft; people: PersonLite[]; projects: ProjectLite[]; onClose: (saved?: boolean) => void }) {
  const [state, action, pending] = useActionState(saveMeeting.bind(null, draft.id ?? null), null as { error?: string; ok?: boolean; at?: string } | null);
  const [loc, setLoc] = useState<MeetingLocation>(draft.location);
  const [picked, setPicked] = useState<Set<string>>(new Set(draft.attendee_ids ?? []));
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  useEffect(() => { if (state?.ok) onClose(true); }, [state?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const doCancel = async () => {
    if (!draft.id || !confirm("Cancel this meeting? It will disappear from the diary and attendees will be told.")) return;
    setCancelling(true); const r = await cancelMeeting(draft.id); setCancelling(false);
    if (r?.error) setCancelErr(r.error); else onClose(true);
  };
  return (
    <div className="mdim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="mform panel" action={action}>
        <div className="mform-head">
          <h2>{draft.id ? "Edit meeting" : "New meeting"}</h2>
          <button type="button" className="x" onClick={() => onClose()} aria-label="Close">×</button>
        </div>
        <div className="field wide"><label>Title</label><input name="title" defaultValue={draft.title ?? ""} placeholder="e.g. Client design review" required autoFocus /></div>
        <div className="field wide">
          <label>Where</label>
          <div className="segs">
            {(["ROOM", "SITE"] as MeetingLocation[]).map((l) => (
              <label key={l} className={"seg2" + (loc === l ? " on" : "")}><input type="radio" name="location" value={l} checked={loc === l} onChange={() => setLoc(l)} />{LOCATION_LABEL[l]}</label>
            ))}
          </div>
          <small className="hint">{loc === "ROOM" ? "The room can't be double-booked — you'll be told if it's taken." : "Put the site address in the notes."}</small>
        </div>
        <div className="field"><label>Date</label><input type="date" name="meeting_date" defaultValue={draft.meeting_date} required /></div>
        <div className="field times"><label>Time</label><div><input type="time" name="start_time" defaultValue={hm(draft.start_time) || "09:00"} step={900} required /><span>to</span><input type="time" name="end_time" defaultValue={hm(draft.end_time) || "10:00"} step={900} required /></div></div>
        <div className="field wide"><label>Project <small>optional</small></label>
          <select name="project_id" defaultValue={draft.project_id ?? ""}><option value="">— none —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.enquiry_no ? `${p.enquiry_no} · ` : ""}{tc(p.name)}</option>)}</select>
        </div>
        <div className="field wide"><label>Who's in it</label>
          <div className="chips">
            {people.map((p) => (
              <label key={p.id} className={"chip" + (picked.has(p.id) ? " on" : "")}><input type="checkbox" name="attendees" value={p.id} checked={picked.has(p.id)} onChange={() => toggle(p.id)} />{tc(p.name)}</label>
            ))}
          </div>
        </div>
        <div className="field wide"><label>Notes <small>{loc === "SITE" ? "site address, what it's about" : "agenda, what it's about"}</small></label><textarea name="notes" rows={3} defaultValue={draft.notes ?? ""} /></div>
        <div className="actions">
          <button className="btn bronze" disabled={pending}>{pending ? "Saving…" : draft.id ? "Save changes" : "Book it"}</button>
          <button type="button" className="btn ghost" onClick={() => onClose()}>Close</button>
          {draft.id && <button type="button" className="btn danger" style={{ marginLeft: "auto" }} onClick={doCancel} disabled={cancelling}>{cancelling ? "Cancelling…" : "Cancel meeting"}</button>}
        </div>
        {(state?.error || cancelErr) && <div className="msg err mclash">{state?.error ?? cancelErr}</div>}
        {draft.id && <div className="note">Added by {tc(draft.created_by_name)}{draft.updated_by_name && draft.updated_by_name !== draft.created_by_name ? ` · last edited by ${tc(draft.updated_by_name)}` : ""}. Anyone on the team can edit any meeting.</div>}
      </form>
    </div>
  );
}

export default function MeetingsWeek({ start, meetings, people, projects, today }: { start: string; meetings: Meeting[]; people: PersonLite[]; projects: ProjectLite[]; today: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const days = useMemo(() => Array.from({ length: WEEK_DAYS }, (_, i) => addDays(start, i)), [start]);
  const byDay = useMemo(() => { const m = new Map<string, Meeting[]>(); for (const x of meetings) m.set(x.meeting_date, [...(m.get(x.meeting_date) ?? []), x]); return m; }, [meetings]);
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
  const roomN = meetings.filter((m) => m.location === "ROOM").length;
  const close = (saved?: boolean) => { setDraft(null); if (saved) router.refresh(); };

  const slotClick = (day: string, lane: MeetingLocation, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const y = e.nativeEvent.offsetY; const startMin = DAY_START * 60 + Math.floor(y / HOUR * 2) * 30; // snap to 30 min
    const t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    setDraft({ meeting_date: day, location: lane, start_time: t(startMin), end_time: t(Math.min(startMin + 60, DAY_END * 60)) });
  };

  return (
    <div className="meetings">
      <div className="mnav">
        <Link href={`/meetings?w=${addDays(start, -7)}`} className="btn ghost sm">‹ Prev</Link>
        <Link href="/meetings" className="btn ghost sm">This week</Link>
        <Link href={`/meetings?w=${addDays(start, 7)}`} className="btn ghost sm">Next ›</Link>
        <h2>{fmtDay(days[0])} – {fmtDay(days[days.length - 1])}</h2>
        <span className="mlegend"><i className="room" /> Meeting room · {roomN} booked <i className="site" /> On site · {meetings.length - roomN}</span>
        <button className="btn bronze sm" style={{ marginLeft: "auto" }} onClick={() => setDraft({ meeting_date: days.includes(today) ? today : days[0], location: "ROOM" })}>+ Meeting</button>
      </div>

      {/* desktop: week grid */}
      <div className="mgrid" style={{ gridTemplateColumns: `48px repeat(${WEEK_DAYS}, minmax(0, 1fr))` }}>
        <div className="maxis mhead" />
        {days.map((d) => <div key={d} className={"mhead" + (d === today ? " today" : "")}><b>{fmtDay(d).split(" ")[0]}</b><span>{fmtDay(d).replace(/^\w+ /, "")}</span><div className="lanes"><em>Room</em><em>Site</em></div></div>)}
        <div className="maxis">{hours.map((h) => <span key={h} style={{ top: (h - DAY_START) * HOUR }}>{String(h).padStart(2, "0")}:00</span>)}</div>
        {days.map((d) => {
          const ms = byDay.get(d) ?? [];
          const lanes: MeetingLocation[] = ["ROOM", "SITE"];
          return (
            <div key={d} className={"mday" + (d === today ? " today" : "")} style={{ height: (DAY_END - DAY_START) * HOUR }}>
              {hours.slice(1).map((h) => <i key={h} className="hline" style={{ top: (h - DAY_START) * HOUR }} />)}
              {lanes.map((lane) => { const lm = ms.filter((m) => m.location === lane); const pos = layout(lm); return (
                <div key={lane} className={`mlane ${lane.toLowerCase()}`} onClick={(e) => slotClick(d, lane, e)} title={`Click to book: ${LOCATION_LABEL[lane]}`}>
                  {lm.map((m) => <Block key={m.id} m={m} pos={pos.get(m.id)!} onOpen={() => setDraft(m)} />)}
                </div>
              ); })}
            </div>
          );
        })}
      </div>

      {/* phone: day list */}
      <div className="mlist">
        {days.map((d) => { const ms = byDay.get(d) ?? []; return (
          <section key={d} className={d === today ? "today" : ""}>
            <h3>{fmtDayLong(d)}{d === today && <span className="pill soon">Today</span>}</h3>
            {ms.length === 0 ? <div className="mnone">No meetings</div> : ms.map((m) => (
              <button type="button" key={m.id} className="mrow" onClick={() => setDraft(m)}>
                <span className="mtime">{hm(m.start_time)}<br />{hm(m.end_time)}</span>
                <span className={`mdot ${m.location.toLowerCase()}`} />
                <span className="mbody"><b>{m.title}</b><small>{LOCATION_LABEL[m.location]}{m.project_name ? ` · ${tc(m.project_name)}` : ""}{m.attendees.length ? ` · ${m.attendees.map(tc).join(", ")}` : ""}</small></span>
              </button>
            ))}
          </section>
        ); })}
      </div>

      {draft && <Form key={draft.id ?? "new"} draft={draft} people={people} projects={projects} onClose={close} />}
    </div>
  );
}
