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
  ["QUEUED", "Queued"], ["PRICING", "Being priced"], ["AWAITING_SUPPLIER", "Waiting on info"], ["SUBMITTED", "Submitted"],
];
export const QUOTE_LABEL: Record<QuoteStage, string> = Object.fromEntries(QUOTE_STAGES) as Record<QuoteStage, string>;

export type Project = {
  id: string; enquiry_no: string | null; name: string; client: string | null;
  contractor_id: string | null; pm_id: string | null; pm2_id: string | null; designer_id: string | null; technical_designer_id: string | null;
  status: Status; difficulty: number | null;
  received_date: string | null; start_date: string | null; target_date: string | null; completed_date: string | null;
  signed_quote: number; notes: string | null; updated_at: string;
  quote_stage: QuoteStage; estimator_id: string | null; quoted_value: number | null; quote_submitted_date: string | null; quote_due_date: string | null; folder_path: string | null;
  quote_type: string | null; scope: string | null; waiting_on: string | null; raised_by: string | null;
  // from projects_live
  contractor: string | null; pm: string | null; pm2: string | null; designer: string | null; estimator: string | null; days_since_enquiry: number | null;
  project_value: number; vo_count: number; days_to_completion: number | null; duration_days: number | null; days_delayed: number | null; status_since: string | null;
};
export type Person = { id: string; name: string; full_name: string | null; role: string; email: string | null; whatsapp: string | null; is_active: boolean; can_edit_estimation: boolean; can_edit_projects: boolean; can_manage_team: boolean };
export type Me = { name: string; canEstimation: boolean; canProjects: boolean; canTeam: boolean };
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

export const WAITING_ON = ["Client info", "Designer info", "Metal quote", "Stone quote", "Glass quote", "Supplier quote", "Site measure", "Drawings", "Other"];
export const SCOPES = ["Joinery", "Metalwork", "Stonework", "Glasswork", "Other"];
/** days until a quote is due: null = no date; amber within 3 days, red when overdue */
export function dueTone(due: string | null) {
  if (!due) return null;
  const d = Math.round((new Date(due).getTime() - Date.now()) / 86400000);
  return { d, tone: d < 0 ? "crit" : d <= 3 ? "warn" : "ok" } as const;
}

// ---------- meetings ----------
export type MeetingLocation = "ROOM" | "SITE";
export const LOCATION_LABEL: Record<MeetingLocation, string> = { ROOM: "Meeting room", SITE: "On site" };
export type Meeting = {
  id: string; title: string; project_id: string | null; location: MeetingLocation;
  meeting_date: string; start_time: string; end_time: string; notes: string | null; cancelled: boolean;
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
  // from meetings_live
  project_name: string | null; enquiry_no: string | null; created_by_name: string | null; updated_by_name: string | null;
  attendee_ids: string[]; attendees: string[];
};
/** Working week: Monday to Saturday, 08:00–18:00 Dubai. */
export const WEEK_DAYS = 6;
export const DAY_START = 8;   // working hours, shaded and where the grid opens
export const DAY_END = 18;
export const GRID_START = 6;  // the grid itself runs 06:00–22:00 so early or late meetings still fit
export const GRID_END = 22;
export const hm = (t: string | null | undefined) => (t ?? "").slice(0, 5);          // "09:30:00" -> "09:30"
export const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
/** YYYY-MM-DD for today in Dubai, whatever the server's clock zone */
export const todayDubai = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
export const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** the Monday that starts the working week containing `iso` (a Sunday rolls forward to the coming week) */
export function weekStart(iso: string) {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sun
  return dow === 0 ? addDays(iso, 1) : addDays(iso, 1 - dow);
}
export const fmtDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const fmtDayLong = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
