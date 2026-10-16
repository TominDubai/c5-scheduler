import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import MeetingsWeek from "@/components/MeetingsWeek";
import { getMeetings, getPeople, getProjects } from "@/lib/data";
import { addDays, todayDubai, weekStart, WEEK_DAYS, byEnq } from "@/lib/model";

export const dynamic = "force-dynamic";

async function Inner_MeetingsPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const today = todayDubai();
  const start = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(w ?? "") ? (w as string) : today);
  const end = addDays(start, WEEK_DAYS - 1);
  const [meetings, people, projects] = await Promise.all([getMeetings(start, end), getPeople(), getProjects()]);
  const live = projects.filter((p) => !["COMPLETED", "LOST"].includes(p.status)).sort(byEnq).map((p) => ({ id: p.id, name: p.name, enquiry_no: p.enquiry_no }));
  return (
    <Shell active="meetings">
      <main>
        <MeetingsWeek start={start} meetings={meetings} people={people.map((p) => ({ id: p.id, name: p.name, role: p.role }))} projects={live} today={today} />
      </main>
    </Shell>
  );
}

export default async function MeetingsPage(props: Parameters<typeof Inner_MeetingsPage>[0]) {
  try { return await Inner_MeetingsPage(props); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e;
    return <Shell><Failed what="meetings" error={e} /></Shell>;
  }
}
