import Link from "next/link";
import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import MonthByPerson, { type CalEvent } from "@/components/MonthByPerson";
import ScheduleGantt, { type GanttProject } from "@/components/ScheduleGantt";
import ScheduleWeek from "@/components/ScheduleWeek";
import { getProjects, getMe, getPeople, getAllItems, getAllProductionStages, getMeetings, getStageTargets } from "@/lib/data";
import { title, addDays, todayDubai, PSTAGE_LABEL, ROLE_LABEL, type Project } from "@/lib/model";

export const dynamic = "force-dynamic";

type SP = { m?: string; who?: string; view?: string; f?: string };
const ROLES = ["PM", "DESIGNER", "TECHNICAL_DESIGNER", "PRODUCTION", "ESTIMATOR", "PROJECT_COORDINATOR", "MANAGEMENT"];

/** Schedule → by person. A month grid of everything that has a date and an owner: the stage each person holds the
 *  ball on (started → target), their drawings' R0 dates, their production stages, their meetings, next actions and
 *  hold reviews. Everyone lands on "Just me" and can switch to a person, a role or everyone — Darren, 28 Oct. */
async function Inner_SchedulePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayDubai();
  const view = sp.view === "person" || sp.view === "week" ? sp.view : "project";
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? (sp.m as string) : today.slice(0, 7);
  const first = `${month}-01`;
  const [y, mo] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  // the grid shows whole weeks, Sunday → Saturday, so fetch a little either side
  const gridStart = addDays(first, -new Date(first + "T00:00:00Z").getUTCDay());
  const gridEnd = addDays(last, 6 - new Date(last + "T00:00:00Z").getUTCDay());

  const [projects, me, people, items, stages, meetings, targets] = await Promise.all([getProjects(), getMe(), getPeople(), getAllItems(), getAllProductionStages(), getMeetings(gridStart, gridEnd), getStageTargets()]);
  const who = sp.who ?? "me";
  const active = people.filter((p) => p.is_active);
  const byId = new Map(people.map((p) => [p.id, p]));
  const inScope = (id: string | null): boolean => {
    if (!id) return false;
    if (who === "all") return true;
    if (who === "me") return id === me.id;
    if (who.startsWith("role:")) return byId.get(id)?.role === who.slice(5);
    return id === who;
  };
  const tgt = new Map(targets.map((t) => [t.stage_no, t.target_days]));
  const overlaps = (a: string, b: string) => a <= gridEnd && b >= gridStart;
  const ev: CalEvent[] = [];
  const live = projects.filter((p) => !["LOST", "MERGED", "COMPLETED"].includes(p.status));

  for (const p of live as Project[]) {
    // the ball: stage entered → target (or +14 days when no target yet)
    if (p.ball_holder_id && inScope(p.ball_holder_id) && p.stage_entered_at) {
      const s = p.stage_entered_at.slice(0, 10); const days = p.stage_target_days ?? tgt.get(p.stage ?? -1) ?? 14;
      const e = addDays(s, Math.max(1, days));
      if (overlaps(s, e)) ev.push({ id: `ball-${p.id}`, kind: "ball", title: `${p.enquiry_no ?? ""} ${title(p.name)} — ${p.stage_short ?? "stage"}`, person: p.ball_holder_id, start: s, end: e, tone: p.stage_overdue ? "crit" : p.flow_status === "ON_HOLD" ? "warn" : "navy", href: `/projects/${p.id}` });
    }
    if (p.target_date && overlaps(p.target_date, p.target_date) && [p.pm_id, p.ball_holder_id].some(inScope)) ev.push({ id: `tgt-${p.id}`, kind: "flag", title: `Target: ${title(p.name)}`, person: p.pm_id ?? p.ball_holder_id, start: p.target_date, end: p.target_date, tone: p.target_date < today ? "crit" : "bronze", href: `/projects/${p.id}` });
    if (p.next_action && p.next_action_due && overlaps(p.next_action_due, p.next_action_due) && inScope(p.next_action_owner_id ?? p.ball_holder_id)) ev.push({ id: `na-${p.id}`, kind: "dot", title: `${p.next_action} — ${title(p.name)}`, person: p.next_action_owner_id ?? p.ball_holder_id, start: p.next_action_due, end: p.next_action_due, tone: p.next_action_due < today ? "crit" : "navy", href: `/projects/${p.id}` });
    if (p.hold_id && p.hold_review_date && overlaps(p.hold_review_date, p.hold_review_date) && inScope(p.ball_holder_id)) ev.push({ id: `hold-${p.id}`, kind: "dot", title: `Hold review — ${title(p.name)}`, person: p.ball_holder_id, start: p.hold_review_date, end: p.hold_review_date, tone: "warn", href: `/projects/${p.id}` });
  }
  for (const i of items) {
    if (i.cancelled || i.project_status === "COMPLETED") continue;
    if (i.planned_submission && ["NOT_STARTED", "DRAWING"].includes(i.stage) && overlaps(i.planned_submission, i.planned_submission) && inScope(i.designer_id))
      ev.push({ id: `r0-${i.id}`, kind: "dot", title: `R0 due: ${i.drawing_code} ${i.name}`, person: i.designer_id, start: i.planned_submission, end: i.planned_submission, tone: i.submission_overdue ? "crit" : "navy", href: `/projects/${i.project_id}?item=${i.id}` });
  }
  const gaju = active.find((p) => p.role === "PRODUCTION")?.id ?? null;
  for (const s of stages) {
    if (s.na || s.status === "COMPLETE" || !s.planned_start || !s.planned_end) continue;
    const factory = ["JOINERY", "PAINT", "DELIVERY"].includes(s.stage);
    const owner = factory ? gaju : s.item.pm_id;
    if (!inScope(owner) || !overlaps(s.planned_start, s.planned_end)) continue;
    ev.push({ id: `ps-${s.id}`, kind: "bar", title: `${PSTAGE_LABEL[s.stage]}: ${s.item.drawing_code} ${s.item.name}`, person: owner, start: s.planned_start, end: s.planned_end, tone: s.status === "DELAYED" || (s.planned_end < today) ? "crit" : s.status === "ON_HOLD" ? "warn" : s.status === "IN_PROGRESS" ? (factory ? "navy" : "site") : "plan", href: `/projects/${s.item.project_id}?item=${s.item.id}` });
  }
  for (const m of meetings) {
    const ids = m.attendee_ids.filter(inScope); if (!ids.length) continue;
    ev.push({ id: `m-${m.id}`, kind: "meet", title: `${m.start_time.slice(0, 5)} ${m.title}`, person: ids[0], start: m.meeting_date, end: m.meeting_date, tone: "meet", href: `/meetings?w=${m.meeting_date}` });
  }

  const peopleOpts = active.map((p) => ({ id: p.id, name: p.full_name ?? title(p.name), role: p.role }));
  const prev = `${new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7)}`, next = `${new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7)}`;
  const label = who === "me" ? "Just me" : who === "all" ? "Everyone" : who.startsWith("role:") ? `All ${(ROLE_LABEL[who.slice(5)] ?? who.slice(5)).toLowerCase()}s` : (byId.get(who)?.full_name ?? title(byId.get(who)?.name ?? ""));
  // By project (Gantt) and This week share the production-stage rows
  const gp: GanttProject[] = [];
  for (const p of live) {
    const rows = items.filter((i) => i.project_id === p.id && !i.cancelled).map((item) => ({ item, stages: stages.filter((s) => s.item_id === item.id).sort((a, b) => a.stage_no - b.stage_no) })).filter((r) => r.stages.length);
    if (rows.length) gp.push({ id: p.id, enquiry_no: p.enquiry_no, name: p.name, pm: p.pm, rows });
  }
  gp.sort((a, b) => (a.enquiry_no ?? "").localeCompare(b.enquiry_no ?? ""));
  const filter = sp.f === "factory" || sp.f === "site" ? sp.f : "all";
  const wkStart = addDays(today, -new Date(today + "T00:00:00Z").getUTCDay()), wkEnd = addDays(wkStart, 6);
  const canEdit = me.isAdmin || me.canProjects || me.role === "PRODUCTION" || me.role === "PM";
  const tabs = (
    <div className="mnav">
      <span className="segs who">
        <Link href={`/schedule?view=project`} className={"seg2" + (view === "project" ? " on" : "")}>By project</Link>
        <Link href={`/schedule?view=person`} className={"seg2" + (view === "person" ? " on" : "")}>By person</Link>
        <Link href={`/schedule?view=week`} className={"seg2" + (view === "week" ? " on" : "")}>This week</Link>
      </span>
      {view === "project" && <span className="segs who" style={{ marginLeft: 8 }}>
        <Link href={`/schedule?view=project`} className={"seg2" + (filter === "all" ? " on" : "")}>Everything</Link>
        <Link href={`/schedule?view=project&f=factory`} className={"seg2" + (filter === "factory" ? " on" : "")}>Factory</Link>
        <Link href={`/schedule?view=project&f=site`} className={"seg2" + (filter === "site" ? " on" : "")}>Site</Link>
      </span>}
    </div>
  );
  if (view === "project") return (
    <Shell active="schedule">
      <main className="fill column">
        <div className="meetings ganttpage">
          {tabs}
          <ScheduleGantt projects={gp} today={today} filter={filter} canEdit={canEdit} />
          <p className="note">One row per item, its six production stages along the row. Drag a bar to move it, drag its right edge to stretch it — the dates save and the stage owner hears in the next digest. Factory stages are Gajanand’s, site stages the PM’s.</p>
        </div>
      </main>
    </Shell>
  );
  if (view === "week") return (
    <Shell active="schedule">
      <main className="column">
        <div className="meetings">
          {tabs}
          <ScheduleWeek rows={stages.map((s) => ({ s, item: s.item }))} weekStart={wkStart} weekEnd={wkEnd} today={today} />
        </div>
      </main>
    </Shell>
  );
  return (
    <Shell active="schedule">
      <main className="column">
        <div className="meetings">
          {tabs}
          <div className="mnav">
            <Link href={`/schedule?view=person&m=${prev}&who=${who}`} className="btn ghost sm">‹ Prev</Link>
            <Link href={`/schedule?view=person&who=${who}`} className="btn ghost sm">This month</Link>
            <Link href={`/schedule?view=person&m=${next}&who=${who}`} className="btn ghost sm">Next ›</Link>
            <h2>{new Date(first + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
            <span className="segs who">
              <Link href={`/schedule?view=person&m=${month}&who=me`} className={"seg2" + (who === "me" ? " on" : "")}>Just me</Link>
              <Link href={`/schedule?view=person&m=${month}&who=all`} className={"seg2" + (who === "all" ? " on" : "")}>Everyone</Link>
            </span>
            <form className="whoform" action="/schedule"><input type="hidden" name="view" value="person" /><input type="hidden" name="m" value={month} />
              <select name="who" defaultValue={who} key={who}>
                <option value="me">Just me</option><option value="all">Everyone</option>
                <optgroup label="By role">{ROLES.map((r) => <option key={r} value={`role:${r}`}>All {(ROLE_LABEL[r] ?? r).toLowerCase()}s</option>)}</optgroup>
                <optgroup label="By person">{peopleOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
              </select><button className="btn ghost sm">Show</button>
            </form>
            <span className="mlegend">Showing <b>{label}</b> · {ev.length} thing{ev.length === 1 ? "" : "s"} this month</span>
          </div>
          <MonthByPerson month={month} gridStart={gridStart} gridEnd={gridEnd} today={today} events={ev} people={peopleOpts} multi={who !== "me" && !byId.has(who)} />
          <p className="note">Bars: the stage you hold the ball on (started → target), production stages you own. Dots: R0 due, next action, hold review. Meetings in bronze. Overlaps stack on the same days. <Link href="/meetings">Meetings diary</Link> · <Link href="/drawings">All drawings</Link></p>
        </div>
      </main>
    </Shell>
  );
}

export default async function SchedulePage(props: Parameters<typeof Inner_SchedulePage>[0]) {
  try { return await Inner_SchedulePage(props); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e;
    return <Shell><Failed what="the schedule" error={e} /></Shell>;
  }
}
