// Batched change notifications.
// Called every 10 minutes by pg_cron -> POST /api/notify. Reads unsent rows from scheduler.change_log,
// groups them per recipient, sends one email per person via Resend, then marks the rows notified.
import { createClient } from "@supabase/supabase-js";
import { LABEL, QUOTE_LABEL, type Status, type QuoteStage } from "@/lib/model";

export const APP_URL = "https://c5-scheduler.vercel.app";
const FROM = "Concept 5 Projects <scheduler@bolsovercontracting.com>";
const QUIET_MS = 3 * 60 * 1000;        // skip a project edited in the last 3 minutes - the person is probably still on it
const MAX_AGE_MS = 7 * 24 * 3600 * 1000; // never email about something older than a week (e.g. a backlog after an outage)

type Change = { id: number; project_id: string | null; meeting_id: string | null; kind: string; field: string | null; old_value: string | null; new_value: string | null; changed_by: string | null; changed_at: string };
type Proj = { id: string; enquiry_no: string | null; name: string; client: string | null; status: Status; pm_id: string | null; pm2_id: string | null; designer_id: string | null; estimator_id: string | null };
type Person = { id: string; name: string; full_name: string | null; email: string | null; is_active: boolean };
type Meet = { id: string; title: string; project_id: string | null; project_name: string | null; location: "ROOM" | "SITE" | "ONLINE"; meeting_date: string; start_time: string; end_time: string; notes: string | null; cancelled: boolean; created_by: string | null; attendee_ids: string[]; attendees: string[] };
const LOC: Record<string, string> = { ROOM: "Meeting room", SITE: "On site", ONLINE: "Online" };
const hm = (t: string) => t.slice(0, 5);
const fmtDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const tc = (n: string) => n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const todayDubai = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });

export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { db: { schema: "scheduler" }, auth: { persistSession: false } });
}

const FIELD: Record<string, string> = {
  name: "Project name", client: "Client", enquiry_no: "Enquiry no", status: "Status", quote_stage: "Quote stage",
  pm_id: "PM", pm2_id: "Second PM", designer_id: "Designer", estimator_id: "Estimator", contractor_id: "Contractor",
  start_date: "Start date", target_date: "Target completion", completed_date: "Completed date", quote_due_date: "Quote due",
  signed_quote: "Signed quote", quoted_value: "Quoted value",
};

const fmtDate = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtAed = (s: string | null) => s && parseFloat(s) ? "AED " + Math.round(parseFloat(s)).toLocaleString("en-GB") : "—";
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", hour: "2-digit", minute: "2-digit" });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function value(field: string | null, v: string | null): string {
  if (v == null || v === "") return "—";
  switch (field) {
    case "status": return LABEL[v as Status] ?? v;
    case "quote_stage": return QUOTE_LABEL[v as QuoteStage] ?? v;
    case "start_date": case "target_date": case "completed_date": case "quote_due_date": return fmtDate(v);
    case "signed_quote": case "quoted_value": return fmtAed(v);
    default: return v;
  }
}

function describe(c: Change): string {
  const vo = (s: string | null) => { const [d, v] = (s ?? "").split(" | "); return `${d || "no description"} (${fmtAed(v ?? null)})`; };
  switch (c.kind) {
    case "created": return "New project created";
    case "removed": return `Project removed from the board — ${c.new_value ?? "no reason given"}`;
    case "restored": return "Project restored to the board";
    case "meeting_created": return "You've been added to this meeting";
    case "meeting_cancelled": return "Meeting cancelled";
    case "meeting_restored": return "Meeting is back on";
    case "attendee_added": return `${tc(c.new_value ?? "")} added`;
    case "attendee_removed": return `${tc(c.old_value ?? "")} removed`;
    case "meeting_field": {
      const f = c.field === "when" ? "Moved" : c.field === "location" ? "Where" : c.field === "project" ? "Project" : "Title";
      const v = (x: string | null) => x == null || x === "" ? "—" : c.field === "location" ? LOC[x] ?? x : c.field === "project" ? tc(x) : x;
      return `${f}: ${v(c.old_value)} → ${v(c.new_value)}`;
    }
    case "vo_added": return `${c.field} added — ${vo(c.new_value)}`;
    case "vo_changed": return `${c.field} changed — ${vo(c.old_value)} → ${vo(c.new_value)}`;
    case "vo_removed": return `${c.field} removed — ${vo(c.old_value)}`;
    default: return `${FIELD[c.field ?? ""] ?? c.field}: ${value(c.field, c.old_value)} → ${value(c.field, c.new_value)}`;
  }
}

