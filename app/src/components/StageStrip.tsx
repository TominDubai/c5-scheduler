import { PRODUCTION_STAGES, ITEM_STAGE_LABEL, itemTone, type Item, PSTAGE_LABEL, STAGE_STATUS_LABEL, fmtDShort, type ItemProductionStage } from "@/lib/model";

/** Six little segments — Joinery · Paint · Delivery · Install · Stone · Snagging — coloured by status. */
export default function StageStrip({ stages, issued }: { stages: ItemProductionStage[]; issued: boolean }) {
  if (!issued) return <span className="strip notissued" title="Not yet issued to production">—</span>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <span className="strip" aria-label="Production stages">
      {PRODUCTION_STAGES.map(([k]) => {
        const s = stages.find((x) => x.stage === k);
        const late = !!s && !s.na && s.status !== "COMPLETE" && !!s.planned_end && s.planned_end < today;
        const cls = s ? (s.na ? "na" : late ? "late" : s.status.toLowerCase()) : "not_started";
        const tip = s ? `${PSTAGE_LABEL[k]}: ${s.na ? "N/A" : STAGE_STATUS_LABEL[s.status]}${s.planned_start || s.planned_end ? ` · ${fmtDShort(s.planned_start)} → ${fmtDShort(s.planned_end)}` : ""}${late ? " · late" : ""}` : PSTAGE_LABEL[k];
        return <i key={k} className={cls} title={tip} />;
      })}
    </span>
  );
}

export function StageChip({ i }: { i: Item }) {
  return <span className={`pill ${itemTone(i)}`}>{ITEM_STAGE_LABEL[i.stage]}{i.stage === "SUBMITTED" && i.current_status === "UR" ? " · UR" : ""}</span>;
}
