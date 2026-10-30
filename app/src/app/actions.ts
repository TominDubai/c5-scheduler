"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Status, QuoteStage } from "@/lib/model";

const nz = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const num = (v: FormDataEntryValue | null) => { const n = parseFloat((v ?? "").toString().replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function setStatus(id: string, status: Status) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/board"); revalidatePath("/list"); revalidatePath(`/projects/${id}`);
  return { ok: true };
}

function projectFields(fd: FormData) {
  // Only fields present on the submitted form are touched (disabled inputs are not submitted).
  const out: Record<string, unknown> = {};
  const has = (k: string) => fd.has(k);
  if (has("enquiry_no")) out.enquiry_no = nz(fd.get("enquiry_no"));
  if (has("name")) out.name = (nz(fd.get("name")) ?? "").toUpperCase();
  if (has("client")) out.client = nz(fd.get("client"))?.toUpperCase() ?? null;
  if (has("contractor_id")) out.contractor_id = nz(fd.get("contractor_id"));
  if (has("pm_id")) out.pm_id = nz(fd.get("pm_id"));
  if (has("pm2_id")) out.pm2_id = nz(fd.get("pm2_id"));
  if (has("designer_id")) out.designer_id = nz(fd.get("designer_id"));
  if (has("technical_designer_id")) out.technical_designer_id = nz(fd.get("technical_designer_id"));
  if (has("coordinator_id")) out.coordinator_id = nz(fd.get("coordinator_id"));
  if (has("status")) out.status = (nz(fd.get("status")) ?? "QUOTE") as Status;
  if (has("received_date")) out.received_date = nz(fd.get("received_date"));
  if (has("start_date")) out.start_date = nz(fd.get("start_date"));
  if (has("target_date")) out.target_date = nz(fd.get("target_date"));
  if (has("target_change_reason")) out.target_change_reason = nz(fd.get("target_change_reason"));
  if (has("completed_date")) out.completed_date = nz(fd.get("completed_date"));
  if (has("signed_quote")) out.signed_quote = num(fd.get("signed_quote"));
  if (has("notes")) out.notes = nz(fd.get("notes"));
  if (has("quote_stage")) out.quote_stage = (nz(fd.get("quote_stage")) ?? "QUEUED") as QuoteStage;
  if (has("estimator_id")) out.estimator_id = nz(fd.get("estimator_id"));
  if (has("quoted_value")) out.quoted_value = nz(fd.get("quoted_value")) ? num(fd.get("quoted_value")) : null;
  if (has("quote_submitted_date")) out.quote_submitted_date = nz(fd.get("quote_submitted_date"));
  if (has("quote_due_date")) out.quote_due_date = nz(fd.get("quote_due_date"));
  if (has("folder_path")) out.folder_path = nz(fd.get("folder_path"));
  if (has("quote_type")) out.quote_type = nz(fd.get("quote_type"))?.toUpperCase() ?? null;
  if (has("scope")) out.scope = fd.getAll("scope").map(String).filter(Boolean).join(", ") || null;
  if (has("waiting_on")) out.waiting_on = nz(fd.get("waiting_on"));
  if (has("raised_by")) out.raised_by = nz(fd.get("raised_by"))?.toUpperCase() ?? null;
  if (has("parent_project_id")) out.parent_project_id = nz(fd.get("parent_project_id"));
  return out as { name?: string } & Record<string, unknown>;
}

function bust(id?: string) {
  revalidatePath("/estimation"); revalidatePath("/board"); revalidatePath("/list");
  if (id) revalidatePath(`/projects/${id}`);
}

export async function setQuoteStage(id: string, quote_stage: QuoteStage) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { quote_stage };
  if (quote_stage === "SUBMITTED") patch.quote_submitted_date = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) return { error: error.message };
  bust(id); return { ok: true };
}

/** Active ↔ Dormant on a submitted quote (Jinky, 30 Oct). The DB clears the flag itself if the quote leaves Submitted. */
export async function setQuoteDormant(id: string, dormant: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ quote_dormant: dormant }).eq("id", id);
  if (error) return { error: error.message };
  bust(id); return { ok: true };
}

export async function saveWaitingOn(id: string, waiting_on: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ waiting_on }).eq("id", id);
  if (error) return { error: error.message };
  bust(id);
  return { ok: true };
}

