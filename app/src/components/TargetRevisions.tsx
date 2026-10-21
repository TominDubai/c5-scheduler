import { fmtD, title, type TargetRevision } from "@/lib/model";

const dayDiff = (a: string | null, b: string | null) => a && b ? Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000) : null;
const slip = (n: number | null) => n == null ? "" : n === 0 ? "same date" : n > 0 ? `+${n} days` : `${n} days`;

/** Every target completion date this project has ever had — Rev 0 is the original programme. Written by trigger; nobody edits this list. */
export default function TargetRevisions({ revisions, current, canEdit }: { revisions: TargetRevision[]; current: string | null; canEdit: boolean }) {
  const rev0 = revisions.find((r) => r.rev_no === 0);
  const total = dayDiff(current, rev0?.target_date ?? null);
  return (
    <div className="panel">
      <h2>Target completion — revisions</h2>
      {revisions.length === 0 ? (
        <span style={{ color: "var(--fg3)" }}>No target date yet.{canEdit ? " Set one in the form above and it becomes Rev 0." : ""}</span>
      ) : (
        <>
          <ul className="hist revs">
            {revisions.map((r) => { const d = dayDiff(r.target_date, r.prev_date); return (
              <li key={r.id} className={r.rev_no === revisions[0].rev_no ? "cur" : ""}>
                <span className="rev">Rev {r.rev_no}</span>
                <b className="date">{r.target_date ? fmtD(r.target_date) : "cleared"}</b>
                {r.rev_no > 0 && d != null && <span className={`pill ${d > 0 ? "warn" : d < 0 ? "ok" : ""}`}>{slip(d)}</span>}
                <span className="why">{r.reason ?? <i style={{ color: "var(--fg3)" }}>no reason given</i>}</span>
                <span className="by">{fmtD(r.set_at)}{r.who?.name ? ` · ${title(r.who.name)}` : ""}</span>
              </li>
            ); })}
          </ul>
          {revisions.length > 1 && total != null && (
            <p className="note">Against the original programme: <b>{slip(total)}</b> over {revisions.length - 1} revision{revisions.length === 2 ? "" : "s"}.</p>
          )}
          {canEdit && <p className="note">To revise the target, change the date in the form above and say why — it's recorded here automatically.</p>}
        </>
      )}
    </div>
  );
}
