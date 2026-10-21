import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import type { Project, Person, Contractor, Me, TargetRevision } from "@/lib/model";

type Extra = { id: string; parent_project_id: string | null; deleted_at: string | null; deleted_reason: string | null; deleted_by: string | null };
/** parent links and removal stamps live on the projects table (the view predates those columns); stitch them on here */
async function withParents(rows: Project[]): Promise<Project[]> {
  const supabase = await createClient();
  const { data: ex } = await supabase.from("projects").select("id, parent_project_id, deleted_at, deleted_reason, deleted_by:people!projects_deleted_by_fkey(name)").in("id", rows.map((r) => r.id));
  const extras = new Map(((ex ?? []) as unknown as (Omit<Extra, "deleted_by"> & { deleted_by: { name: string } | null })[]).map((e) => [e.id, { ...e, deleted_by: e.deleted_by?.name ?? null } as Extra]));
  const parentOf = new Map([...extras.values()].filter((e) => e.parent_project_id).map((e) => [e.id, e.parent_project_id as string]));
  // target revisions: highest rev_no = current, rev 0 = original programme
  const { data: revs } = await supabase.from("target_revisions").select("project_id, rev_no, target_date").in("project_id", rows.map((r) => r.id)).order("rev_no");
  const rev = new Map<string, { target_rev: number; target_rev0_date: string | null }>();
  for (const r of (revs ?? []) as { project_id: string; rev_no: number; target_date: string | null }[]) {
    const cur = rev.get(r.project_id);
    rev.set(r.project_id, { target_rev: r.rev_no, target_rev0_date: cur ? cur.target_rev0_date : r.target_date });
  }
  const byId = new Map(rows.map((p) => [p.id, p]));
  const missing = [...new Set([...parentOf.values()])].filter((id) => !byId.has(id));
  const extra = missing.length ? (await supabase.from("projects").select("id, name, enquiry_no").in("id", missing)).data ?? [] : [];
  const names = new Map<string, { name: string; enquiry_no: string | null }>([...rows.map((p) => [p.id, { name: p.name, enquiry_no: p.enquiry_no }] as const), ...extra.map((e) => [e.id as string, { name: e.name as string, enquiry_no: e.enquiry_no as string | null }] as const)]);
  return rows.map((p) => { const pid = parentOf.get(p.id) ?? null; const par = pid ? names.get(pid) : null; const e = extras.get(p.id); return { ...p, parent_project_id: pid, parent_name: par?.name ?? null, parent_enquiry_no: par?.enquiry_no ?? null, deleted_at: e?.deleted_at ?? null, deleted_reason: e?.deleted_reason ?? null, deleted_by: e?.deleted_by ?? null, target_rev: rev.get(p.id)?.target_rev ?? null, target_rev0_date: rev.get(p.id)?.target_rev0_date ?? null }; });
}
async function allProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects_live").select("*").neq("status", "MERGED").order("name");
  if (error) throw new Error(`projects_live: ${error.message}`);
  return withParents((data ?? []) as Project[]);
}
/** every live project: not merged into a parent as a VO, not removed */
export const getProjects = cache(async function getProjects(): Promise<Project[]> {
  return (await allProjects()).filter((p) => !p.deleted_at);
});
/** projects someone has removed — shown only on the List's "Removed" view, where they can be restored */
export const getRemovedProjects = cache(async function getRemovedProjects(): Promise<Project[]> {
  return (await allProjects()).filter((p) => !!p.deleted_at).sort((a, b) => (b.deleted_at! < a.deleted_at! ? -1 : 1));
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

export async function getTargetRevisions(projectId: string): Promise<TargetRevision[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("target_revisions").select("*, who:people(name)").eq("project_id", projectId).order("rev_no", { ascending: false });
  return (data ?? []) as TargetRevision[];
}