export async function markWon(id: string) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("signed_quote, quoted_value, parent_project_id").eq("id", id).single();
  if (p?.parent_project_id) {
    // a VO enquiry: becomes the next VO on its parent project, enquiry retired (db/011 win_as_vo)
    const { data: voNo, error } = await supabase.rpc("win_as_vo", { enquiry: id });
    if (error) return { error: error.message };
    bust(id); revalidatePath(`/projects/${p.parent_project_id}`);
    return { ok: true, vo_no: voNo as number, parent: p.parent_project_id as string };
  }
  // Rev 3: a won enquiry lands at stage 3 Award / contract with Jean (the trigger sets status and the ball holder)
  const patch: Record<string, unknown> = { stage: 3, quote_stage: "SUBMITTED" };
  if (p && !(p.signed_quote > 0) && p.quoted_value) patch.signed_quote = p.quoted_value;
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) return { error: error.message };
  bust(id); return { ok: true };
}

export async function markLost(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ status: "LOST" }).eq("id", id);
  if (error) return { error: error.message };
  bust(id); return { ok: true };
}

export async function createEnquiry(_prev: unknown, fd: FormData) {
  const supabase = await createClient();
  const name = (nz(fd.get("name")) ?? "").toUpperCase();
  if (!name) return { error: "Project name (location / address) is required." };
  let enquiry_no = nz(fd.get("enquiry_no"));
  if (!enquiry_no) { const { data } = await supabase.rpc("next_enquiry_no"); enquiry_no = data as string; }
  const { data, error } = await supabase.from("projects").insert({
    enquiry_no, name, client: nz(fd.get("client"))?.toUpperCase() ?? null,
    contractor_id: nz(fd.get("contractor_id")), estimator_id: nz(fd.get("estimator_id")),
    received_date: nz(fd.get("received_date")) ?? new Date().toISOString().slice(0, 10),
    quote_due_date: nz(fd.get("quote_due_date")), folder_path: nz(fd.get("folder_path")), notes: nz(fd.get("notes")),
    quote_type: nz(fd.get("quote_type"))?.toUpperCase() ?? null, scope: fd.getAll("scope").map(String).filter(Boolean).join(", ") || null,
    raised_by: nz(fd.get("raised_by"))?.toUpperCase() ?? null,
    parent_project_id: nz(fd.get("parent_project_id")),
    status: "QUOTE", quote_stage: "QUEUED",
  }).select("id, enquiry_no").single();
  if (error) return { error: error.message };
  bust(data.id);
  return { ok: true, enquiry_no: data.enquiry_no as string, id: data.id as string };
}

/** Tagged people (db/015): add the new ones, drop the removed ones. The triggers log each change,
 *  so being added to a project turns up in that person's next digest. */
async function syncWatchers(projectId: string, fd: FormData) {
  if (!fd.has("watchers_present")) return;               // form didn't carry the control — leave the list alone
  // (an all-unchecked checkbox group posts nothing, so the hidden marker is what tells us it was there)
  const supabase = await createClient();
  const want = [...new Set(fd.getAll("watchers").map(String).filter(Boolean))];
  const { data: cur } = await supabase.from("project_watchers").select("person_id").eq("project_id", projectId);
  const have = new Set(((cur ?? []) as { person_id: string }[]).map((r) => r.person_id));
  const add = want.filter((id) => !have.has(id));
  const drop = [...have].filter((id) => !want.includes(id));
  if (add.length) await supabase.from("project_watchers").insert(add.map((person_id) => ({ project_id: projectId, person_id })));
  if (drop.length) await supabase.from("project_watchers").delete().eq("project_id", projectId).in("person_id", drop);
}

export async function saveProject(id: string, _prev: unknown, fd: FormData) {
  const supabase = await createClient();
  const fields = projectFields(fd);
  if (fields.name === "") return { error: "Project name is required." };
  const { error } = await supabase.from("projects").update(fields).eq("id", id);
  if (error) return { error: error.message };
  await syncWatchers(id, fd);
  revalidatePath("/board"); revalidatePath("/list"); revalidatePath(`/projects/${id}`);
  return { ok: true, at: new Date().toISOString() };
}

export async function createProject(_prev: unknown, fd: FormData) {
  const supabase = await createClient();
  const fields = projectFields(fd);
  if (!fields.name) return { error: "Project name is required." };
  const { data, error } = await supabase.from("projects").insert(fields as { name: string }).select("id").single();
  if (error) return { error: error.message };
  await syncWatchers(data.id as string, fd);
  revalidatePath("/board"); revalidatePath("/list");
  redirect(`/projects/${data.id}`);
}

