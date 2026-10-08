import { createClient } from "@/lib/supabase/server";
import type { Project, Person, Contractor, Me } from "@/lib/model";

export async function getProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects_live").select("*").order("name");
  if (error) throw new Error(`projects_live: ${error.message}`);
  return (data ?? []) as Project[];
}
export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("projects_live").select("*").eq("id", id).maybeSingle();
  return (data as Project) ?? null;
}
export async function getPeople(): Promise<Person[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("*").eq("is_active", true).order("name");
  return (data ?? []) as Person[];
}
export async function getContractors(): Promise<Contractor[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("contractors").select("*").order("name");
  return (data ?? []) as Contractor[];
}
export function pmCounts(projects: Project[]) {
  const m = new Map<string, number>();
  for (const p of projects) { if (p.pm) m.set(p.pm, (m.get(p.pm) ?? 0) + 1); if (p.pm2) m.set(p.pm2, (m.get(p.pm2) ?? 0) + 1); }
  return [...m.entries()].sort().map(([name, n]) => ({ name, n }));
}

export async function getMe(): Promise<Me> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("me");
  if (error) throw new Error(`me(): ${error.message}`);
  const p = data as Person | null;
  return { name: p?.name ?? "", canEstimation: !!p?.can_edit_estimation, canProjects: !!p?.can_edit_projects };
}
