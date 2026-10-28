import Link from "next/link";
import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import { getAllItems, getMe, getProjects, getPeople } from "@/lib/data";
import { title, fmtDShort, revLabel, todayDubai, addDays, type Item, type Project } from "@/lib/model";
import { StageChip } from "@/components/StageStrip";

export const dynamic = "force-dynamic";

/** Per designer: what they owe and what's waiting on them. Items plan step 4. Darren's and the designers' screen. */
async function Inner_DesignersPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { who } = await searchParams;
  const [items, me, projects, people] = await Promise.all([getAllItems(), getMe(), getProjects(), getPeople()]);
  const today = todayDubai();
  const weekEnd = addDays(today, 7);
  const live = items.filter((i) => !i.cancelled && i.project_status !== "COMPLETED");
  const awarded = projects.filter((p) => !["QUOTE", "LOST", "COMPLETED", "MERGED"].includes(p.status) && !p.deleted_at);
  const designers = people.filter((p) => p.is_active && (p.role === "DESIGNER" || p.role === "TECHNICAL_DESIGNER")).sort((a, b) => a.name.localeCompare(b.name));
  // anyone with items or awarded projects who isn't filed as a designer still gets a card (e.g. a PM drawing their own)
  for (const id of new Set([...live.map((i) => i.designer_id), ...awarded.map((p) => p.designer_id)])) if (id && !designers.some((d) => d.id === id)) { const p = people.find((x) => x.id === id); if (p) designers.push(p); }
  const shown = who ? designers.filter((d) => d.name === who || d.id === who) : designers;
  const mine = designers.find((d) => d.id === me.id);

  const board = (d: typeof designers[number]) => {
    const its = live.filter((i) => i.designer_id === d.id);
    const noList = awarded.filter((p) => p.designer_id === d.id && !live.some((i) => i.project_id === p.id));
    const drawing = its.filter((i) => i.stage === "NOT_STARTED" || i.stage === "DRAWING").sort((a, b) => (a.planned_submission ?? "9") < (b.planned_submission ?? "9") ? -1 : 1);
    const dueWeek = drawing.filter((i) => i.planned_submission && i.planned_submission <= weekEnd);
    const returned = its.filter((i) => i.current_status === "C");
    const withClient = its.filter((i) => i.stage === "SUBMITTED").sort((a, b) => (a.last_submitted ?? "") < (b.last_submitted ?? "") ? -1 : 1);
    const problem = its.filter((i) => i.past_r3 && i.stage !== "COMPLETE");
    const approved = its.filter((i) => !["NOT_STARTED", "DRAWING", "SUBMITTED"].includes(i.stage)).length;
    const attention = noList.length + dueWeek.filter((i) => i.submission_overdue).length + returned.length + withClient.filter((i) => i.client_overdue).length;
    return { d, its, noList, drawing, dueWeek, returned, withClient, problem, approved, attention };
  };
  const boards = shown.map(board).sort((a, b) => b.attention - a.attention || a.d.name.localeCompare(b.d.name));

  const Row = ({ i, note }: { i: Item; note?: string }) => (
    <li>
      <Link href={`/projects/${i.project_id}?item=${i.id}`} className="dcode">{i.drawing_code}</Link>
      <span className="dname">{i.name}{i.area ? <small> · {i.area}</small> : null}</span>
      <span className="dproj"><span className="enq">{i.enquiry_no ?? "—"}</span> {title(i.project_name)}</span>
      <StageChip i={i} />
      <span className="dnote">{note ?? ""}{i.current_revision != null ? ` · ${revLabel(i.current_revision)}` : ""}</span>
    </li>
  );
  const ProjRow = ({ p }: { p: Project }) => (
    <li><span className="dcode"><span className="enq">{p.enquiry_no ?? "—"}</span></span><span className="dname"><Link href={`/projects/${p.id}`}>{title(p.name)}</Link>{p.client ? <small> · {title(p.client)}</small> : null}</span><span className="dnote crit">no item list yet</span></li>
  );

  return (
    <Shell active="designers">
      <section className="summary">
        <div className="stats">
          <div className="stat"><b>{boards.length}</b><span>designers</span></div>
          <div className={`stat${boards.some((b) => b.noList.length) ? " crit" : ""}`}><b>{boards.reduce((n, b) => n + b.noList.length, 0)}</b><span>awarded projects with no item list</span></div>
          <div className="stat"><b>{boards.reduce((n, b) => n + b.dueWeek.length, 0)}</b><span>R0s due this week</span></div>
          <div className={`stat${boards.some((b) => b.returned.length) ? " crit" : ""}`}><b>{boards.reduce((n, b) => n + b.returned.length, 0)}</b><span>returned for revision</span></div>
          <div className="stat"><b>{boards.reduce((n, b) => n + b.withClient.length, 0)}</b><span>with the client</span></div>
        </div>
        <p className="note teamnote">Each designer's drawings: what to start, what's due in the next seven days, what came back marked C, what the client is sitting on. {mine ? <Link href={`/designers?who=${mine.id}`}>Just mine</Link> : null}{who ? <> · <Link href="/designers">Everyone</Link></> : null} · <Link href="/drawings">All drawings</Link></p>
      </section>
      <main className="column">
        <div className="listview designers">
          {boards.map(({ d, its, noList, drawing, dueWeek, returned, withClient, problem, approved, attention }) => (
            <section key={d.id} className={`panel dboard${attention ? " needs" : ""}`}>
              <header>
                <b className="av">{d.name.slice(0, 2)}</b>
                <div><h2>{d.full_name ?? title(d.name)}</h2><small>{its.length} item{its.length === 1 ? "" : "s"} on {new Set(its.map((i) => i.project_id)).size} project{new Set(its.map((i) => i.project_id)).size === 1 ? "" : "s"} · {approved} approved or beyond{attention ? ` · ${attention} need attention` : ""}</small></div>
                <Link href={`/drawings?designer=${d.name}`} className="btn ghost sm">All their drawings</Link>
              </header>
              {noList.length > 0 && <div className="dsec"><h3>Projects waiting for an item list <span className="count">{noList.length}</span></h3><ul>{noList.map((p) => <ProjRow key={p.id} p={p} />)}</ul></div>}
              {returned.length > 0 && <div className="dsec"><h3>Returned — revise and resubmit <span className="count">{returned.length}</span></h3><ul>{returned.map((i) => <Row key={i.id} i={i} note={`returned ${fmtDShort(i.last_returned)}`} />)}</ul></div>}
              {dueWeek.length > 0 && <div className="dsec"><h3>R0 due in the next 7 days <span className="count">{dueWeek.length}</span></h3><ul>{dueWeek.map((i) => <Row key={i.id} i={i} note={i.submission_overdue ? `overdue — was ${fmtDShort(i.planned_submission)}` : `due ${fmtDShort(i.planned_submission)}`} />)}</ul></div>}
              {drawing.length > dueWeek.length && <div className="dsec"><h3>In hand <span className="count">{drawing.length - dueWeek.length}</span></h3><ul>{drawing.filter((i) => !dueWeek.includes(i)).map((i) => <Row key={i.id} i={i} note={i.planned_submission ? `due ${fmtDShort(i.planned_submission)}` : "no R0 date"} />)}</ul></div>}
              {withClient.length > 0 && <div className="dsec"><h3>With the client <span className="count">{withClient.length}</span></h3><ul>{withClient.map((i) => <Row key={i.id} i={i} note={`sent ${fmtDShort(i.last_submitted)}${i.client_overdue ? " — chase" : ""}`} />)}</ul></div>}
              {problem.length > 0 && <div className="dsec"><h3>Problem drawings — past R3 <span className="count">{problem.length}</span></h3><ul>{problem.map((i) => <Row key={i.id} i={i} />)}</ul></div>}
              {its.length === 0 && noList.length === 0 && <p className="empty-items">Nothing assigned.</p>}
            </section>
          ))}
          {boards.length === 0 && <p className="empty-items">No designers on the team list yet.</p>}
        </div>
      </main>
    </Shell>
  );
}

export default async function DesignersPage(props: Parameters<typeof Inner_DesignersPage>[0]) {
  try { return await Inner_DesignersPage(props); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e;
    return <Shell><Failed what="the designer board" error={e} /></Shell>;
  }
}