export async function addVariation(projectId: string, _prev: unknown, fd: FormData) {
  const supabase = await createClient();
  const { data: last } = await supabase.from("variations").select("vo_no").eq("project_id", projectId).order("vo_no", { ascending: false }).limit(1);
  const vo_no = (last?.[0]?.vo_no ?? 0) + 1;
  const { error } = await supabase.from("variations").insert({ project_id: projectId, vo_no, description: nz(fd.get("description")), value: num(fd.get("value")) });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`); revalidatePath("/board"); revalidatePath("/list");
  return { ok: true };
}

export async function deleteVariation(projectId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("variations").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`); revalidatePath("/board"); revalidatePath("/list");
  return { ok: true };
}

// ---------- remove / restore (soft delete, db/012) ----------
export async function removeProject(id: string, _prev: unknown, fd: FormData) {
  const supabase = await createClient();
  const reason = nz(fd.get("reason"));
  if (!reason) return { error: "Say why it's being removed (e.g. duplicate, entered by mistake, test)." };
  const { error } = await supabase.from("projects").update({ deleted_at: new Date().toISOString(), deleted_reason: reason }).eq("id", id);
  if (error) return { error: error.message };
  bust(id); revalidatePath("/meetings");
  redirect(`/list?show=removed&done=${id}`);
}

export async function restoreProject(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ deleted_at: null }).eq("id", id);
  if (error) return { error: error.message };
  bust(id); revalidatePath("/meetings");
  return { ok: true };
}

// ---------- team ----------
const ROLES = ["PM", "DESIGNER", "TECHNICAL_DESIGNER", "ESTIMATOR", "MANAGEMENT", "ADMIN", "PRODUCTION", "PROJECT_COORDINATOR", "PROCUREMENT", "STORE", "ACCOUNTS", "SALES"];
const email = (v: FormDataEntryValue | null) => { const s = nz(v)?.toLowerCase() ?? null; if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error("That email address doesn't look right."); return s; };
const phone = (v: FormDataEntryValue | null) => { const s = nz(v)?.replace(/[\s\-()]/g, "") ?? null; if (s && !/^\+?\d{7,15}$/.test(s)) throw new Error("WhatsApp number should be digits only, e.g. +9715xxxxxxx"); return s; };

