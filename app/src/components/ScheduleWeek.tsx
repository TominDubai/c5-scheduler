import Link from "next/link";
import { title, PSTAGE_LABEL, fmtDShort, type Item, type ItemProductionStage, type ProductionStage } from "@/lib/model";

/** "This week in the factory" (Joinery / Paint / Delivery — Gajanand) and "This week on site" (Install / Stone /
 *  Snagging — per PM). Same data as the Gantt, as two lists. Phones land here. */
const FACTORY: ProductionStage[] = ["JOINERY", "PAINT", "DELIVERY"];
type Row = { s: ItemProductionStage; item: Item };

export default function ScheduleWeek({ rows, weekStart, weekEnd, today }: { rows: Row[]; weekStart: string; weekEnd: string; today: string }) {
  const inWeek = rows.filter(({ s }) => !s.na && s.status !== "COMPLETE" && s.planned_start && s.planned_end && s.planned_start <= weekEnd && s.planned_end >= weekStart);
  const late = rows.filter(({ s }) => !s.na && s.status !== "COMPLETE" && s.planned_end && s.planned_end < today && !inWeek.includes(rows.find((r) => r.s.id === s.id)!));
  const factory = inWeek.filter(({ s }) => FACTORY.includes(s.stage)).sort((a, b) => a.s.planned_start!.localeCompare(b.s.planned_start!));
  const site = inWeek.filter(({ s }) => !FACTORY.includes(s.stage)).sort((a, b) => (a.item.pm ?? "").localeCompare(b.item.pm ?? "") || a.s.planned_start!.localeCompare(b.s.planned_start!));
  const Line = ({ s, item }: Row) => {
    const lateNow = s.planned_end! < today;
    return (
      <li className={lateNow ? "late" : ""}>
        <span className="when">{fmtDShort(s.planned_start)} – {fmtDShort(s.planned_end)}</span>
        <span className={`stagepill ${s.status}`}>{PSTAGE_LABEL[s.stage]}</span>
        <Link href={`/projects/${item.project_id}?item=${item.id}`} className="dcode">{item.drawing_code}</Link>
        <span className="dname">{item.name}<small> · {title(item.project_name)}</small></span>
        <span className="dnote">{s.status === "IN_PROGRESS" ? "in progress" : s.status === "DELAYED" ? "delayed" : s.status === "ON_HOLD" ? "on hold" : lateNow ? `should have finished ${fmtDShort(s.planned_end)}` : "planned"}{s.notes ? ` · ${s.notes}` : ""}</span>
      </li>
    );
  };
  const byPm = new Map<string, Row[]>();
  for (const r of site) byPm.set(r.item.pm ?? "No PM", [...(byPm.get(r.item.pm ?? "No PM") ?? []), r]);
  return (
    <div className="listview designers week">
      <section className="panel dboard">
        <header><b className="av">GJ</b><div><h2>This week in the factory</h2><small>Joinery, paint, delivery · {factory.length} stage{factory.length === 1 ? "" : "s"}</small></div></header>
        {factory.length ? <div className="dsec"><ul>{factory.map((r) => <Line key={r.s.id} {...r} />)}</ul></div> : <p className="empty-items">Nothing in the factory this week.</p>}
      </section>
      <section className="panel dboard">
        <header><b className="av pm">PM</b><div><h2>This week on site</h2><small>Install, stone, snagging · {site.length} stage{site.length === 1 ? "" : "s"}</small></div></header>
        {site.length ? [...byPm.entries()].map(([pm, rs]) => <div key={pm} className="dsec"><h3>{title(pm)} <span className="count">{rs.length}</span></h3><ul>{rs.map((r) => <Line key={r.s.id} {...r} />)}</ul></div>) : <p className="empty-items">Nothing on site this week.</p>}
      </section>
      {late.length > 0 && (
        <section className="panel dboard needs">
          <header><b className="av" style={{ background: "var(--crit)" }}>!</b><div><h2>Slipping, not this week</h2><small>{late.length} stage{late.length === 1 ? "" : "s"} past their planned end</small></div></header>
          <div className="dsec"><ul>{late.map((r) => <Line key={r.s.id} {...r} />)}</ul></div>
        </section>
      )}
    </div>
  );
}
