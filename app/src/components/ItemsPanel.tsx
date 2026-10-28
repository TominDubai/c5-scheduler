"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createItem } from "@/app/actions";
import { fmtDShort, title, itemFlags, revLabel, type Item, type ItemType, type ItemRevision, type ItemProductionStage, type Me, type Person, itemRights } from "@/lib/model";
import ItemDrawer from "@/components/ItemDrawer";
import StageStrip, { StageChip } from "@/components/StageStrip";
import Progress from "@/components/Progress";

export type ItemsData = { items: Item[]; revisions: ItemRevision[]; stages: ItemProductionStage[] };
type Props = { projectId: string; projectDesignerId: string | null; data: ItemsData; types: ItemType[]; people: Person[]; me: Me; locked?: boolean };

/** The item list for one project — the designer builds it, Gajanand and the PM move the stages. Click a row for the drawer. */
export default function ItemsPanel({ projectId, projectDesignerId, data, types, people, me, locked }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const rights = itemRights(me);
  const canAdd = rights.items && !locked;
  const [open, setOpen] = useState<string | null>(sp.get("item"));
  const [adding, setAdding] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  useEffect(() => { setOpen(sp.get("item")); }, [sp]);
  const openItem = (id: string | null) => {
    setOpen(id);
    const q = new URLSearchParams(sp.toString());
    if (id) q.set("item", id); else q.delete("item");
    router.replace("?" + q.toString(), { scroll: false });
  };
  const live = data.items.filter((i) => !i.cancelled);
  const cancelled = data.items.filter((i) => i.cancelled);
  const rows = showCancelled ? data.items : live;
  const stagesByItem = useMemo(() => { const m = new Map<string, ItemProductionStage[]>(); for (const s of data.stages) m.set(s.item_id, [...(m.get(s.item_id) ?? []), s]); return m; }, [data.stages]);
  const designers = people.filter((p) => p.role === "DESIGNER" || p.role === "TECHNICAL_DESIGNER");
  const current = open ? data.items.find((i) => i.id === open) ?? null : null;
  const n = { total: live.length, approved: live.filter((i) => !["NOT_STARTED", "DRAWING", "SUBMITTED"].includes(i.stage)).length, prod: live.filter((i) => ["ISSUED", "JOINERY", "PAINT", "DELIVERY"].includes(i.stage)).length, site: live.filter((i) => ["INSTALL", "STONE", "SNAGGING"].includes(i.stage)).length, done: live.filter((i) => i.stage === "COMPLETE").length };
  const attention = live.filter((i) => itemFlags(i).length > 0).length;

  return (
    <div className="panel items">
      <div className="items-head">
        <h2>Items <small>{n.total === 0 ? "" : `· ${n.total}`}</small></h2>
        {n.total > 0 && (
          <div className="items-stats">
            <span><b>{n.approved}</b> approved</span><span><b>{n.prod}</b> in production</span><span><b>{n.site}</b> on site</span><span><b>{n.done}</b> complete</span>
            {attention > 0 && <span className="crit"><b>{attention}</b> need attention</span>}
          </div>
        )}
        {canAdd && <button className="btn sm bronze" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Item"}</button>}
      </div>
      {n.total > 0 && (
        <Progress done={n.done} site={n.site} prod={n.prod} appr={n.approved - n.prod - n.site - n.done} todo={n.total - n.approved} title={`${n.done} complete · ${n.site} on site · ${n.prod} in production · ${n.total - n.approved} in drawings`} />
      )}
      {adding && <AddItem projectId={projectId} types={types} designers={designers} defaultDesigner={projectDesignerId} onDone={(id) => { setAdding(false); router.refresh(); if (id) openItem(id); }} />}
      {rows.length === 0 ? (
        <p className="empty-items">{canAdd ? "No items yet. Add every piece of joinery that needs a shop drawing — kitchens, wardrobes, vanities, TV units. Ancillary quote lines (stone supply, appliances, site works) stay off this list." : "No items have been added to this project yet."}</p>
      ) : (
        <div className="tablewrap items-table">
          <table>
            <thead><tr><th>Code</th><th>Item</th><th>Area</th><th>Designer</th><th>Stage</th><th>Drawing</th><th>Due</th><th>Production</th><th></th></tr></thead>
            <tbody>
              {rows.map((i) => { const flags = itemFlags(i); return (
                <tr key={i.id} className={`row${i.cancelled ? " off" : ""}${open === i.id ? " open" : ""}`} onClick={() => openItem(i.id)}>
                  <td className="enq code">{i.drawing_code}</td>
                  <td className="name">{i.name}{i.cancelled && <span className="pill none" style={{ marginLeft: 8 }}>cancelled</span>}</td>
                  <td>{i.area ?? "—"}</td>
                  <td>{i.designer ? title(i.designer) : <i>none</i>}</td>
                  <td><StageChip i={i} /></td>
                  <td className="draw">{i.current_revision == null ? <i>not submitted</i> : <><b>{revLabel(i.current_revision)}</b> <span className={`ds ds-${i.current_status ?? "UR"}`}>{i.current_status ?? "UR"}</span></>}{i.past_r3 && <span className="pill warn" style={{ marginLeft: 6 }}>R{i.current_revision}</span>}</td>
                  <td className="num">{i.current_revision == null ? <span className={i.submission_overdue ? "due crit" : ""}>{fmtDShort(i.planned_submission)}</span> : fmtDShort(i.last_returned ?? i.last_submitted)}</td>
                  <td><StageStrip stages={stagesByItem.get(i.id) ?? []} issued={!!i.issued_date} /></td>
                  <td className="flags">{flags.slice(0, 2).map((f) => <span key={f.text} className={`pill ${f.tone}`}>{f.text}</span>)}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
      {cancelled.length > 0 && <button className="linkbtn" onClick={() => setShowCancelled((s) => !s)}>{showCancelled ? "Hide" : "Show"} {cancelled.length} cancelled item{cancelled.length === 1 ? "" : "s"}</button>}
      {current && <ItemDrawer key={current.id + current.updated_at} item={current} revisions={data.revisions.filter((r) => r.item_id === current.id)} stages={stagesByItem.get(current.id) ?? []} types={types} designers={designers} me={me} locked={!!locked} onClose={() => openItem(null)} />}
    </div>
  );
}

function AddItem({ projectId, types, designers, defaultDesigner, onDone }: { projectId: string; types: ItemType[]; designers: Person[]; defaultDesigner: string | null; onDone: (id?: string) => void }) {
  const [state, action, pending] = useActionState(createItem.bind(null, projectId), null as { error?: string; ok?: boolean; at?: string; id?: string } | null);
  useEffect(() => { if (state?.ok) onDone(state.id); }, [state?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={action} className="form additem">
      <div className="field"><label htmlFor="it-type">Type</label>
        <select id="it-type" name="type_id" defaultValue={types[0]?.id} required>{types.map((t) => <option key={t.id} value={t.id}>{t.code_letter} · {t.name}</option>)}</select></div>
      <div className="field wide"><label htmlFor="it-name">Item</label><input id="it-name" name="name" required autoFocus placeholder="e.g. Main kitchen, Master bedroom wardrobe, Guest vanity" /></div>
      <div className="field"><label htmlFor="it-area">Area / room</label><input id="it-area" name="area" placeholder="Ground floor, Master bedroom …" /></div>
      <div className="field"><label htmlFor="it-designer">Designer</label>
        <select id="it-designer" name="designer_id" defaultValue={defaultDesigner ?? ""}><option value="">— project designer —</option>{designers.map((p) => <option key={p.id} value={p.id}>{title(p.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="it-sub">Planned R0 submission</label><input id="it-sub" name="planned_submission" type="date" /></div>
      <div className="actions"><button className="btn" disabled={pending}>{pending ? "Adding…" : "Add item"}</button><span className="note">The drawing code is assigned automatically — the next free number for that type on this project.</span>{state?.error && <span className="msg err">{state.error}</span>}</div>
    </form>
  );
}