export async function savePerson(id: string, _prev: unknown, fd: FormData) {
  const supabase = await createClient();
  try {
    const patch = { full_name: nz(fd.get("full_name")), email: email(fd.get("email")), whatsapp: phone(fd.get("whatsapp")), is_active: fd.get("is_active") === "on", notify_on_award: fd.get("notify_on_award") === "on", handles_escalations: fd.get("handles_escalations") === "on", position: nz(fd.get("position")), can_sign_in: fd.get("whatsapp_only") !== "on" };
    const { error } = await supabase.from("people").update(patch).eq("id", id);
    if (error) return { error: error.message.includes("people_email_key") ? "Another person already has that email." : error.message };
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath("/team");
  return { ok: true, at: new Date().toISOString() };
}

export async function addPerson(_prev: unknown, fd: FormData) {
  const supabase = await createClient();
  const name = (nz(fd.get("name")) ?? "").toUpperCase();
  const role = nz(fd.get("role")) ?? "";
  if (!name) return { error: "Short name is required (the name shown on cards, e.g. BASIM)." };
  if (!ROLES.includes(role)) return { error: "Pick a role." };
  try {
    const { error } = await supabase.from("people").insert({ name, role, full_name: nz(fd.get("full_name")), email: email(fd.get("email")), whatsapp: phone(fd.get("whatsapp")), position: nz(fd.get("position")), can_sign_in: fd.get("whatsapp_only") !== "on" });
    if (error) return { error: error.message.includes("people_name_key") ? `${name} already exists.` : error.message.includes("people_email_key") ? "Another person already has that email." : error.message };
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath("/team");
  return { ok: true, at: new Date().toISOString() };
}

// ---------- meetings ----------
import { hm, type MeetingLocation } from "@/lib/model";
const fmtWhen = (t: string) => hm(t);

function bustMeetings(projectId?: string | null, ...dates: (string | null | undefined)[]) {
  revalidatePath("/meetings"); revalidatePath("/board");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  void dates;
}

/** "Room taken 11:00–12:00 — Basim, Sobha Reserve V622" for the overlapping booking(s), or null. */
async function roomClash(date: string, start: string, end: string, excludeId: string | null) {
  const supabase = await createClient();
  let q = supabase.from("meetings_live").select("id, title, start_time, end_time, attendees, project_name").eq("meeting_date", date).eq("location", "ROOM").eq("cancelled", false).lt("start_time", end).gt("end_time", start);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  if (!data?.length) return null;
  return "Room taken " + data.map((m) => `${fmtWhen(m.start_time)}–${fmtWhen(m.end_time)} — ${(m.attendees as string[]).map((a: string) => a.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())).join(", ") || m.title}${m.project_name ? `, ${m.project_name}` : ""}`).join("; ");
}

export async function saveMeeting(id: string | null, _prev: unknown, fd: FormData) {
  const supabase = await createClient();
  const title = nz(fd.get("title"));
  const meeting_date = nz(fd.get("meeting_date"));
  const start_time = nz(fd.get("start_time"));
  const end_time = nz(fd.get("end_time"));
  const location = (nz(fd.get("location")) ?? "ROOM") as MeetingLocation;
  if (!title) return { error: "Give the meeting a title." };
  if (!meeting_date || !start_time || !end_time) return { error: "Date, start and end are required." };
  if (end_time <= start_time) return { error: "The end time must be after the start time." };
  if (location === "ROOM") { const clash = await roomClash(meeting_date, start_time, end_time, id); if (clash) return { error: clash }; }

  const project_id = nz(fd.get("project_id"));
  const stageRaw = nz(fd.get("stage_no"));
  const held = fd.get("held") === "on";
  const row = { title, meeting_date, start_time, end_time, location, project_id, notes: nz(fd.get("notes")), stage_no: project_id && stageRaw ? Number(stageRaw) : null, held };
  const attendees = fd.getAll("attendees").map(String).filter(Boolean);
  const attended = new Set(fd.getAll("attended").map(String));
  let meetingId = id;
  if (id) {
    const { error } = await supabase.from("meetings").update(row).eq("id", id);
    if (error) return { error: error.code === "23P01" ? (await roomClash(meeting_date, start_time, end_time, id)) ?? "The room is already booked then." : error.message };
    // sync attendees: add the new ones, remove the dropped ones (the trigger logs each change)
    const { data: cur } = await supabase.from("meeting_attendees").select("person_id").eq("meeting_id", id);
    const have = new Set((cur ?? []).map((r) => r.person_id as string));
    const add = attendees.filter((a) => !have.has(a)); const drop = [...have].filter((a) => !attendees.includes(a));
    if (add.length) await supabase.from("meeting_attendees").insert(add.map((person_id) => ({ meeting_id: id, person_id })));
    if (drop.length) await supabase.from("meeting_attendees").delete().eq("meeting_id", id).in("person_id", drop);
    // attendance record: once the meeting is held, every attendee is either present or not; before that it is unrecorded
    for (const person_id of attendees) await supabase.from("meeting_attendees").update({ attended: held ? attended.has(person_id) : null }).eq("meeting_id", id).eq("person_id", person_id);
  } else {
    const { data, error } = await supabase.from("meetings").insert(row).select("id").single();
    if (error) return { error: error.code === "23P01" ? (await roomClash(meeting_date, start_time, end_time, null)) ?? "The room is already booked then." : error.message };
    meetingId = data.id as string;
    if (attendees.length) await supabase.from("meeting_attendees").insert(attendees.map((person_id) => ({ meeting_id: meetingId, person_id })));
  }
  bustMeetings(row.project_id);
  return { ok: true, id: meetingId, at: new Date().toISOString() };
}

export async function cancelMeeting(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("meetings").update({ cancelled: true }).eq("id", id).select("project_id").single();
  if (error) return { error: error.message };
  bustMeetings(data?.project_id);
  return { ok: true };
}

// ---------- items & production (db/014) ----------
import type { DrawingStatus, MaterialStatus, StageStatus } from "@/lib/model";
const DRAWING: DrawingStatus[] = ["A", "B", "C", "D", "UR"];
const STAGE_STATUSES: StageStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DELAYED", "ON_HOLD", "COMPLETE"];
function bustItems(projectId: string) { revalidatePath(`/projects/${projectId}`); revalidatePath("/drawings"); revalidatePath("/board"); revalidatePath("/list"); }
type R = { error?: string; ok?: boolean; at?: string; id?: string };

export async function createItem(projectId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const name = nz(fd.get("name"));
  const type_id = nz(fd.get("type_id"));
  if (!name) return { error: "Give the item a name (e.g. Main kitchen, Master wardrobe)." };
  if (!type_id) return { error: "Pick an item type — it sets the letter in the drawing code." };
  const { data, error } = await supabase.from("items").insert({
    project_id: projectId, type_id, name, area: nz(fd.get("area")), designer_id: nz(fd.get("designer_id")), planned_submission: nz(fd.get("planned_submission")),
  }).select("id").single();
  if (error) return { error: error.message };
  bustItems(projectId);
  return { ok: true, id: data.id as string, at: new Date().toISOString() };
}

export async function saveItem(projectId: string, itemId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  const has = (k: string) => fd.has(k);
  if (has("name")) { const n = nz(fd.get("name")); if (!n) return { error: "The item needs a name." }; patch.name = n; }
  if (has("area")) patch.area = nz(fd.get("area"));
  if (has("type_id")) patch.type_id = nz(fd.get("type_id"));
  if (has("designer_id")) patch.designer_id = nz(fd.get("designer_id"));
  if (has("planned_submission")) patch.planned_submission = nz(fd.get("planned_submission"));
  if (has("drawing_started_date")) patch.drawing_started_date = nz(fd.get("drawing_started_date"));
  if (has("material_approval")) patch.material_approval = (nz(fd.get("material_approval")) ?? "PENDING") as MaterialStatus;
  if (has("measurements_date")) patch.measurements_date = nz(fd.get("measurements_date"));
  if (has("issued_date")) patch.issued_date = nz(fd.get("issued_date"));
  if (has("notes")) patch.notes = nz(fd.get("notes"));
  const { error } = await supabase.from("items").update(patch).eq("id", itemId);
  if (error) return { error: error.message };
  bustItems(projectId);
  return { ok: true, at: new Date().toISOString() };
}

export async function setItemCancelled(projectId: string, itemId: string, cancelled: boolean): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.from("items").update({ cancelled }).eq("id", itemId);
  if (error) return { error: error.message };
  bustItems(projectId);
  return { ok: true };
}

/** Submit the next revision (R0, R1 …) to the client. */
export async function submitRevision(projectId: string, itemId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const submitted_date = nz(fd.get("submitted_date")) ?? new Date().toISOString().slice(0, 10);
  const { data: last } = await supabase.from("item_revisions").select("rev_no, status").eq("item_id", itemId).order("rev_no", { ascending: false }).limit(1);
  const prev = last?.[0];
  if (prev && prev.status == null) return { error: `R${prev.rev_no} is still with the client — record their response first.` };
  const rev_no = prev ? prev.rev_no + 1 : 0;
  const { error } = await supabase.from("item_revisions").insert({ item_id: itemId, rev_no, submitted_date, comments: nz(fd.get("comments")) });
  if (error) return { error: error.message };
  // submitting implies the drawing was started
  await supabase.from("items").update({ drawing_started_date: submitted_date }).eq("id", itemId).is("drawing_started_date", null);
  bustItems(projectId);
  return { ok: true, at: new Date().toISOString() };
}

/** Record the client's response (A / B / C / D / UR) on a revision. */
export async function returnRevision(projectId: string, revisionId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const status = nz(fd.get("status")) as DrawingStatus | null;
  if (!status || !DRAWING.includes(status)) return { error: "Pick the client's response (A, B, C, D or UR)." };
  const returned_date = status === "UR" ? null : (nz(fd.get("returned_date")) ?? new Date().toISOString().slice(0, 10));
  const { error } = await supabase.from("item_revisions").update({ status, returned_date, comments: nz(fd.get("comments")) }).eq("id", revisionId);
  if (error) return { error: error.message };
  bustItems(projectId);
  return { ok: true, at: new Date().toISOString() };
}

export async function saveStage(projectId: string, stageId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const status = (nz(fd.get("status")) ?? "NOT_STARTED") as StageStatus;
  if (!STAGE_STATUSES.includes(status)) return { error: "Unknown stage status." };
  const patch = { planned_start: nz(fd.get("planned_start")), planned_end: nz(fd.get("planned_end")), actual_start: nz(fd.get("actual_start")), actual_end: nz(fd.get("actual_end")), status, na: fd.get("na") === "on", notes: nz(fd.get("notes")) };
  if (patch.planned_start && patch.planned_end && patch.planned_end < patch.planned_start) return { error: "The planned end is before the planned start." };
  const { error } = await supabase.from("item_production_stages").update(patch).eq("id", stageId);
  if (error) return { error: error.message };
  bustItems(projectId);
  return { ok: true, at: new Date().toISOString() };
}

/** Quick status change from the stage strip / schedule lists */
export async function setStageStatus(projectId: string, stageId: string, status: StageStatus): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.from("item_production_stages").update({ status }).eq("id", stageId);
  if (error) return { error: error.message };
  bustItems(projectId);
  return { ok: true };
}

