import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import StageSettings from "@/components/StageSettings";
import { getMe, getStages } from "@/lib/data";

export const dynamic = "force-dynamic";

/** The Rev 3 stage reference, editable by administrators: names, departments, descriptions, checklists, evidence,
 *  supporting / keep-in-the-loop / must-attend lists. Rev 4 is edited here, not deployed. */
async function Inner_StagesPage() {
  const [me, stages] = await Promise.all([getMe(), getStages()]);
  return (
    <Shell active="team">
      <section className="summary">
        <div className="stats"><div className="stat"><b>{stages.length}</b><span>stages (Rev 3, 27 Oct 2026)</span></div></div>
        <p className="note teamnote">What each stage means, what has to be done before the ball can move, and who is kept in the loop. Changes show on every card and project page straight away. {me.isAdmin ? "Checklist lines are “key | text” — keep a key the same to keep the ticks already recorded against it." : "Only administrators can edit; everyone can read."} Default ball holders and target days are on the <a href="/team">Team page</a>.</p>
      </section>
      <main className="column">
        <StageSettings stages={stages} canEdit={me.isAdmin} />
      </main>
    </Shell>
  );
}

export default async function StagesPage() {
  try { return await Inner_StagesPage(); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e;
    return <Shell><Failed what="the stage settings" error={e} /></Shell>;
  }
}
