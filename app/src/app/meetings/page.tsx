import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import MeetingsWeek from "@/components/MeetingsWeek";
import { getMeetings, getPeople, getProjects, getStages } from "@/lib/data";
import type { Prefill } from "@/components/MeetingsWeek";
import { addDays, todayDubai, weekStart, WEEK_DAYS, byEnq } from "@/lib/model";

export const dynamic = "force-dynamic";

async function Inner_MeetingsPage({ searchParams }: { searchParams: Promise<{ w?: string; book?: string }> }) {
  const { w, book } = await searchParams;
  const today = todayDubai();
  const start = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(w ?? "") ? (w as string) : today);
  const end = addDays(start, WEEK_DAYS - 1);
  const [meetings, people, projects, stages] = await Promise.all([getMeetings(start, end), getPeople(), getProjects(), getStages()]);
  const live = projects.filter((p) => !["COMPLETED", "LOST"].includes(p.status)).sort(byEnq).map((p) => ({ id: p.id, name: p.name, enquiry_no: p.enquiry_no }));
  // Rev 3 meeting stages: any stage with a mandatory-attendance list (Sales handover, Kick-off)
  const meetingStages = stages.filter((s) => s.attendance.length > 0);
  // ?book=<project id>:<stage> opens the form pre-filled from the project page: title, project, stage, the mandatory attendees
  let prefill: Prefill | null = null;
  const m = /^([0-9a-f-]{36}):(\d+)$/.exec(book ?? "");
  if (m) {
    const p = projects.find((x) => x.id === m[1]); const s = stages.find((x) => x.stage_no === Number(m[2]));
    if (p && s) {
      const full = (n: string) => n.split(" | ")[0].trim().toLowerCase();
      const ids = new Set<string>();
      for (const a of s.attendance) {
        const key = full(a);
        if (key.startsWith("allocated project designer") && p.designer_id) ids.add(p.designer_id);
        else if (key.startsWith("allocated technical designer") && p.technical_designer_id) ids.add(p.technical_designer_id);
        else if (key.startsWith("allocated") && p.pm_id) ids.add(p.pm_id);
        else { const who = people.find((x) => (x.full_name ?? "").toLowerCase() === key || x.name.toLowerCase() === key); if (who) ids.add(who.id); }
      }
      for (const id of [p.pm_id, p.ball_holder_id]) if (id) ids.add(id);
      prefill = { project_id: p.id, stage_no: s.stage_no, title: `${s.name} — ${p.name}`, attendee_ids: [...ids] };
    }
  }
  return (
    <Shell active="meetings">
      <main>
        <MeetingsWeek start={start} meetings={meetings} people={people.map((p) => ({ id: p.id, name: p.name, role: p.role }))} projects={live} today={today} stageOptions={meetingStages.map((s) => ({ stage_no: s.stage_no, name: s.name }))} prefill={prefill} />
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