/** Attendees and the person who booked it, minus whoever made all the changes in this batch. */
function meetingRecipients(m: Meet, changes: Change[], people: Map<string, Person>): Person[] {
  const ids = new Set<string>(m.attendee_ids);
  if (m.created_by) ids.add(m.created_by);
  const actors = new Set(changes.map((c) => c.changed_by).filter(Boolean));
  const soleActor = actors.size === 1 ? [...actors][0] : null;
  return [...ids].filter((id) => id !== soleActor).map((id) => people.get(id)).filter((x): x is Person => !!x && x.is_active && !!x.email);
}

const meetingCard = (m: Meet) => `
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a7a5c">${m.cancelled ? "Cancelled · " : ""}${LOC[m.location]}${m.project_name ? ` · ${esc(tc(m.project_name))}` : ""}</div>
      <div style="font-size:17px;font-weight:600;color:#14213d;margin:2px 0 2px"><a href="${APP_URL}/meetings?w=${m.meeting_date}" style="color:#14213d;text-decoration:none">${esc(m.title)}</a></div>
      <div style="font-size:14px;color:#2b2b2b;margin:0 0 8px">${esc(fmtDay(m.meeting_date))}, ${hm(m.start_time)}–${hm(m.end_time)}${m.attendees.length ? ` · ${esc(m.attendees.map(tc).join(", "))}` : ""}</div>
      ${m.notes ? `<div style="font-size:13px;color:#6b6b6b;margin:0 0 8px;white-space:pre-line">${esc(m.notes)}</div>` : ""}`;

/** Who should hear about a change to this project (excluding whoever made it). */
function recipients(p: Proj, changes: Change[], people: Map<string, Person>, aftab: Person | undefined): Person[] {
  const ids = new Set<string>();
  for (const id of [p.pm_id, p.pm2_id, p.designer_id]) if (id) ids.add(id);
  if (p.status === "QUOTE" && p.estimator_id) ids.add(p.estimator_id);
  // a brand-new live project, or a quote turning into a project, also goes to Aftab
  const wonOrNew = changes.some((c) => (c.kind === "created" && p.status !== "QUOTE") || (c.field === "status" && c.old_value === "QUOTE" && c.new_value !== "QUOTE" && c.new_value !== "LOST"));
  if (wonOrNew && aftab) ids.add(aftab.id);
  const actors = new Set(changes.map((c) => c.changed_by).filter(Boolean));
  // if every change in this batch came from one person, don't tell them about their own edits
  const soleActor = actors.size === 1 ? [...actors][0] : null;
  return [...ids].filter((id) => id !== soleActor).map((id) => people.get(id)).filter((x): x is Person => !!x && x.is_active && !!x.email);
}

