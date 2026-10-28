import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import ReconcileTable from "@/components/ReconcileTable";
import { getProjects, getMe, getStages, getStageOwners, getPeople } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Rev 3 rollout step 1, done in the app: every live card the migration staged, for Anne and Jinky to confirm or correct.
 *  Stays available afterwards as an audit of what is still unconfirmed. */
async function Inner_ReconcilePage() {
  const [all, me, stages, owners, people] = await Promise.all([getProjects(), getMe(), getStages(), getStageOwners(), getPeople()]);
  const allowed = me.isAdmin || me.role === "PROJECT_COORDINATOR" || me.canTeam;
  const live = all.filter((p) => p.status !== "LOST" && p.status !== "MERGED" && p.status !== "COMPLETED" && p.status !== "QUOTE");
  const todo = live.filter((p) => p.stage_migrated || p.stage == null);
  const done = live.length - todo.length;
  return (
    <Shell active="board">
      <section className="summary">
        <div className="stats">
          <div className={`stat${todo.length ? " crit" : ""}`}><b>{todo.length}</b><span>cards still to confirm</span></div>
          <div className="stat"><b>{done}</b><span>confirmed</span></div>
          <div className="stat"><b>{todo.filter((p) => p.stage == null).length}</b><span>with no stage at all</span></div>
        </div>
        <p className="note teamnote">Every live project was given a stage and a ball holder from its old status on 28 Oct. Nobody has agreed those yet. Set the true stage and who really holds the ball, then confirm — the card loses its “to confirm” tag, its stage clock restarts from today, and the owner is on the hook from then on. {allowed ? "" : "Only administrators and the project coordinator can confirm here; ask Anne or Jinky."}</p>
      </section>
      <main className="column">
        <ReconcileTable projects={todo} stages={stages} owners={owners} people={people} canEdit={allowed} />
      </main>
    </Shell>
  );
}

export default async function ReconcilePage() {
  try { return await Inner_ReconcilePage(); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e;
    return <Shell><Failed what="the reconciliation list" error={e} /></Shell>;
  }
}
