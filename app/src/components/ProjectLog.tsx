"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { title, type LogEntry, type Me } from "@/lib/model";
import { addLogEntry, editLogEntry, removeLogEntry, evidenceUrl } from "@/app/actions";

const fmtWhen = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const within24h = (iso: string) => Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000;

/**
 * Project log (Anne, 2 Nov): dated updates and issues faced — "containers not on site yet", "client changed the
 * stone" — each stamped with who and when, with an optional file or link. It goes out in the 10-minute digest
 * to the project's people. The author can edit or remove their own entry for 24 hours; admins any time.
 * Removal is a soft delete: the row keeps its place in the audit trail, the file is deleted.
 */
export default function ProjectLog({ projectId, entries, me, canWrite }: { projectId: string; entries: LogEntry[]; me: Me; canWrite: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mine = (e: LogEntry) => me.isAdmin || (!!me.id && e.created_by === me.id && within24h(e.created_at));

  async function post() {
    if (!body.trim()) { setErr("Write what happened first."); return; }
    setBusy(true); setErr(null);
    let file_path: string | null = null, file_name: string | null = null;
    if (file) {
      if (file.size > 25 * 1024 * 1024) { setErr(`${file.name} is over 25 MB.`); setBusy(false); return; }
      const supabase = createClient();
      file_path = `${projectId}/log/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("evidence").upload(file_path, file, { upsert: false, contentType: file.type || undefined });
      if (error) { setErr(`${file.name}: ${error.message}`); setBusy(false); return; }
      file_name = file.name;
    }
    const r = await addLogEntry(projectId, { body, file_path, file_name, link_url: link.trim() || null });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setBody(""); setLink(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }
  async function open(e: LogEntry) {
    if (e.link_url) { window.open(e.link_url, "_blank"); return; }
    if (e.file_path) { const r = await evidenceUrl(e.file_path); if (r.url) window.open(r.url, "_blank"); else setErr(r.error ?? "Couldn’t open that file."); }
  }
  return (
    <div className="panel">
      <h2>Project log</h2>
      {canWrite && (
        <div className="logcompose">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="What happened? e.g. Containers still not on site — final measurement can’t be taken until they land. Client informed." />
          <div className="logtools">
            <input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.zip,.msg,.eml" />
            <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()}>{file ? `📎 ${file.name}` : "Attach file"}</button>
            {file && <button type="button" className="linkbtn" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>remove</button>}
            <input className="loglink" value={link} onChange={(e) => setLink(e.target.value)} placeholder="or paste a link" />
            <button type="button" className="btn sm" disabled={busy || !body.trim()} onClick={post}>{busy ? "Posting…" : "Post to log"}</button>
          </div>
          <small className="note">Goes to the project’s people in the next update email. You can edit or remove your own entry for 24 hours.</small>
        </div>
      )}
      {err && <div className="msg err">{err}</div>}
      {entries.length === 0 ? <span className="note">Nothing logged yet.{canWrite ? " Use it for anything the next person should know — delays, decisions, problems on site." : ""}</span> : (
        <ul className="loglist">
          {entries.map((e) => (
            <li key={e.id}>
              <div className="loghead"><b>{e.who?.name ? title(e.who.name) : "—"}</b><time>{fmtWhen(e.created_at)}</time>{e.edited_at && <small>edited</small>}
                {mine(e) && editing !== e.id && removing !== e.id && <span className="logact"><button type="button" className="linkbtn tiny" onClick={() => { setEditing(e.id); setText(e.body); }}>edit</button><button type="button" className="linkbtn tiny" onClick={() => setRemoving(e.id)}>remove</button></span>}
                {removing === e.id && <span className="logact confirm">Remove this entry? <button type="button" className="btn ghost sm danger" onClick={async () => { const r = await removeLogEntry(projectId, e.id); if (r.error) setErr(r.error); setRemoving(null); router.refresh(); }}>Yes, remove</button><button type="button" className="linkbtn" onClick={() => setRemoving(null)}>Cancel</button></span>}
              </div>
              {editing === e.id ? (
                <div className="logcompose"><textarea value={text} onChange={(ev) => setText(ev.target.value)} rows={2} autoFocus /><div className="logtools"><button type="button" className="btn sm" onClick={async () => { const r = await editLogEntry(projectId, e.id, text); if (r.error) setErr(r.error); else { setEditing(null); router.refresh(); } }}>Save</button><button type="button" className="linkbtn" onClick={() => setEditing(null)}>Cancel</button></div></div>
              ) : <p className="logbody">{e.body}</p>}
              {(e.file_path || e.link_url) && <button type="button" className="filelink" onClick={() => open(e)}>{e.link_url ? "🔗" : "📎"} {e.file_name ?? e.link_url ?? e.file_path}</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