type Group = { p?: Proj; m?: Meet; changes: Change[] };
function renderEmail(to: Person, groups: Group[], people: Map<string, Person>): { subject: string; html: string; text: string } {
  const g0 = groups[0];
  const firstName = g0.p ? `${g0.p.name}${g0.p.enquiry_no ? ` (${g0.p.enquiry_no})` : ""}` : `Meeting: ${g0.m!.title}`;
  const subject = groups.length === 1
    ? `${firstName} — ${g0.changes.length === 1 ? describe(g0.changes[0]) : g0.changes.length + " updates"}`
    : `${firstName} and ${groups.length - 1} other update${groups.length > 2 ? "s" : ""}`;

  const who = (id: string | null) => (id && people.get(id)?.name) || "someone";
  const sections = groups.map(({ p, m, changes }) => `
    <div style="margin:0 0 22px 0;padding:16px 18px;border:1px solid #e6e1d8;border-radius:10px;background:#fff">
      ${p ? `<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a7a5c">${esc(p.enquiry_no ?? "")}${p.client ? ` · ${esc(p.client)}` : ""}</div>
      <div style="font-size:17px;font-weight:600;color:#14213d;margin:2px 0 10px"><a href="${APP_URL}/projects/${p.id}" style="color:#14213d;text-decoration:none">${esc(p.name)}</a></div>` : meetingCard(m!)}
      <ul style="margin:0;padding:0 0 0 18px;color:#2b2b2b;font-size:14px;line-height:1.55">
        ${changes.map((c) => `<li>${esc(describe(c))} <span style="color:#8a8a8a;font-size:12px">— ${esc(who(c.changed_by))}, ${fmtTime(c.changed_at)}</span></li>`).join("")}
      </ul>
      <div style="margin-top:10px"><a href="${p ? `${APP_URL}/projects/${p.id}` : `${APP_URL}/meetings?w=${m!.meeting_date}`}" style="font-size:13px;color:#8a7a5c">${p ? "Open project" : "Open the diary"} →</a></div>
    </div>`).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:28px 18px">
      <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a7a5c;margin-bottom:6px">Concept 5 Projects</div>
      <div style="font-size:15px;color:#2b2b2b;margin-bottom:18px">Hi ${esc(to.full_name?.split(" ")[0] ?? to.name)}, here's what changed on your projects and meetings.</div>
      ${sections}
      <div style="font-size:12px;color:#9a9a9a;margin-top:8px">You get this because you're the PM, designer or estimator on these projects, or you're in these meetings. Updates are grouped and sent at most every 10 minutes. <a href="${APP_URL}/board" style="color:#8a7a5c">Open the board</a></div>
    </div></body></html>`;

  const text = groups.map(({ p, m, changes }) => `${p ? `${p.enquiry_no ?? ""} ${p.name}` : `Meeting: ${m!.title} — ${fmtDay(m!.meeting_date)} ${hm(m!.start_time)}–${hm(m!.end_time)} (${LOC[m!.location]})`}\n${changes.map((c) => `  - ${describe(c)} (${who(c.changed_by)}, ${fmtTime(c.changed_at)})`).join("\n")}\n  ${p ? `${APP_URL}/projects/${p.id}` : `${APP_URL}/meetings?w=${m!.meeting_date}`}`).join("\n\n");
  return { subject, html, text };
}

async function sendEmail(to: string, msg: { subject: string; html: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

export async function runNotifications(opts: { dryRun?: boolean } = {}) {
  const db = admin();
  const now = Date.now();
  const { data: unsent, error } = await db.from("change_log").select("*").is("notified_at", null).order("changed_at");
  if (error) throw new Error(error.message);
  const all = (unsent ?? []) as Change[];
  if (all.length === 0) return { sent: 0, skipped: 0, pending: 0, stale: 0 };

  // changes older than a week are marked done without emailing
  const stale = all.filter((c) => now - new Date(c.changed_at).getTime() > MAX_AGE_MS);
  if (stale.length && !opts.dryRun) await db.from("change_log").update({ notified_at: new Date().toISOString() }).in("id", stale.map((c) => c.id));
  const fresh = all.filter((c) => !stale.includes(c));

  // group by project; hold back projects still being edited
  // group by project or meeting ("p:<id>" / "m:<id>"); hold back anything still being edited
  const byProject = new Map<string, Change[]>();
  for (const c of fresh) { const k = c.project_id ? `p:${c.project_id}` : `m:${c.meeting_id}`; byProject.set(k, [...(byProject.get(k) ?? []), c]); }
  const ready = [...byProject.entries()].filter(([, cs]) => now - Math.max(...cs.map((c) => new Date(c.changed_at).getTime())) > QUIET_MS);
  const pending = byProject.size - ready.length;
  if (ready.length === 0) return { sent: 0, skipped: 0, pending, stale: stale.length };

  const pIds = ready.filter(([k]) => k.startsWith("p:")).map(([k]) => k.slice(2));
  const mIds = ready.filter(([k]) => k.startsWith("m:")).map(([k]) => k.slice(2));
  const [{ data: projs }, { data: meets }, { data: ppl }] = await Promise.all([
    pIds.length ? db.from("projects").select("id, enquiry_no, name, client, status, pm_id, pm2_id, designer_id, estimator_id").in("id", pIds) : { data: [] },
    mIds.length ? db.from("meetings_live").select("id, title, project_id, project_name, location, meeting_date, start_time, end_time, notes, cancelled, created_by, attendee_ids, attendees").in("id", mIds) : { data: [] },
    db.from("people").select("id, name, full_name, email, is_active"),
  ]);
  const people = new Map(((ppl ?? []) as Person[]).map((p) => [p.id, p]));
  const aftab = [...people.values()].find((p) => p.name === "AFTAB");
  const projects = new Map(((projs ?? []) as Proj[]).map((p) => [p.id, p]));
  const meetings = new Map(((meets ?? []) as Meet[]).map((m) => [m.id, m]));

  // fan out: recipient -> projects / meetings -> changes
  const perPerson = new Map<string, Group[]>();
  const doneIds: number[] = []; let noRecipient = 0;
  for (const [key, changes] of ready) {
    doneIds.push(...changes.map((c) => c.id));
    let rs: Person[] = []; let group: Group | null = null;
    if (key.startsWith("p:")) { const p = projects.get(key.slice(2)); if (!p) continue; rs = recipients(p, changes, people, aftab); group = { p, changes }; }
    else { const m = meetings.get(key.slice(2)); if (!m) continue; rs = meetingRecipients(m, changes, people); group = { m, changes }; }
    if (rs.length === 0) noRecipient++;
    for (const r of rs) perPerson.set(r.id, [...(perPerson.get(r.id) ?? []), group]);
  }

  let sent = 0; const failures: string[] = []; const preview: Record<string, string> = {};
  for (const [id, groups] of perPerson) {
    const to = people.get(id)!;
    const msg = renderEmail(to, groups, people);
    if (opts.dryRun) { preview[to.email!] = msg.subject; continue; }
    try { await sendEmail(to.email!, msg); sent++; }
    catch (e) { failures.push(`${to.email}: ${(e as Error).message}`); }
  }
  // Mark the batch done even if a send failed — one broken address must not make everyone else get the same email every 10 minutes.
  if (!opts.dryRun) await db.from("change_log").update({ notified_at: new Date().toISOString() }).in("id", doneIds);
  return { sent, projects: ready.length, noRecipient, pending, stale: stale.length, recipients: perPerson.size, failures, ...(opts.dryRun ? { preview } : {}) };
}


/** 07:30 Dubai: "Your meetings today" — one email per person who has at least one meeting today. */
export async function runMeetingsToday(opts: { dryRun?: boolean; date?: string } = {}) {
  const db = admin();
  const date = opts.date ?? todayDubai();
  const [{ data: meets, error }, { data: ppl }] = await Promise.all([
    db.from("meetings_live").select("id, title, project_id, project_name, location, meeting_date, start_time, end_time, notes, cancelled, created_by, attendee_ids, attendees").eq("meeting_date", date).eq("cancelled", false).order("start_time"),
    db.from("people").select("id, name, full_name, email, is_active"),
  ]);
  if (error) throw new Error(error.message);
  const all = (meets ?? []) as Meet[];
  const people = new Map(((ppl ?? []) as Person[]).map((p) => [p.id, p]));
  const perPerson = new Map<string, Meet[]>();
  for (const m of all) for (const id of m.attendee_ids) perPerson.set(id, [...(perPerson.get(id) ?? []), m]);
  let sent = 0; const failures: string[] = []; const preview: Record<string, number> = {};
  for (const [id, ms] of perPerson) {
    const to = people.get(id);
    if (!to || !to.is_active || !to.email) continue;
    const subject = ms.length === 1 ? `Today ${hm(ms[0].start_time)}: ${ms[0].title}` : `Your ${ms.length} meetings today`;
    const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:28px 18px">
      <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a7a5c;margin-bottom:6px">Concept 5 Projects</div>
      <div style="font-size:15px;color:#2b2b2b;margin-bottom:18px">Morning ${esc(to.full_name?.split(" ")[0] ?? tc(to.name))}, here's your ${esc(fmtDay(date))}.</div>
      ${ms.map((m) => `<div style="margin:0 0 14px 0;padding:14px 18px;border:1px solid #e6e1d8;border-radius:10px;background:#fff">${meetingCard(m)}</div>`).join("")}
      <div style="font-size:12px;color:#9a9a9a;margin-top:8px">Sent at 07:30 on days you have a meeting. <a href="${APP_URL}/meetings" style="color:#8a7a5c">Open the diary</a></div>
    </div></body></html>`;
    const text = ms.map((m) => `${hm(m.start_time)}–${hm(m.end_time)} ${m.title} (${LOC[m.location]})${m.project_name ? ` — ${tc(m.project_name)}` : ""}${m.notes ? `\n  ${m.notes}` : ""}`).join("\n") + `\n\n${APP_URL}/meetings`;
    if (opts.dryRun) { preview[to.email] = ms.length; continue; }
    try { await sendEmail(to.email, { subject, html, text }); sent++; }
    catch (e) { failures.push(`${to.email}: ${(e as Error).message}`); }
  }
  return { date, meetings: all.length, recipients: perPerson.size, sent, failures, ...(opts.dryRun ? { preview } : {}) };
}
