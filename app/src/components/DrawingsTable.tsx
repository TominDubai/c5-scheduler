"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { LABEL, ITEM_STAGE_ORDER, fmtDShort, title, itemFlags, revLabel, enqKey, type Item } from "@/lib/model";
import { StageChip } from "@/components/StageStrip";

type Key = "drawing_code" | "name" | "project_name" | "designer" | "pm" | "stage" | "current_revision" | "planned_submission" | "last_submitted" | "issued_date";
const COLS: [Key, string, boolean][] = [
  ["drawing_code", "Code", false], ["name", "Item", false], ["project_name", "Project", false], ["designer", "Designer", false], ["pm", "PM", false],
  ["stage", "Stage", false], ["current_revision", "Rev", true], ["planned_submission", "R0 due", true], ["last_submitted", "Last sent", true], ["issued_date", "Issued", true],
];

/** All items across live projects, grouped by project when sorted by project (the default). */
export default function DrawingsTable({ items, total, canEdit }: { items: Item[]; total: number; canEdit: boolean }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ k: Key; d: 1 | -1 }>({ k: "project_name", d: 1 });
  void canEdit;
  const rows = [...items].sort((a, b) => {
    if (sort.k === "project_name") return ((enqKey(a.enquiry_no) - enqKey(b.enquiry_no)) || a.project_name.localeCompare(b.project_name) || a.item_code.localeCompare(b.item_code)) * sort.d;
    if (sort.k === "stage") return ((ITEM_STAGE_ORDER[a.stage] - ITEM_STAGE_ORDER[b.stage]) || a.drawing_code.localeCompare(b.drawing_code)) * sort.d;
    const av = a[sort.k] ?? null, bv = b[sort.k] ?? null;
    if (av == null && bv == null) return 0; if (av == null) return 1; if (bv == null) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * sort.d;
  });
  const click = (k: Key) => setSort((s) => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : 1 }));
  const grouped = sort.k === "project_name";
  let lastProject: string | null = null;
  return (
    <div className="listview">
      {items.length === 0 ? <p className="empty-items">{total === 0 ? "No items on any project yet. Each project's designer adds them from the project page." : "Nothing matches these filters."}</p> : (
      <div className="tablewrap drawings">
        <table>
          <thead><tr>{COLS.map(([k, l, num]) => <th key={k} className={(num ? "num " : "") + (sort.k === k ? "sorted" : "")} onClick={() => click(k)}>{l}{sort.k === k ? (sort.d === 1 ? " ↑" : " ↓") : ""}</th>)}<th>Flags</th></tr></thead>
          <tbody>
            {rows.map((i) => {
              const head = grouped && i.project_id !== lastProject; lastProject = i.project_id;
              const flags = itemFlags(i);
              return (
                <Fragment key={i.id}>
                  {head && <tr className="group"><td colSpan={11}><span className="enq">{i.enquiry_no ?? "—"}</span> {title(i.project_name)} <span className={`status s-${i.project_status}`}>{LABEL[i.project_status]}</span><small>{i.client ? ` · ${title(i.client)}` : ""}{i.pm ? ` · PM ${title(i.pm)}` : ""}</small></td></tr>}
                  <tr className="row" onClick={() => router.push(`/projects/${i.project_id}?item=${i.id}`)}>
                    <td className="enq code">{i.drawing_code}</td>
                    <td className="name">{i.name}{i.area ? <small> · {i.area}</small> : null}</td>
                    <td>{grouped ? "" : title(i.project_name)}</td>
                    <td>{i.designer ? title(i.designer) : <i>none</i>}</td>
                    <td>{i.pm ? title(i.pm) : <i>none</i>}</td>
                    <td><StageChip i={i} /></td>
                    <td className="num">{i.current_revision == null ? <i>—</i> : <><b>{revLabel(i.current_revision)}</b> <span className={`ds ds-${i.current_status ?? "UR"}`}>{i.current_status ?? "UR"}</span></>}</td>
                    <td className="num"><span className={i.submission_overdue ? "due crit" : ""}>{fmtDShort(i.planned_submission)}</span></td>
                    <td className="num">{fmtDShort(i.last_submitted)}</td>
                    <td className="num">{fmtDShort(i.issued_date)}</td>
                    <td className="flags">{flags.slice(0, 2).map((f) => <span key={f.text} className={`pill ${f.tone}`}>{f.text}</span>)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>)}
    </div>
  );
}
