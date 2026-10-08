"use client";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aed, type Variation } from "@/lib/model";
import { addVariation, deleteVariation } from "@/app/actions";

export default function Variations({ projectId, signedQuote, vos }: { projectId: string; signedQuote: number; vos: Variation[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addVariation.bind(null, projectId), null as { error?: string; ok?: boolean } | null);
  const [, start] = useTransition();
  const total = signedQuote + vos.reduce((s, v) => s + (v.value || 0), 0);
  return (
    <div className="panel">
      <h2>Value</h2>
      <div className="volist">
        <div className="vo"><b>Quote</b><span>Signed quote</span><span className="amt">{aed(signedQuote)}</span><span /></div>
        {vos.map((v) => (
          <div className="vo" key={v.id}>
            <b>VO{v.vo_no}</b><span>{v.description || <i style={{ color: "var(--fg3)" }}>no description</i>}</span>
            <span className="amt">{aed(v.value)}</span>
            <button className="x" aria-label={`Remove VO${v.vo_no}`} onClick={() => start(async () => { await deleteVariation(projectId, v.id); router.refresh(); })}>×</button>
          </div>
        ))}
        <div className="vo-total"><span>Project value inc. VAT</span><span>{aed(total)}</span></div>
      </div>
      <form action={formAction} className="vo-form">
        <input name="description" placeholder={`VO${vos.length + 1} description`} aria-label="Variation description" />
        <input name="value" inputMode="decimal" placeholder="AED" aria-label="Variation value" required />
        <button className="btn sm" disabled={pending}>Add VO</button>
      </form>
      {state?.error && <span className="msg err">{state.error}</span>}
    </div>
  );
}
