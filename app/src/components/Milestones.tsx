"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtD, title, MILESTONE_KINDS, MILESTONE_LABEL, type Milestone, type MilestoneRevision, type Me } from "@/lib/model";
import { withdrawRevision, editRevisionReason } from "@/app/actions";

const dayDiff = (a: string | null, b: string | null) => a && b ? Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000) : null;
const slip = (n: number | null) => n == null ? "" : n === 0 ? "same date" : n > 0 ? `+${n} days` : `${n} days`;
const within24h = (iso: string) => Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000;

/**
 * The four planned milestones (Anne, 2 Nov): what's planned, whether it's been reached, and every date each one
 * has ever had. Rev 0 is the original programme. A wrong entry can be withdrawn by whoever made it within 24 h
 * (admins any time) — it stays visible, struck through, and stops counting. Rows come from triggers; nobody edits
 * the dates here — change them in the form above and say why.
 */
export default function Milestones({ projectId, milestones, revisions, me, canEdit }: { projectId: string; milestones: Milestone[]; revisions: MilestoneRevision[]; me: Me; canEdit: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState("");
  const byKind = new Map(milestones.map((m) => [m.kind, m]));
  const canTouch = (r: MilestoneRevision) => r.rev_no > 0 && (me.isAdmin || (!!me.id && r.set_by === me.id && within24h(r.set_at)));
  const canEditReason = (r: MilestoneRevision) => me.isAdmin || (!!me.id && r.set_by === me.id && within24h(r.set_at));
  const [withdrawing, setWithdrawing] = useState<number | null>(null);
  const [why, setWhy] = useState("");
  async function withdraw(r: MilestoneRevision, undo: boolean) {
    const res = await withdrawRevision(projectId, r.id, undo, undo ? null : why);
    if (res.error) setErr(res.error); else { setErr(null); setWithdrawing(null); setWhy(""); router.refresh(); }
  }
  async function saveReason(r: MilestoneRevision) {
    const res = await editRevisionReason(projectId, r.id, text);
    if (res.error) setErr(res.error); else { setErr(null); setEditing(null); router.refresh(); }
  }
  const status = (m: Milestone) => {
    if (!m.planned_date) return <span className="note">not planned</span>;
    if (m.actual_date) return <span className={`pill ${m.late ? "crit" : "ok"}`}>{m.late ? `reached ${slip(dayDiff(m.actual_date, m.planned_date))} late` : "reached on time"}</span>;
    if (m.reached) return <span className="pill ok">reached</span>;
    if (m.late) return <span className="pill crit">overdue</span>;
    if (m.revisions > 0) return <span className="pill soon">extended · Rev {m.rev_no}</span>;
    return <span className="pill done">on programme</span>;
  };
  return (
    <div className="panel">
      <h2>Milestones</h2>
      <table className="mstable">
        <thead><tr><th>Milestone</th><th>Planned</th><th>Reached</th><th>Status</th></tr></thead>
        <tbody>
          {MILESTONE_KINDS.map((k) => { const m = byKind.get(k); return (
            <tr key={k}>
              <td className="name">{MILESTONE_LABEL[k]}</td>
              <td>{m?.planned_date ? <>{fmtD(m.planned_date)}{m.rev_no > 0 && <span className="rev">Rev {m.rev_no}</span>}{m.rev_no > 0 && m.rev0_date && <small className="orig"> originally {fmtD(m.rev0_date)}</small>}</> : <i>—</i>}</td>
              <td>{m?.actual_date ? fmtD(m.actual_date) : m?.reached ? <i title="Reached before the app tracked handovers">yes · date not recorded</i> : <i>—</i>}</td>
              <td>{m ? status(m) : <i>—</i>}</td>
            </tr>
          ); })}
        </tbody>
      </table>
      {canEdit && <p className="note">To plan or move a milestone, change its date in the form above and say why — it’s recorded below automatically. “Reached” is read from the handover history (entering Materials, Installation, Snagging and Final accounts).</p>}
      {err && <div className="msg err">{err}</div>}
      {MILESTONE_KINDS.map((k) => {
        const revs = revisions.filter((r) => r.kind === k);
        if (revs.length === 0) return null;
        const live = revs.filter((r) => !r.withdrawn_at);
        const cur = live[0];
        const rev0 = revs.find((r) => r.rev_no === 0);
        const total = dayDiff(cur?.planned_date ?? null, rev0?.planned_date ?? null);
        const n = live.filter((r) => r.rev_no > 0).length;
        return (
          <div key={k} className="msrevs">
            <h3>{MILESTONE_LABEL[k]} — revisions</h3>
            <ul className="hist revs">
              {revs.map((r) => { const d = dayDiff(r.planned_date, r.prev_date); const wd = !!r.withdrawn_at; return (
                <li key={r.id} className={(cur && r.id === cur.id ? "cur" : "") + (wd ? " withdrawn" : "")}>
                  <span className="rev">Rev {r.rev_no}</span>
                  <b className="date">{r.planned_date ? fmtD(r.planned_date) : "cleared"}</b>
                  {r.rev_no > 0 && d != null && !wd ? <span className={`pill ${d > 0 ? "warn" : d < 0 ? "ok" : ""}`}>{slip(d)}</span> : <span />}
                  {withdrawing === r.id ? (
                    <span className="why editwhy"><input value={why} onChange={(e) => setWhy(e.target.value)} autoFocus placeholder="Why withdraw it? (optional)" /><button type="button" className="btn ghost sm danger" onClick={() => withdraw(r, false)}>Yes, withdraw</button><button type="button" className="linkbtn" onClick={() => setWithdrawing(null)}>Cancel</button></span>
                  ) : editing === r.id ? (
                    <span className="why editwhy"><input value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="Reason" /><button type="button" className="btn ghost sm" onClick={() => saveReason(r)}>Save</button><button type="button" className="linkbtn" onClick={() => setEditing(null)}>Cancel</button></span>
                  ) : (
                    <span className="why">{r.reason ?? <i style={{ color: "var(--fg3)" }}>no reason given</i>}{r.edited_at && <small className="edited"> · edited</small>}{wd && <small className="wdnote"> · withdrawn {fmtD(r.withdrawn_at)}{r.withdrawer?.name ? ` by ${title(r.withdrawer.name)}` : ""}{r.withdrawn_reason ? ` — ${r.withdrawn_reason}` : ""}</small>}</span>
                  )}
                  <span className="by">{fmtD(r.set_at)}{r.who?.name ? ` · ${title(r.who.name)}` : ""}
                    {!wd && canEditReason(r) && editing !== r.id && <button type="button" className="linkbtn tiny" onClick={() => { setEditing(r.id); setText(r.reason ?? ""); }}>edit</button>}
                    {canTouch(r) && withdrawing !== r.id && <button type="button" className="linkbtn tiny" onClick={() => { if (wd) withdraw(r, true); else { setWithdrawing(r.id); setEditing(null); } }}>{wd ? "restore" : "withdraw"}</button>}
                  </span>
                </li>
              ); })}
            </ul>
            {n > 0 && total != null && <p className="note">Against the original programme: <b>{slip(total)}</b> over {n} revision{n === 1 ? "" : "s"}{live.length !== revs.length ? ` (${revs.length - live.length} withdrawn, not counted)` : ""}.</p>}
          </div>
        );
      })}
      {revisions.length === 0 && <span className="note">No milestone dates yet.{canEdit ? " Set them in the form above — each becomes Rev 0." : ""}</span>}
    </div>
  );
}