// ---------- workflow Rev 3 (db/016) ----------
/** Admin override (decision 4): move a card to a stage without the next owner accepting. The trigger records who authorised it. */
export async function overrideMove(projectId: string, toStage: number, reason: string): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.from("handovers").insert({ project_id: projectId, to_stage: toStage, status: "OVERRIDE", override_reason: reason });
  if (error) return { error: error.message };
  bust(projectId);
  return { ok: true };
}

/** Stage 0: a new opportunity in the Qualifying column, held by Sales until Tom or Aftab say proceed. */
export async function createQualifying(_prev: unknown, fd: FormData): Promise<R & { id?: string }> {
  const supabase = await createClient();
  const name = (nz(fd.get("name")) ?? "").toUpperCase();
  if (!name) return { error: "Give the opportunity a name (location / address)." };
  const { data, error } = await supabase.from("projects").insert({
    name, client: nz(fd.get("client"))?.toUpperCase() ?? null, notes: nz(fd.get("notes")), raised_by: nz(fd.get("raised_by"))?.toUpperCase() ?? null,
    received_date: new Date().toISOString().slice(0, 10), status: "QUOTE", quote_stage: "QUEUED", stage: 0,
  }).select("id").single();
  if (error) return { error: error.message };
  bust(data.id as string);
  return { ok: true, id: data.id as string };
}
/** Proceed: Sales hand the enquiry to Ramus (stage 1), who registers it with a number. Decline closes it like Lost. */
export async function qualify(projectId: string, proceed: boolean): Promise<R> {
  const supabase = await createClient();
  const { data: me } = await supabase.rpc("me");
  const patch: Record<string, unknown> = proceed ? { stage: 1, qualified_by: (me as { id?: string } | null)?.id ?? null } : { status: "LOST", declined_at: new Date().toISOString() };
  if (proceed) {
    // the app issues the enquiry number the moment it enters estimating (Rev 3 stage 1)
    const { data: cur } = await supabase.from("projects").select("enquiry_no").eq("id", projectId).single();
    if (!cur?.enquiry_no) { const { data: no } = await supabase.rpc("next_enquiry_no"); patch.enquiry_no = no; }
  }
  const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
  if (error) return { error: error.message };
  bust(projectId);
  return { ok: true };
}

