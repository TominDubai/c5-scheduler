import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import TeamTable from "@/components/TeamTable";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/model";

export const dynamic = "force-dynamic";

async function Inner_TeamPage() {
  const supabase = await createClient();
  const [me, { data, error }] = await Promise.all([getMe(), supabase.from("people").select("*").order("role").order("name")]);
  if (error) throw new Error(`people: ${error.message}`);
  const people = (data ?? []) as Person[];
  const active = people.filter((p) => p.is_active);
  const noEmail = active.filter((p) => !p.email);
  return (
    <Shell active="team">
      <section className="summary">
        <div className="stats">
          <div className="stat"><b>{active.length}</b><span>on the team</span></div>
          <div className={`stat${noEmail.length ? " crit" : ""}`}><b>{noEmail.length}</b><span>without an email — get no updates</span></div>
          <div className="stat"><b>{active.filter((p) => p.whatsapp).length}</b><span>with WhatsApp</span></div>
        </div>
        <p className="note teamnote">Anyone with an email here can sign in and gets an update email when their projects change. Team members are added and edited by Tom, Darren and Jinky; permissions (who can edit what) are set by an administrator.</p>
      </section>
      <main><TeamTable people={people} canEdit={me.canTeam} /></main>
    </Shell>
  );
}

export default async function TeamPage() {
  try { return await Inner_TeamPage(); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e;
    return <Shell><Failed what="team" error={e} /></Shell>;
  }
}
