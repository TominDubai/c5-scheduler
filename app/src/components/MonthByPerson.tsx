import Link from "next/link";
import { addDays } from "@/lib/model";

export type CalEvent = { id: string; kind: "ball" | "bar" | "dot" | "flag" | "meet"; title: string; person: string | null; start: string; end: string; tone: "navy" | "site" | "crit" | "warn" | "plan" | "bronze" | "meet"; href: string };
type PersonLite = { id: string; name: string; role: string };

/** A month grid with spanning bars, Google-calendar style. Server component: no state, links do the navigation. */
export default function MonthByPerson({ month, gridStart, gridEnd, today, events, people, multi }: { month: string; gridStart: string; gridEnd: string; today: string; events: CalEvent[]; people: PersonLite[]; multi: boolean }) {
  const ini = (id: string | null) => { const p = people.find((x) => x.id === id); return p ? p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : ""; };
  const weeks: string[][] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  return (
    <div className="mgrid">
      <div className="mgrid-head">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}</div>
      {weeks.map((wk) => {
        const ws = wk[0], we = wk[6];
        // segments for this week, packed into lanes so overlapping things stack
        const segs = sorted.filter((e) => e.start <= we && e.end >= ws).map((e) => ({ e, c0: Math.max(0, wk.indexOf(e.start < ws ? ws : e.start)), c1: Math.min(6, wk.indexOf(e.end > we ? we : e.end)), lane: 0 }));
        const laneEnd: number[] = [];
        for (const s of segs) { let l = laneEnd.findIndex((end) => end < s.c0); if (l === -1) { l = laneEnd.length; laneEnd.push(-1); } laneEnd[l] = s.c1; s.lane = l; }
        const lanes = Math.max(1, laneEnd.length);
        return (
          <div key={ws} className="mweek" style={{ minHeight: 34 + lanes * 24 }}>
            {wk.map((d) => <div key={d} className={`mcell${d.slice(0, 7) !== month ? " out" : ""}${d === today ? " today" : ""}${[5, 6].includes(new Date(d + "T00:00:00Z").getUTCDay()) ? " we" : ""}`}><span className="mnum">{Number(d.slice(8))}</span></div>)}
            {segs.map(({ e, c0, c1, lane }) => (
              <Link key={e.id + ws} href={e.href} className={`mev ${e.kind} ${e.tone}${e.start < ws ? " cont-l" : ""}${e.end > we ? " cont-r" : ""}`} style={{ left: `${(c0 / 7) * 100}%`, width: `calc(${((c1 - c0 + 1) / 7) * 100}% - 6px)`, top: 30 + lane * 24 }} title={e.title}>
                {multi && e.person && <b className="mini">{ini(e.person)}</b>}<span>{e.title}</span>
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
