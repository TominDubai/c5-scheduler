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
type Proj = { id: string; enquiry_no: string | null; name: string; client: string | null; status: Status; pm_id: string | null; pm2_id: string | null; designer_id: string | null; estimator_id: string | null; signed_quote: number | null; ball_holder_id?: string | null; stage?: number | null };
type Person = { id: string; name: string; full_name: string | null; email: string | null; is_active: boolean; notify_on_award: boolean };
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
  coordinator_id: "Project coordinator", technical_designer_id: "Technical designer",
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

/** A quote turning into a live project — the one change CD management are told about by name. */
export const isAward = (c: Change) =>
  c.kind === "field" && c.field === "status" && c.old_value === "QUOTE" && c.new_value !== "QUOTE" && c.new_value !== "LOST";

export function describe(c: Change, p?: Proj): string {
  if (isAward(c)) {
    const value = p?.signed_quote ? ` — ${fmtAed(String(p.signed_quote))}` : "";
    const missing = p ? [!p.pm_id && "a project manager", !p.designer_id && "a designer"].filter(Boolean) as string[] : [];
    const needs = missing.length ? ` Still needs ${missing.join(" and ")}.` : "";
    // the stage change rides in the same batch; name the Rev 3 stage rather than the coarse status
    return `Signed${value}. Now at ${p?.stage === 3 ? "Award / contract with Jean" : LABEL[c.new_value as Status] ?? c.new_value}.${needs}`;
  }
  if (c.kind === "field" && c.field === "status" && p?.stage != null) return "";   // the 'stage' row says it better
  const vo = (s: string | null) => { const [d, v] = (s ?? "").split(" | "); return `${d || "no description"} (${fmtAed(v ?? null)})`; };
  switch (c.kind) {
    case "created": return "New project created";
    // workflow Rev 3 (db/016)
    case "stage": return `Stage: ${c.old_value ?? "—"} → ${c.new_value ?? "—"}`;
    case "ball": return c.new_value ? `${tc(c.new_value)} now holds the ball` : "No one holds the ball";
    case "flow": return "";  // the handover / hold rows carry the story
    case "next_action": return `Next action: ${c.new_value ?? "—"}`;
    case "handover_requested": return `Handover requested — ${c.field}: ${tc(c.old_value ?? "—")} → ${tc(c.new_value ?? "—")}. Waiting for ${tc(c.new_value ?? "them")} to accept.`;
    case "handover_accepted": return `Handover accepted — ${c.field} now with ${tc((c.new_value ?? "").split(" — ")[0])}${c.new_value?.includes(" — recorded by ") ? ` (recorded by ${tc(c.new_value.split(" — recorded by ")[1])})` : ""}`;
    case "handover_returned": return `Handover returned by ${tc(c.old_value ?? "—")} — ${c.new_value ?? "no reason given"}`;
    case "checkpoint": return `Checkpoint recorded — now at ${c.field}, same owner${c.new_value ? ` — ${c.new_value}` : ""}`;
    case "handover_cancelled": return `Handover request withdrawn (${c.field})`;
    case "handover_override": return `Moved to ${c.field} without acceptance — ${c.new_value ?? ""}`;
    case "hold": return `On hold${c.field ? ` — waiting on ${tc(c.field)}` : ""}: ${c.new_value ?? ""}`;
    case "hold_released": return `Hold released${c.new_value ? ` — ${c.new_value}` : ""}`;
    case "removed": return `Project removed from the board — ${c.new_value ?? "no reason given"}`;
    case "restored": return "Project restored to the board";
    case "meeting_created": return "You've been added to this meeting";
    case "meeting_cancelled": return "Meeting cancelled";
    case "meeting_restored": return "Meeting is back on";
    case "meeting_held": return "Meeting marked as held — attendance recorded";
    case "attendee_added": return `${tc(c.new_value ?? "")} added`;
    case "attendee_removed": return `${tc(c.old_value ?? "")} removed`;
    case "meeting_field": {
      const f = c.field === "when" ? "Moved" : c.field === "location" ? "Where" : c.field === "project" ? "Project" : c.field === "stage" ? "Workflow stage" : "Title";
      const v = (x: string | null) => x == null || x === "" ? "—" : c.field === "location" ? LOC[x] ?? x : c.field === "project" ? tc(x) : x;
      return `${f}: ${v(c.old_value)} → ${v(c.new_value)}`;
    }
    case "item_created": return `Item added — ${c.field}`;
    case "item_cancelled": return `Item cancelled — ${c.field}`;
    case "item_drawing": return `${c.field}: drawing ${c.old_value ? `${c.old_value} → ` : ""}${c.new_value ?? "—"}`;
    case "item_issued": return `${c.field}: ${c.new_value ? `issued to production ${fmtDate(c.new_value)}` : "issue to production cleared"}`;
    case "item_designer": return `${c.field}: designer ${tc(c.old_value ?? "—")} → ${tc(c.new_value ?? "—")}`;
    case "item_material": return `${c.field}: material ${(c.old_value ?? "—").toLowerCase()} → ${(c.new_value ?? "—").toLowerCase()}`;
    case "item_stage": return `${c.field}: ${(c.old_value ?? "").toLowerCase().replace("_", " ")} → ${(c.new_value ?? "").toLowerCase().replace("_", " ")}`;
    case "watcher_added": return `${tc(c.new_value ?? "")} is now kept updated on this project`;
    case "watcher_removed": return `${tc(c.old_value ?? "")} is no longer kept updated on this project`;
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

/** Who should hear about a change to this project (excluding whoever made it).
 *  The PM, second PM and designer, plus anyone tagged on the project (db/015). When a quote is won,
 *  everyone flagged notify_on_award hears about it too — at that moment nobody is assigned yet,
 *  so without them the signing would go to an empty list. */
export function recipients(p: Proj, changes: Change[], people: Map<string, Person>, watchers: Set<string>): Person[] {
  const ids = new Set<string>();
  for (const id of [p.pm_id, p.pm2_id, p.designer_id, p.ball_holder_id]) if (id) ids.add(id);
  if (p.status === "QUOTE" && p.estimator_id) ids.add(p.estimator_id);
  // Rev 3: the next owner hears the moment a handover is requested; the previous owner hears the outcome
  for (const c of changes) {
    if (c.kind === "handover_requested" && c.new_value) for (const person of people.values()) if (person.name === c.new_value) ids.add(person.id);
    if ((c.kind === "handover_accepted" || c.kind === "handover_returned" || c.kind === "handover_override") && c.old_value) for (const person of people.values()) if (person.name === c.old_value) ids.add(person.id);
  }
  for (const id of watchers) ids.add(id);
  const wonOrNew = changes.some((c) => (c.kind === "created" && p.status !== "QUOTE") || isAward(c));
  if (wonOrNew) for (const person of people.values()) if (person.notify_on_award) ids.add(person.id);
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
    ? `${firstName} — ${(() => { const d = g0.changes.map((c) => describe(c, g0.p)).filter(Boolean); return d.length === 1 ? d[0] : d.length + " updates"; })()}`
    : `${firstName} and ${groups.length - 1} other update${groups.length > 2 ? "s" : ""}`;

  const who = (id: string | null) => (id && people.get(id)?.name) || "someone";
  const sections = groups.map(({ p, m, changes }) => `
    <div style="margin:0 0 22px 0;padding:16px 18px;border:1px solid #e6e1d8;border-radius:10px;background:#fff">
      ${p ? `<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a7a5c">${esc(p.enquiry_no ?? "")}${p.client ? ` · ${esc(p.client)}` : ""}</div>
      <div style="font-size:17px;font-weight:600;color:#14213d;margin:2px 0 10px"><a href="${APP_URL}/projects/${p.id}" style="color:#14213d;text-decoration:none">${esc(p.name)}</a></div>` : meetingCard(m!)}
      <ul style="margin:0;padding:0 0 0 18px;color:#2b2b2b;font-size:14px;line-height:1.55">
        ${changes.filter((c) => describe(c, p)).map((c) => `<li>${esc(describe(c, p))} <span style="color:#8a8a8a;font-size:12px">— ${esc(who(c.changed_by))}, ${fmtTime(c.changed_at)}</span></li>`).join("")}
      </ul>
      <div style="margin-top:10px"><a href="${p ? `${APP_URL}/projects/${p.id}` : `${APP_URL}/meetings?w=${m!.meeting_date}`}" style="font-size:13px;color:#8a7a5c">${p ? "Open project" : "Open the diary"} →</a></div>
    </div>`).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:28px 18px">
      <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a7a5c;margin-bottom:6px">Concept 5 Projects</div>
      <div style="font-size:15px;color:#2b2b2b;margin-bottom:18px">Hi ${esc(to.full_name?.split(" ")[0] ?? to.name)}, here's what changed on your projects and meetings.</div>
      ${sections}
      <div style="font-size:12px;color:#9a9a9a;margin-top:8px">You get this because you're the PM, designer or estimator on these projects, you've been tagged to be kept updated, or you're in these meetings. Updates are grouped and sent at most every 10 minutes. <a href="${APP_URL}/board" style="color:#8a7a5c">Open the board</a></div>
    </div></body></html>`;

  const text = groups.map(({ p, m, changes }) => `${p ? `${p.enquiry_no ?? ""} ${p.name}` : `Meeting: ${m!.title} — ${fmtDay(m!.meeting_date)} ${hm(m!.start_time)}–${hm(m!.end_time)} (${LOC[m!.location]})`}\n${changes.filter((c) => describe(c, p)).map((c) => `  - ${describe(c, p)} (${who(c.changed_by)}, ${fmtTime(c.changed_at)})`).join("\n")}\n  ${p ? `${APP_URL}/projects/${p.id}` : `${APP_URL}/meetings?w=${m!.meeting_date}`}`).join("\n\n");
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
    pIds.length ? db.from("projects").select("id, enquiry_no, name, client, status, pm_id, pm2_id, designer_id, estimator_id, signed_quote, ball_holder_id, stage").in("id", pIds) : { data: [] },
    mIds.length ? db.from("meetings_live").select("id, title, project_id, project_name, location, meeting_date, start_time, end_time, notes, cancelled, created_by, attendee_ids, attendees").in("id", mIds) : { data: [] },
    db.from("people").select("id, name, full_name, email, is_active, notify_on_award"),
  ]);
  const people = new Map(((ppl ?? []) as Person[]).map((p) => [p.id, p]));
  const { data: ws } = pIds.length
    ? await db.from("project_watchers").select("project_id, person_id").in("project_id", pIds)
    : { data: [] };
  const watchers = new Map<string, Set<string>>();
  for (const w of (ws ?? []) as { project_id: string; person_id: string }[])
    watchers.set(w.project_id, (watchers.get(w.project_id) ?? new Set()).add(w.person_id));
  const projects = new Map(((projs ?? []) as Proj[]).map((p) => [p.id, p]));
  const meetings = new Map(((meets ?? []) as Meet[]).map((m) => [m.id, m]));

  // fan out: recipient -> projects / meetings -> changes
  const perPerson = new Map<string, Group[]>();
  const doneIds: number[] = []; let noRecipient = 0;
  for (const [key, changes] of ready) {
    doneIds.push(...changes.map((c) => c.id));
    let rs: Person[] = []; let group: Group | null = null;
    if (key.startsWith("p:")) { const p = projects.get(key.slice(2)); if (!p) continue; rs = recipients(p, changes, people, watchers.get(p.id) ?? new Set()); group = { p, changes }; }
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
    db.from("people").select("id, name, full_name, email, is_active, notify_on_award"),
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


// ---------- 07:30 daily reminders (Rev 3 plan, step 4) ----------
// One "Waiting on you" email per person. Thresholds come from alert_settings (W1–W4) and stage_targets, so Darren's
// numbers are a data change. People who can't sign in (WhatsApp-only) have their reminders routed to the
// project coordinator, who chases them — that is Rev 3's rule, so the app does the same.
type LiveRow = {
  id: string; enquiry_no: string | null; name: string; client: string | null; status: Status;
  stage: number | null; stage_name: string | null; stage_short: string | null; ball_holder_id: string | null; flow_status: string | null;
  stage_age_days: number | null; stage_target_days: number | null; stage_overdue: boolean | null;
  hold_id: string | null; hold_reason: string | null; hold_waiting_on: string | null; hold_review_date: string | null; hold_action_due: string | null; hold_action: string | null;
  pm_id: string | null; designer_id: string | null; stage_entered_at: string | null;
  pending_handover_id: string | null; pending_to_person_id: string | null; pending_to_stage: number | null; pending_since: string | null;
  next_action: string | null; next_action_owner_id: string | null; next_action_due: string | null;
};
type Reminder = { p: LiveRow; kind: "accept" | "escalated" | "hold" | "action" | "stage" | "item"; text: string; onBehalfOf?: string };
type ItemRow = { id: string; project_id: string; drawing_code: string; name: string; stage: string; designer_id: string | null; pm_id: string | null; planned_submission: string | null; material_approval: string; measurements_date: string | null; issued_date: string | null; submission_overdue: boolean; client_overdue: boolean; last_submitted: string | null; cancelled: boolean; project_status: string; project_deleted_at: string | null };
type PStage = { id: string; item_id: string; stage: string; stage_no: number; planned_start: string | null; planned_end: string | null; status: string; na: boolean };
type RPerson = Person & { role: string; can_sign_in: boolean; handles_escalations: boolean };

export async function runDailyReminders(opts: { dryRun?: boolean; date?: string } = {}) {
  const db = admin();
  const today = opts.date ?? todayDubai();
  const now = opts.date ? new Date(opts.date + "T03:30:00Z").getTime() : Date.now();
  const [{ data: rows, error }, { data: ppl }, { data: settings }, { data: targets }, { data: stages }] = await Promise.all([
    db.from("projects_live").select("id, enquiry_no, name, client, status, stage, stage_name, stage_short, ball_holder_id, flow_status, stage_age_days, stage_target_days, stage_overdue, pm_id, designer_id, stage_entered_at, hold_id, hold_reason, hold_waiting_on, hold_review_date, hold_action_due, hold_action, pending_handover_id, pending_to_person_id, pending_to_stage, pending_since, next_action, next_action_owner_id, next_action_due")
      .is("deleted_at", null).not("status", "in", "(LOST,MERGED,COMPLETED)"),
    db.from("people").select("id, name, full_name, email, is_active, notify_on_award, role, can_sign_in, handles_escalations"),
    db.from("alert_settings").select("rule, threshold, enabled").in("rule", ["W1", "W2", "W3", "W4"]),
    db.from("stage_targets").select("stage_no, response_hours"),
    db.from("stages").select("stage_no, short_name"),
  ]);
  const [{ data: itemRows }, { data: pstages }, { data: isettings }] = await Promise.all([
    db.from("items_live").select("id, project_id, drawing_code, name, stage, designer_id, pm_id, planned_submission, material_approval, measurements_date, issued_date, submission_overdue, client_overdue, last_submitted, cancelled, project_status, project_deleted_at").eq("cancelled", false).is("project_deleted_at", null).not("project_status", "in", "(LOST,MERGED,COMPLETED)"),
    db.from("item_production_stages").select("id, item_id, stage, stage_no, planned_start, planned_end, status, na").eq("na", false).neq("status", "COMPLETE"),
    db.from("alert_settings").select("rule, threshold, enabled").like("rule", "I%"),
  ]);
  if (error) throw new Error(error.message);
  const people = new Map(((ppl ?? []) as RPerson[]).map((p) => [p.id, p]));
  const setting = (r: string) => { const s = (settings ?? []).find((x) => x.rule === r); return { on: s ? s.enabled !== false : true, n: s?.threshold ?? 0 }; };
  const responseHours = new Map((targets ?? []).map((t) => [t.stage_no as number, t.response_hours as number | null]));
  const stageShort = new Map((stages ?? []).map((s) => [s.stage_no as number, s.short_name as string]));
  const coordinator = [...people.values()].find((p) => p.role === "PROJECT_COORDINATOR" && p.is_active && p.email) ?? null;
  const escalation = [...people.values()].filter((p) => p.handles_escalations && p.is_active && p.email);
  const days = (d: string | null) => d ? Math.floor((now - new Date(d + "T00:00:00Z").getTime()) / 86400000) : 0;
  const hoursSince = (iso: string | null) => iso ? (now - new Date(iso).getTime()) / 3600000 : 0;
  const nm = (id: string | null) => (id && (people.get(id)?.full_name?.split(" ")[0] ?? tc(people.get(id)?.name ?? ""))) || "someone";

  const per = new Map<string, Reminder[]>();
  // A reminder meant for someone who can't sign in goes to the coordinator, marked with their name.
  const add = (toId: string | null, r: Reminder) => {
    if (!toId) return;
    const to = people.get(toId);
    if (!to || !to.is_active) return;
    if (!to.email || !to.can_sign_in) { if (coordinator && coordinator.id !== toId) add(coordinator.id, { ...r, onBehalfOf: nm(toId) }); return; }
    const list = per.get(toId) ?? [];
    if (!list.some((x) => x.p.id === r.p.id && x.kind === r.kind && x.text === r.text)) list.push(r);
    per.set(toId, list);
  };

  const W1 = setting("W1"), W2 = setting("W2"), W3 = setting("W3"), W4 = setting("W4");
  const iset = (r: string) => { const x = (isettings ?? []).find((y) => y.rule === r); return { on: x ? x.enabled !== false : true, n: x?.threshold ?? 0 }; };
  const production = [...people.values()].find((p) => p.role === "PRODUCTION" && p.is_active) ?? null;   // Gajanand
  const projRow = new Map(((rows ?? []) as LiveRow[]).map((p) => [p.id, p]));
  const projectsById = projRow;
  for (const p of (rows ?? []) as LiveRow[]) {
    // W1: a handover nobody has accepted
    if (W1.on && p.flow_status === "AWAITING_ACCEPTANCE" && p.pending_handover_id && p.pending_to_person_id) {
      const h = hoursSince(p.pending_since);
      if (h >= W1.n) {
        const text = `Handover to ${stageShort.get(p.pending_to_stage ?? -1) ?? `stage ${p.pending_to_stage}`} waiting for ${nm(p.pending_to_person_id)} to accept — ${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
        add(p.pending_to_person_id, { p, kind: "accept", text });
        if (coordinator) add(coordinator.id, { p, kind: "accept", text });
        const limit = responseHours.get(p.pending_to_stage ?? -1);
        if (limit != null && h > limit) for (const e of escalation) add(e.id, { p, kind: "escalated", text: `${text} — past the ${limit}h response time` });
      }
    }
    // W2: a hold nobody has reviewed
    if (W2.on && p.hold_id) {
      const late = (p.hold_review_date && days(p.hold_review_date) > W2.n) ? `review was due ${fmtDate(p.hold_review_date)}` : (p.hold_action_due && days(p.hold_action_due) > W2.n) ? `action was due ${fmtDate(p.hold_action_due)}` : null;
      if (late) {
        const text = `On hold — ${p.hold_reason ?? "no reason recorded"}${p.hold_waiting_on ? ` (waiting on ${tc(p.hold_waiting_on)})` : ""}; ${late}`;
        add(p.ball_holder_id, { p, kind: "hold", text });
        if (coordinator) add(coordinator.id, { p, kind: "hold", text });
      }
    }
    // W3: next action past its date
    if (W3.on && p.next_action && p.next_action_due && days(p.next_action_due) > W3.n) {
      add(p.next_action_owner_id ?? p.ball_holder_id, { p, kind: "action", text: `Next action overdue — ${p.next_action} (due ${fmtDate(p.next_action_due)})` });
    }
    // W4: stage sat longer than its target (only once stage_targets has numbers)
    if (W4.on && p.stage_overdue && p.stage_target_days != null && (p.stage_age_days ?? 0) - p.stage_target_days > W4.n) {
      add(p.ball_holder_id, { p, kind: "stage", text: `In ${p.stage_name ?? "this stage"} for ${p.stage_age_days} days — target is ${p.stage_target_days}` });
    }
  }

  // ---- items & production (Items plan §7, rules I1–I10; I3 rides the 10-minute digest) ----
  const stagesByItem = new Map<string, PStage[]>();
  for (const st of (pstages ?? []) as PStage[]) stagesByItem.set(st.item_id, [...(stagesByItem.get(st.item_id) ?? []), st]);
  const itemsByProject = new Map<string, ItemRow[]>();
  for (const i of (itemRows ?? []) as ItemRow[]) itemsByProject.set(i.project_id, [...(itemsByProject.get(i.project_id) ?? []), i]);
  const I = { I1: iset("I1"), I2: iset("I2"), I4: iset("I4"), I5: iset("I5"), I6: iset("I6"), I7: iset("I7"), I8: iset("I8"), I9: iset("I9"), I10: iset("I10") };
  const soon = (d: string | null, n: number) => !!d && days(d) <= 0 && days(d) >= -n;   // within the next n days (inclusive of today)
  for (const i of (itemRows ?? []) as ItemRow[]) {
    const p = projRow.get(i.project_id); if (!p) continue;
    const code = `${i.drawing_code} ${i.name}`;
    const sts = stagesByItem.get(i.id) ?? [];
    const joinery = sts.find((x) => x.stage === "JOINERY"), delivery = sts.find((x) => x.stage === "DELIVERY"), install = sts.find((x) => x.stage === "INSTALL");
    if (I.I1.on && i.submission_overdue) { const t = `${code} — R0 was due ${fmtDate(i.planned_submission)}`; add(i.designer_id, { p, kind: "item", text: t }); add(i.pm_id, { p, kind: "item", text: t }); }
    if (I.I2.on && i.client_overdue) add(i.pm_id, { p, kind: "item", text: `${code} — with the client since ${fmtDate(i.last_submitted)}, chase them` });
    if (I.I4.on && joinery && soon(joinery.planned_start, I.I4.n) && (i.material_approval === "PENDING" || !i.measurements_date)) {
      const t = `${code} — joinery starts ${fmtDate(joinery.planned_start)} but ${[i.material_approval === "PENDING" && "material approval is pending", !i.measurements_date && "final measurements aren't taken"].filter(Boolean).join(" and ")}`;
      add(i.pm_id, { p, kind: "item", text: t }); if (production) add(production.id, { p, kind: "item", text: t });
    }
    if (I.I5.on) for (const st of sts) if (st.planned_end && days(st.planned_end) > I.I5.n) {
      const factory = st.stage_no <= 3; const t = `${code} — ${st.stage.toLowerCase()} should have finished ${fmtDate(st.planned_end)}`;
      add(factory ? production?.id ?? null : i.pm_id, { p, kind: "item", text: t }); if (factory) add(i.pm_id, { p, kind: "item", text: t });
    }
    if (I.I6.on && install && soon(install.planned_start, I.I6.n) && delivery) {
      const t = `${code} — install starts ${fmtDate(install.planned_start)} and delivery isn't complete`;
      if (production) add(production.id, { p, kind: "item", text: t }); add(i.pm_id, { p, kind: "item", text: t });
    }
    if (I.I9.on && i.issued_date && days(i.issued_date) > I.I9.n && joinery && !joinery.planned_start) add(production?.id ?? null, { p, kind: "item", text: `${code} — issued ${fmtDate(i.issued_date)}, no joinery dates yet` });
    // delivery complete (so it is no longer in the open-stage list) and the item has moved to Install with no dates
    if (I.I10.on && delivery == null && install && !install.planned_start && i.stage === "INSTALL") add(i.pm_id, { p, kind: "item", text: `${code} — delivered, no install date` });
  }
  // I7 awarded, no items / I8 awarded, no designer — per project
  for (const p of (rows ?? []) as LiveRow[]) {
    const awarded = p.status !== "QUOTE" && p.status !== "SITE_ON_HOLD";
    if (!awarded) continue;
    const pr = projectsById.get(p.id);
    if (I.I8.on && !pr?.designer_id) { const t = `No designer assigned yet`; add(pr?.pm_id ?? null, { p, kind: "item", text: t }); if (coordinator) add(coordinator.id, { p, kind: "item", text: t }); }
    else if (I.I7.on && !(itemsByProject.get(p.id)?.length) && pr?.stage_entered_at && Math.floor((now - new Date(pr.stage_entered_at).getTime()) / 86400000) >= I.I7.n && (p.stage ?? 0) >= 6) { const t = `No item list yet — add the items so drawings can start`; add(pr.designer_id ?? null, { p, kind: "item", text: t }); add(pr.pm_id ?? null, { p, kind: "item", text: t }); }
  }

  const KIND: Record<Reminder["kind"], string> = { accept: "Waiting for acceptance", escalated: "Escalated", hold: "On hold", action: "Next action", stage: "Stage overdue", item: "Drawings & production" };
  let sent = 0; const failures: string[] = []; const preview: Record<string, string[]> = {};
  for (const [id, list] of per) {
    const to = people.get(id)!;
    const first = to.full_name?.split(" ")[0] ?? tc(to.name);
    const byProject = new Map<string, Reminder[]>();
    for (const r of list) byProject.set(r.p.id, [...(byProject.get(r.p.id) ?? []), r]);
    const subject = list.length === 1 ? `${KIND[list[0].kind]}: ${list[0].p.name}` : `${list.length} things waiting on you`;
    const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:28px 18px">
      <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a7a5c;margin-bottom:6px">Concept 5 Projects</div>
      <div style="font-size:15px;color:#2b2b2b;margin-bottom:18px">Morning ${esc(first)}, these are waiting on you${list.some((r) => r.onBehalfOf) ? " or on someone you chase" : ""}.</div>
      ${[...byProject.values()].map((rs) => { const p = rs[0].p; return `<div style="margin:0 0 14px 0;padding:14px 18px;border:1px solid #e6e1d8;border-radius:10px;background:#fff">
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a7a5c">${esc(p.enquiry_no ?? "")}${p.client ? ` · ${esc(p.client)}` : ""}${p.stage != null ? ` · ${p.stage} ${esc(p.stage_short ?? "")}` : ""}</div>
        <div style="font-size:17px;font-weight:600;color:#14213d;margin:2px 0 8px"><a href="${APP_URL}/projects/${p.id}" style="color:#14213d;text-decoration:none">${esc(tc(p.name))}</a></div>
        <ul style="margin:0;padding:0 0 0 18px;color:#2b2b2b;font-size:14px;line-height:1.55">${rs.map((r) => `<li>${r.kind === "escalated" ? '<b style="color:#b85c5c">Escalated:</b> ' : ""}${esc(r.text)}${r.onBehalfOf ? ` <span style="color:#8a8a8a;font-size:12px">— for ${esc(r.onBehalfOf)}</span>` : ""}</li>`).join("")}</ul>
        <div style="margin-top:8px"><a href="${APP_URL}/projects/${p.id}" style="font-size:13px;color:#8a7a5c">Open project →</a></div></div>`; }).join("")}
      <div style="font-size:12px;color:#9a9a9a;margin-top:8px">Sent at 07:30 on days something is waiting. <a href="${APP_URL}/board" style="color:#8a7a5c">Open the board</a></div>
    </div></body></html>`;
    const text = [...byProject.values()].map((rs) => `${rs[0].p.enquiry_no ?? ""} ${tc(rs[0].p.name)}\n${rs.map((r) => `  - ${r.kind === "escalated" ? "ESCALATED: " : ""}${r.text}${r.onBehalfOf ? ` (for ${r.onBehalfOf})` : ""}`).join("\n")}\n  ${APP_URL}/projects/${rs[0].p.id}`).join("\n\n");
    if (opts.dryRun) { preview[to.email!] = list.map((r) => `${r.p.enquiry_no ?? "?"} ${r.kind}: ${r.text}${r.onBehalfOf ? ` (for ${r.onBehalfOf})` : ""}`); continue; }
    try { await sendEmail(to.email!, { subject, html, text }); sent++; }
    catch (e) { failures.push(`${to.email}: ${(e as Error).message}`); }
  }
  return { date: today, projects: (rows ?? []).length, recipients: per.size, sent, failures, ...(opts.dryRun ? { preview } : {}) };
}
