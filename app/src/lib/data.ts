import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import type { Project, Person, Contractor, Me } from "@/lib/model";

/** parent links live on the projects table (the view predates the column); stitch them on here */
async function withParents(rows: Project[]): Promise<Project[]> {
  const supabase = await createClient();
  const { data: links } = await supabase.from("projects").select("id, parent_project_id").not("parent_project_id", "is", null);
  const parentOf = new Map((links ?? []).map((l) => [l.id as string, l.parent_project_id as string]));
  const byId = new Map(rows.map((p) => [p.id, p]));
  const missing = [...new Set([...parentOf.values()])].filter((id) => !byId.has(id));
  const extra = missing.length ? (await supabase.from("projects").select("id, name, enquiry_no").in("id", missing)).data ?? [] : [];
  const names = new Map<string, { name: string; enquiry_no: string | null }>([...rows.map((p) => [p.id, { name: p.name, enquiry_no: p.enquiry_no }] as const), ...extra.map((e) => [e.id as string, { name: e.name as string, enquiry_no: e.enquiry_no as string | null }] as const)]);
  return rows.map((p) => { const pid = parentOf.get(p.id) ?? null; const par = pid ? names.get(pid) : null; return { ...p, parent_project_id: pid, parent_name: par?.name ?? null, parent_enquiry_no: par?.enquiry_no ?? null }; });
}
/** every project except enquiries already folded into a parent as a VO */
export const getProjects = cache(async function getProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects_live").select("*").neq("status", "MERGED").order("name");
  if (error) throw new Error(`projects_live: ${error.message}`);
  return withParents((data ?? []) as Project[]);
});
export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("projects_live").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return (await withParents([data as Project]))[0];
}
export const getPeople = cache(async function getPeople(): Promise<Person[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("*").eq("is_active", true).order("name");
  return (data ?? []) as Person[];
});
export const getContractors = cache(async function getContractors(): Promise<Contractor[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("contractors").select("*").order("name");
  return (data ?? []) as Contractor[];
});
export function pmCounts(projects: Project[]) {
  const m = new Map<string, number>();
  for (const p of projects) { if (p.pm) m.set(p.pm, (m.get(p.pm) ?? 0) + 1); if (p.pm2) m.set(p.pm2, (m.get(p.pm2) ?? 0) + 1); }
  return [...m.entries()].sort().map(([name, n]) => ({ name, n }));
}

export const getMe = cache(async function getMe(): Promise<Me> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("me");
  if (error) throw new Error(`me(): ${error.message}`);
  const p = data as Person | null;
  return { name: p?.name ?? "", canEstimation: !!p?.can_edit_estimation, canProjects: !!p?.can_edit_projects, canTeam: !!p?.can_manage_team };
});

export function applyFilters<T extends { name: string; client: string | null; enquiry_no: string | null; pm: string | null; pm2: string | null }>(rows: T[], sp: { pm?: string; q?: string }) {
  const q = (sp.q ?? "").toLowerCase();
  return rows.filter((p) => (!sp.pm || p.pm === sp.pm || p.pm2 === sp.pm) && (!q || `${p.name} ${p.client ?? ""} ${p.enquiry_no ?? ""}`.toLowerCase().includes(q)));
}

export const getUser = cache(async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

// ---------- meetings ----------
import type { Meeting } from "@/lib/model";
export async function getMeetings(from: string, to: string): Promise<Meeting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("meetings_live").select("*").eq("cancelled", false).gte("meeting_date", from).lte("meeting_date", to).order("meeting_date").order("start_time");
  if (error) throw new Error(`meetings_live: ${error.message}`);
  return (data ?? []) as Meeting[];
}
export async function getProjectMeetings(projectId: string): Promise<Meeting[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("meetings_live").select("*").eq("cancelled", false).eq("project_id", projectId).order("meeting_date", { ascending: false }).order("start_time").limit(20);
  return (data ?? []) as Meeting[];
}
