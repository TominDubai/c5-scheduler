import Link from "next/link";
import { getMeetings } from "@/lib/data";
import { hm, title, todayDubai, LOCATION_LABEL } from "@/lib/model";

/** Strip under the board summary: what's in the room today and who's out on site. */
export default async function TodayMeetings() {
  const today = todayDubai();
  const ms = await getMeetings(today, today).catch(() => []);
  if (ms.length === 0) return null;
  return (
    <section className="todaystrip">
      <Link href="/meetings" className="tlabel">Today</Link>
      <div className="titems">
        {ms.map((m) => (
          <Link key={m.id} href={`/meetings?w=${today}`} className={`titem ${m.location.toLowerCase()}`} title={`${LOCATION_LABEL[m.location]}${m.notes ? ` — ${m.notes}` : ""}`}>
            <b>{hm(m.start_time)}</b><span>{m.title}</span>{m.attendees.length > 0 && <small>{m.attendees.map(title).join(", ")}</small>}
          </Link>
        ))}
      </div>
    </section>
  );
}
