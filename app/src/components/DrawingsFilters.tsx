"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { title, ITEM_STAGE_LABEL, ITEM_STAGE_ORDER, type ItemStage } from "@/lib/model";

type P = { id: string; name: string; enquiry_no: string | null };
export default function DrawingsFilters({ projects, designers, pms, stages }: { projects: P[]; designers: string[]; pms: string[]; stages: ItemStage[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const set = (k: string, v: string) => { const q = new URLSearchParams(sp.toString()); if (v) q.set(k, v); else q.delete(k); router.replace("?" + q.toString()); };
  const sorted = [...stages].sort((a, b) => ITEM_STAGE_ORDER[a] - ITEM_STAGE_ORDER[b]);
  return (
    <>
      <select aria-label="Filter by project" value={sp.get("project") ?? ""} onChange={(e) => set("project", e.target.value)}>
        <option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.enquiry_no ? `${p.enquiry_no} · ` : ""}{title(p.name)}</option>)}
      </select>
      <select aria-label="Filter by designer" value={sp.get("designer") ?? ""} onChange={(e) => set("designer", e.target.value)}>
        <option value="">All designers</option>{designers.map((d) => <option key={d} value={d}>{title(d)}</option>)}
      </select>
      <select aria-label="Filter by PM" value={sp.get("pm") ?? ""} onChange={(e) => set("pm", e.target.value)}>
        <option value="">All PMs</option>{pms.map((d) => <option key={d} value={d}>{title(d)}</option>)}
      </select>
      <select aria-label="Filter by stage" value={sp.get("stage") ?? ""} onChange={(e) => set("stage", e.target.value)}>
        <option value="">All stages</option>
        <option value="DRAWINGS">— In drawings —</option><option value="FACTORY">— In the factory —</option><option value="SITE">— On site —</option>
        {sorted.map((s) => <option key={s} value={s}>{ITEM_STAGE_LABEL[s]}</option>)}
      </select>
      <select aria-label="Flags" value={sp.get("flag") ?? ""} onChange={(e) => set("flag", e.target.value)}>
        <option value="">Everything</option><option value="attention">Needs attention</option><option value="r3">Past R3</option>
      </select>
      <input type="search" placeholder="Code, item, project…" aria-label="Search" defaultValue={sp.get("q") ?? ""} onChange={(e) => set("q", e.target.value.trim())} />
    </>
  );
}
