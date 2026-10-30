import { title, type ParentOption } from "@/lib/model";

/** Options for the "This is a VO for" select: live projects, then completed ones in their own group. */
export default function ParentOptions({ projects }: { projects: ParentOption[] }) {
  const label = (p: ParentOption) => `${p.enquiry_no ? `${p.enquiry_no} · ` : ""}${title(p.name)}${p.client ? ` (${title(p.client)})` : ""}`;
  const live = projects.filter((p) => !p.completed);
  const done = projects.filter((p) => p.completed);
  return (
    <>
      <optgroup label="Live projects">{live.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>
      {done.length > 0 && <optgroup label="Completed — a won VO brings the card back to the board">{done.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>}
    </>
  );
}