// ---------- handovers (Rev 3: the ball only moves when the next person accepts) ----------
function bustWorkflow(projectId: string) { revalidatePath(`/projects/${projectId}`); revalidatePath("/board"); revalidatePath("/list"); }

export async function requestHandover(projectId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const to_stage = parseInt((fd.get("to_stage") ?? "").toString(), 10);
  if (isNaN(to_stage)) return { error: "Pick the next stage." };
  const row: Record<string, unknown> = { project_id: projectId, to_stage, note: nz(fd.get("note")), to_person_id: nz(fd.get("to_person_id")) };
  const { error } = await supabase.from("handovers").insert(row);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true, at: new Date().toISOString() };
}
/** The named next owner accepts; stage and ball move together (trigger). */
export async function acceptHandover(projectId: string, handoverId: string): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.from("handovers").update({ status: "ACCEPTED" }).eq("id", handoverId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true };
}
/** Anne records an acceptance that came on WhatsApp: the message is the evidence, she is the recorder, the owner is still the owner. */
export async function recordAcceptance(projectId: string, handoverId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const evidence = nz(fd.get("acceptance_evidence"));
  if (!evidence) return { error: "Paste the acceptance message — it is the evidence." };
  const t = nz(fd.get("evidence_time"));
  const { error } = await supabase.from("handovers").update({ status: "ACCEPTED", acceptance_evidence: evidence, evidence_time: t ? new Date(t).toISOString() : null }).eq("id", handoverId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true, at: new Date().toISOString() };
}
export async function returnHandover(projectId: string, handoverId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const reason = nz(fd.get("return_reason"));
  if (!reason) return { error: "Say what is missing — the outgoing owner needs a specific reason." };
  const { error } = await supabase.from("handovers").update({ status: "RETURNED", return_reason: reason }).eq("id", handoverId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true, at: new Date().toISOString() };
}
export async function cancelHandover(projectId: string, handoverId: string): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.from("handovers").update({ status: "CANCELLED" }).eq("id", handoverId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true };
}
/** Admin accept-for-someone with a reason (decision 4) — recorded as an override against the admin's name. */
export async function overrideAccept(projectId: string, handoverId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const reason = nz(fd.get("override_reason"));
  if (!reason) return { error: "Give a reason for accepting on their behalf." };
  const { error } = await supabase.from("handovers").update({ status: "ACCEPTED", override_reason: reason }).eq("id", handoverId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true, at: new Date().toISOString() };
}

