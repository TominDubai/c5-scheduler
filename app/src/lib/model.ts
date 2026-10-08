export type Status =
  | "QUOTE" | "DESIGN_DRAWINGS" | "PROD_DRAWINGS" | "PRODUCTION"
  | "INSTALLATION" | "SNAGGING" | "COMPLETED" | "SITE_ON_HOLD" | "LOST";

export const STAGES: [Status, string][] = [
  ["QUOTE", "Quote"], ["DESIGN_DRAWINGS", "Design drawings"], ["PROD_DRAWINGS", "Prod drawings"],
  ["PRODUCTION", "Production"], ["INSTALLATION", "Installation"], ["SNAGGING", "Snagging"], ["COMPLETED", "Completed"],
];
export const SIDE: [Status, string][] = [["SITE_ON_HOLD", "Site on hold"], ["LOST", "Lost"]];
export const ALL = [...STAGES, ...SIDE];
export const LABEL: Record<Status, string> = Object.fromEntries(ALL) as Record<Status, string>;
export const ORDER: Record<Status, number> = Object.fromEntries(ALL.map(([k], i) => [k, i])) as Record<Status, number>;

export type QuoteStage = "QUEUED" | "PRICING" | "AWAITING_SUPPLIER" | "SUBMITTED";
export const QUOTE_STAGES: [QuoteStage, string][] = [
  ["QUEUED", "Queued"], ["PRICING", "Being priced"], ["AWAITING_SUPPLIER", "Waiting on suppliers"], ["SUBMITTED", "Submitted"],
];
export const QUOTE_LABEL: Record<QuoteStage, string> = Object.fromEntries(QUOTE_STAGES) as Record<QuoteStage, string>;

export type Project = {
  id: string; enquiry_no: string | null; name: string; client: string | null;
  contractor_id: string | null; pm_id: string | null; pm2_id: string | null; designer_id: string | null; technical_designer_id: string | null;
  status: Status; difficulty: number | null;
  received_date: string | null; start_date: string | null; target_date: string | null; completed_date: string | null;
  signed_quote: number; notes: string | null; updated_at: string;
  quote_stage: QuoteStage; estimator_id: string | null; quoted_value: number | null; quote_submitted_date: string | null; quote_due_date: string | null; folder_path: string | null;
  // from projects_live
  contractor: string | null; pm: string | null; pm2: string | null; designer: string | null; estimator: string | null; days_since_enquiry: number | null;
  project_value: number; vo_count: number; days_to_completion: number | null; duration_days: number | null; days_delayed: number | null; status_since: string | null;
};
export type Person = { id: string; name: string; full_name: string | null; role: string; email: string | null; whatsapp: string | null; is_active: boolean };
export type Contractor = { id: string; name: string };
export type Variation = { id: string; project_id: string; vo_no: number; description: string | null; value: number; approved_on: string | null };
export type History = { id: string; from_status: Status | null; to_status: Status; changed_at: string; note: string | null; changed_by: string | null; who?: string | null };

export const aed = (v: number | null | undefined) => v ? "AED " + Math.round(v).toLocaleString("en-GB") : "—";
export const aedS = (v: number) => v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v));
export const fmtD = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—";
export const fmtDShort = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
export const title = (s: string | null | undefined) => s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
export const ini = (n: string | null | undefined) => n ? n.split(/[\s/]+/).map((s) => s[0]).join("").slice(0, 2) : "—";

export type Tone = "crit" | "warn" | "soon" | "ok" | "done" | "none";
export function tone(p: Pick<Project, "status" | "days_delayed">): Tone {
  if (p.status === "COMPLETED") return "done";
  if (p.status === "LOST") return "none";
  if (p.days_delayed == null) return "none";
  if (p.days_delayed > 30) return "crit";
  if (p.days_delayed > 0) return "warn";
  if (p.days_delayed > -14) return "soon";
  return "ok";
}
export function delayText(p: Pick<Project, "status" | "days_delayed">): string {
  const d = p.days_delayed;
  if (p.status === "COMPLETED") return d == null ? "Done" : d > 0 ? `Done ${d}d late` : d < 0 ? `Done ${-d}d early` : "Done on target";
  if (d == null) return "No target";
  if (d > 0) return `${d}d late`;
  if (d === 0) return "Due today";
  return `${-d}d left`;
}
