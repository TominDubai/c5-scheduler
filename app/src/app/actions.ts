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
  return {
    enquiry_no: nz(fd.get("enquiry_no")),
    name: (nz(fd.get("name")) ?? "").toUpperCase(),
    client: nz(fd.get("client"))?.toUpperCase() ?? null,
    contractor_id: nz(fd.get("contractor_id")),
    pm_id: nz(fd.get("pm_id")),
    pm2_id: nz(fd.get("pm2_id")),
    designer_id: nz(fd.get("designer_id")),
    status: (nz(fd.get("status")) ?? "QUOTE") as Status,
    received_date: nz(fd.get("received_date")),
    start_date: nz(fd.get("start_date")),
    target_date: nz(fd.get("target_date")),
    completed_date: nz(fd.get("completed_date")),
    signed_quote: num(fd.get("signed_quote")),
    notes: nz(fd.get("notes")),
    quote_stage: (nz(fd.get("quote_stage")) ?? "QUEUED") as QuoteStage,
    estimator_id: nz(fd.get("estimator_id")),
    quoted_value: fd.get("quoted_value") != null && nz(fd.get("quoted_value")) ? num(fd.get("quoted_value")) : null,
    quote_submitted_date: nz(fd.get("quote_submitted_date")),
    quote_due_date: nz(fd.get("quote_due_date")),
    folder_path: nz(fd.get("folder_path")),
  };
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

export async function markWon(id: string) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("signed_quote, quoted_value").eq("id", id).single();
  const patch: Record<string, unknown> = { status: "DESIGN_DRAWINGS", quote_stage: "SUBMITTED" };
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
    status: "QUOTE", quote_stage: "QUEUED",
  }).select("id, enquiry_no").single();
  if (error) return { error: error.message };
  bust(data.id);
  return { ok: true, enquiry_no: data.enquiry_no as string, id: data.id as string };
}

export async function saveProject(id: string, _prev: unknown, fd: FormData) {
  const supabase = await createClient();
  const fields = projectFields(fd);
  if (!fields.name) return { error: "Project name is required." };
  const { error } = await supabase.from("projects").update(fields).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/board"); revalidatePath("/list"); revalidatePath(`/projects/${id}`);
  return { ok: true, at: new Date().toISOString() };
}

export async function createProject(_prev: unknown, fd: FormData) {
  const supabase = await createClient();
  const fields = projectFields(fd);
  if (!fields.name) return { error: "Project name is required." };
  const { data, error } = await supabase.from("projects").insert(fields).select("id").single();
  if (error) return { error: error.message };
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