// ---------- holds ----------
export async function putOnHold(projectId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const reason = nz(fd.get("reason"));
  if (!reason) return { error: "Say why the project is on hold." };
  const { error } = await supabase.from("holds").insert({
    project_id: projectId, reason, waiting_on_person_id: nz(fd.get("waiting_on_person_id")), waiting_on: nz(fd.get("waiting_on")),
    required_action: nz(fd.get("required_action")), action_due: nz(fd.get("action_due")), review_date: nz(fd.get("review_date")),
  });
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true, at: new Date().toISOString() };
}
export async function releaseHold(projectId: string, holdId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.from("holds").update({ released_at: new Date().toISOString(), release_note: nz(fd.get("release_note")) }).eq("id", holdId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true, at: new Date().toISOString() };
}

// ---------- next action, checklist, evidence, tasks ----------
export async function saveNextAction(projectId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ next_action: nz(fd.get("next_action")), next_action_owner_id: nz(fd.get("next_action_owner_id")), next_action_due: nz(fd.get("next_action_due")) }).eq("id", projectId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true, at: new Date().toISOString() };
}
export async function tickChecklist(projectId: string, stageNo: number, itemKey: string, done: boolean, note?: string | null): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.from("stage_evidence").upsert({ project_id: projectId, stage_no: stageNo, item_key: itemKey, done, note: note ?? null }, { onConflict: "project_id,stage_no,item_key" });
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true };
}
/** A file already uploaded to the `evidence` bucket by the browser, or a link — one row either way. */
export async function addEvidence(projectId: string, stageNo: number, data: { item_key?: string | null; file_path?: string | null; file_name?: string | null; link_url?: string | null; note?: string | null }): Promise<R> {
  const supabase = await createClient();
  if (!data.file_path && !data.link_url) return { error: "Nothing to attach." };
  const { error } = await supabase.from("stage_evidence").insert({ project_id: projectId, stage_no: stageNo, done: true, item_key: null, file_path: data.file_path ?? null, file_name: data.file_name ?? null, link_url: data.link_url ?? null, note: data.note ?? (data.item_key ? `for: ${data.item_key}` : null) });
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true };
}
export async function removeEvidence(projectId: string, evidenceId: string): Promise<R> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("stage_evidence").select("file_path").eq("id", evidenceId).single();
  const { error } = await supabase.from("stage_evidence").delete().eq("id", evidenceId);
  if (error) return { error: error.message };
  if (row?.file_path) await supabase.storage.from("evidence").remove([row.file_path as string]);
  bustWorkflow(projectId);
  return { ok: true };
}
/** A short-lived link to an evidence file (the bucket is private). */
export async function evidenceUrl(filePath: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("evidence").createSignedUrl(filePath, 600);
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}
export async function addTask(projectId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const title = nz(fd.get("title"));
  if (!title) return { error: "What is the task?" };
  const { error } = await supabase.from("project_tasks").insert({ project_id: projectId, title, owner_id: nz(fd.get("owner_id")), due: nz(fd.get("due")) });
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true, at: new Date().toISOString() };
}
export async function setTaskDone(projectId: string, taskId: string, done: boolean): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.from("project_tasks").update({ done_at: done ? new Date().toISOString() : null }).eq("id", taskId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true };
}
/** Reassignment for leave or capacity: one replacement, who authorised it, why (Rev 3). Team managers and admins. */
export async function reassignBall(projectId: string, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const to = nz(fd.get("to_person_id"));
  const reason = nz(fd.get("reason"));
  if (!to) return { error: "Pick the replacement." };
  if (!reason) return { error: "Say why (leave, capacity …)." };
  const { data: p } = await supabase.from("projects").select("ball_holder_id").eq("id", projectId).single();
  const { error: e1 } = await supabase.from("reassignments").insert({ project_id: projectId, role: "BALL", from_person_id: p?.ball_holder_id ?? null, to_person_id: to, reason });
  if (e1) return { error: e1.message };
  const { error } = await supabase.from("projects").update({ ball_holder_id: to }).eq("id", projectId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true, at: new Date().toISOString() };
}
/** Reconciliation (plan §3): the named owner (or an admin) confirms a stage the migration set.
 *  Tom, 28 Oct: the stage clock resets at go-live, so confirming also restarts stage_entered_at from now. */
export async function confirmMigratedStage(projectId: string): Promise<R> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("projects").update({ stage_migrated: false, stage_accepted_at: now, stage_entered_at: now }).eq("id", projectId);
  if (error) return { error: error.message };
  bustWorkflow(projectId);
  return { ok: true };
}

/** Team page: who holds each stage by default (names live here, never in code). Team managers only (RLS). */
export async function setStageOwner(stageNo: number, personId: string | null): Promise<R> {
  const supabase = await createClient();
  const { error } = personId
    ? await supabase.from("stage_owners").upsert({ stage_no: stageNo, person_id: personId }, { onConflict: "stage_no" })
    : await supabase.from("stage_owners").delete().eq("stage_no", stageNo);
  if (error) return { error: error.message };
  revalidatePath("/team"); revalidatePath("/board");
  return { ok: true };
}

/** /reconcile (Rev 3 rollout step 1): Anne or Jinky set the true stage and owner on a migrated card and mark it accepted.
 *  The stage/status trigger keeps status in step; a stage change with no holder picked falls back to the stage's default owner. */
export async function reconcileCard(projectId: string, stage: number | null, ballHolderId: string | null): Promise<R> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { stage_migrated: false, stage_accepted_at: now, stage_entered_at: now };   // the clock restarts at confirmation (Tom, 28 Oct)
  if (stage != null) patch.stage = stage;
  if (ballHolderId !== undefined) patch.ball_holder_id = ballHolderId;
  const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
  if (error) return { error: error.message };
  bustWorkflow(projectId); revalidatePath("/reconcile");
  return { ok: true, at: new Date().toISOString() };
}

/** /stages: admins edit the Rev 3 stage reference in the app (Rev 4 is a data change, not a deploy). RLS: write_admin on stages. */
export async function saveStageDefinition(stageNo: number, _prev: unknown, fd: FormData): Promise<R> {
  const supabase = await createClient();
  const lines = (k: string) => (nz(fd.get(k)) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const name = nz(fd.get("name")); const short_name = nz(fd.get("short_name"));
  if (!name || !short_name) return { error: "Name and short name are required." };
  // checklist lines are "key | text"; a line without a key gets one from its text (keys are what ticks are stored against — keep them stable)
  const seen = new Set<string>();
  const checklist = lines("checklist").map((l) => {
    const [a, b] = l.includes("|") ? l.split("|").map((x) => x.trim()) : ["", l];
    let key = (a || b).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "item";
    while (seen.has(key)) key += "_"; seen.add(key);
    return { key, text: b };
  });
  const patch = {
    name, short_name, department: nz(fd.get("department")) ?? "", position: nz(fd.get("position")), description: nz(fd.get("description")),
    checklist, evidence: nz(fd.get("evidence")), supporting: lines("supporting"), loop: lines("loop"), attendance: lines("attendance"),
    retains_ball: fd.get("retains_ball") === "on",
  };
  const { error } = await supabase.from("stages").update(patch).eq("stage_no", stageNo);
  if (error) return { error: error.message };
  revalidatePath("/stages"); revalidatePath("/board"); revalidatePath("/team");
  return { ok: true, at: new Date().toISOString() };
}
