export type Status =
  | "QUOTE" | "DESIGN_DRAWINGS" | "PROD_DRAWINGS" | "PRODUCTION"
  | "INSTALLATION" | "SNAGGING" | "COMPLETED" | "SITE_ON_HOLD" | "LOST" | "MERGED";

export const STAGES: [Status, string][] = [
  ["QUOTE", "Quotation"], ["DESIGN_DRAWINGS", "Design drawings"], ["PROD_DRAWINGS", "Prod drawings"],
  ["PRODUCTION", "Production"], ["INSTALLATION", "Installation"], ["SNAGGING", "Snagging"], ["COMPLETED", "Completed"],
];
export const SIDE: [Status, string][] = [["SITE_ON_HOLD", "Site on hold"], ["LOST", "Lost"]];
/** MERGED = a VO enquiry that was won and folded into its parent project; never shown as a column */
export const ALL: [Status, string][] = [...STAGES, ...SIDE, ["MERGED", "Added as VO"]];
export const LABEL: Record<Status, string> = Object.fromEntries(ALL) as Record<Status, string>;
export const ORDER: Record<Status, number> = Object.fromEntries(ALL.map(([k], i) => [k, i])) as Record<Status, number>;

export type QuoteStage = "QUEUED" | "PRICING" | "AWAITING_SUPPLIER" | "SUBMITTED";
export const QUOTE_STAGES: [QuoteStage, string][] = [
  ["QUEUED", "Queued"], ["PRICING", "Being priced"], ["AWAITING_SUPPLIER", "Waiting on info"], ["SUBMITTED", "Submitted"],
];
export const QUOTE_LABEL: Record<QuoteStage, string> = Object.fromEntries(QUOTE_STAGES) as Record<QuoteStage, string>;

export type Project = TargetInfo & {
  id: string; enquiry_no: string | null; name: string; client: string | null;
  contractor_id: string | null; pm_id: string | null; pm2_id: string | null; designer_id: string | null; technical_designer_id: string | null;
  status: Status; difficulty: number | null;
  received_date: string | null; start_date: string | null; target_date: string | null; completed_date: string | null;
  signed_quote: number; notes: string | null; updated_at: string;
  quote_stage: QuoteStage; estimator_id: string | null; quoted_value: number | null; quote_submitted_date: string | null; quote_due_date: string | null; folder_path: string | null;
  quote_type: string | null; scope: string | null; waiting_on: string | null; raised_by: string | null;
  // from projects_live
  contractor: string | null; pm: string | null; pm2: string | null; designer: string | null; estimator: string | null; days_since_enquiry: number | null;
  // VO enquiries: which live project this quote belongs to (filled in by getProjects from the projects table)
  parent_project_id: string | null; parent_name: string | null; parent_enquiry_no: string | null;
  /** submitted quotes only: true = parked (too small / client gone quiet), still winnable but out of the active count */
  quote_dormant: boolean; quote_dormant_since: string | null;
  reopened_vo_no: number | null;            // db/022 — set while a completed card is back on the board for a VO
  // soft delete (filled in by getProjects from the projects table): removed projects stay in the database but leave every screen
  deleted_at: string | null; deleted_reason: string | null; deleted_by: string | null;
  project_value: number; vo_count: number; days_to_completion: number | null; duration_days: number | null; days_delayed: number | null; status_since: string | null;
  // Workflow Rev 3 (db/016): one stage, one ball holder, a flow status; the rest comes from projects_live
  stage: number | null; ball_holder_id: string | null; flow_status: FlowStatus; coordinator_id: string | null;
  stage_entered_at: string | null; stage_migrated: boolean; stage_accepted_at: string | null;
  next_action: string | null; next_action_owner_id: string | null; next_action_due: string | null; qualified_by: string | null; declined_at: string | null;
  technical_designer: string | null; coordinator: string | null; ball_holder: string | null; ball_holder_full: string | null; ball_holder_position: string | null; ball_holder_can_sign_in: boolean | null;
  next_action_owner: string | null; stage_name: string | null; stage_short: string | null; phase: Phase | null; department: string | null; owner_rule: string | null; next_stage: number | null; retains_ball: boolean | null;
  stage_target_days: number | null; stage_age_days: number | null; stage_overdue: boolean;
  hold_id: string | null; hold_reason: string | null; hold_waiting_on: string | null; hold_action: string | null; hold_action_due: string | null; hold_since: string | null; hold_review_date: string | null;
  pending_handover_id: string | null; pending_to_person_id: string | null; pending_to_person: string | null; pending_to_stage: number | null; pending_since: string | null;
  open_tasks: number;
};
export type FlowStatus = "ACTIVE" | "AWAITING_ACCEPTANCE" | "ON_HOLD";
export const FLOW_LABEL: Record<FlowStatus, string> = { ACTIVE: "Active", AWAITING_ACCEPTANCE: "Awaiting acceptance", ON_HOLD: "On hold" };
/** The five phases Darren's Rev 3 groups the 17 stages into — the Board's columns (decision 2). Stages 0–2 live on the Estimation tab. */
export type Phase = "ENQUIRY" | "HANDOVER" | "DESIGN" | "PRODUCTION" | "INSTALLATION" | "COMPLETE";
export const PHASES: { key: Phase; label: string; short: string; stages: number[] }[] = [
  { key: "ENQUIRY", label: "Enquiry to allocation", short: "Allocation", stages: [3, 4] },
  { key: "HANDOVER", label: "Handover and kick-off", short: "Kick-off", stages: [5, 6, 7] },
  { key: "DESIGN", label: "Design to material readiness", short: "Design", stages: [8, 9, 10] },
  { key: "PRODUCTION", label: "Production to dispatch", short: "Production", stages: [11, 12, 13] },
  { key: "INSTALLATION", label: "Installation to closeout", short: "Installation", stages: [14, 15, 16] },
];
export const COMPLETED_STAGE = 17;
/** A row of the `stages` reference table (seeded from Rev 3; admin-editable). */
export type Stage = {
  stage_no: number; name: string; short_name: string; phase: Phase; department: string; owner_rule: "PERSON" | "ALLOCATED_PM" | "NONE";
  position: string | null; description: string | null; checklist: { key: string; text: string }[]; evidence: string | null;
  supporting: string[]; loop: string[]; attendance: string[]; retains_ball: boolean; next_stage: number | null; is_active: boolean;
};
export type StageOwner = { stage_no: number; person_id: string; set_by: string | null; set_at: string };
export type StageTarget = { stage_no: number; target_days: number | null; response_hours: number | null };
export type Handover = {
  id: string; project_id: string; from_stage: number | null; to_stage: number; from_person_id: string | null; to_person_id: string | null;
  status: "PENDING" | "ACCEPTED" | "RETURNED" | "CANCELLED" | "OVERRIDE" | "MIGRATED" | "CHECKPOINT" | "REOPENED";
  requested_at: string; requested_by: string | null; note: string | null; accepted_at: string | null; returned_at: string | null; return_reason: string | null;
  recorded_by: string | null; acceptance_evidence: string | null; evidence_time: string | null; override: boolean; authorised_by: string | null; override_reason: string | null;
};
export type Hold = { id: string; project_id: string; reason: string; waiting_on_person_id: string | null; waiting_on: string | null; required_action: string | null; action_due: string | null; blocked_since: string; review_date: string | null; created_by: string | null; released_at: string | null; released_by: string | null; release_note: string | null };
export type StageEvidence = { id: string; project_id: string; stage_no: number; item_key: string | null; done: boolean; note: string | null; file_path: string | null; file_name: string | null; link_url: string | null; by: string | null; at: string };
export type ProjectTask = { id: string; project_id: string; title: string; owner_id: string | null; due: string | null; done_at: string | null; created_by: string | null; created_at: string };
/** "in stage 12d" / "12d · target 10d" — overdue colouring only once Darren's targets are in stage_targets */
export function stageAge(p: Pick<Project, "stage_age_days" | "stage_target_days" | "stage_overdue">): { text: string; tone: Tone } {
  const d = p.stage_age_days;
  if (d == null) return { text: "", tone: "none" };
  const t = p.stage_target_days;
  return { text: t == null ? `${d}d in stage` : `${d}d / ${t}d`, tone: p.stage_overdue ? "crit" : t != null && d >= t * 0.8 ? "warn" : "none" };
}
export const phaseOf = (stage: number | null | undefined): Phase | null => stage == null ? null : stage === COMPLETED_STAGE ? "COMPLETE" : stage <= 2 ? "ENQUIRY" : (PHASES.find((ph) => ph.stages.includes(stage))?.key ?? null);
export type Person = { id: string; name: string; full_name: string | null; role: string; email: string | null; whatsapp: string | null; is_active: boolean; can_edit_estimation: boolean; can_edit_projects: boolean; can_manage_team: boolean; is_admin: boolean; notify_on_award: boolean; handles_escalations: boolean; notify_progress_invoice: boolean; notify_final_invoice: boolean; can_sign_in: boolean; position: string | null };
export const ROLE_LABEL: Record<string, string> = { PM: "Project manager", DESIGNER: "Designer", TECHNICAL_DESIGNER: "Technical designer", ESTIMATOR: "Estimator", MANAGEMENT: "Management", ADMIN: "Admin", PRODUCTION: "Production", PROJECT_COORDINATOR: "Project coordinator", PROCUREMENT: "Procurement", STORE: "Store / dispatch", ACCOUNTS: "Accounts", SALES: "Sales" };
export type Me = { id: string | null; name: string; role: string; canEstimation: boolean; canProjects: boolean; canTeam: boolean; isAdmin: boolean };
/** Who may do what on items (plan §6). Admins (Tom, Aftab, Darren, Jinky) and project editors can do everything. */
export function itemRights(me: Me) {
  const all = me.isAdmin || me.canProjects;
  const designer = me.role === "DESIGNER" || me.role === "TECHNICAL_DESIGNER";
  const production = me.role === "PRODUCTION";
  const pm = me.role === "PM" || me.role === "MANAGEMENT";
  return {
    any: all || designer || production || pm,
    items: all || designer || pm,          // add / edit / cancel items
    drawing: all || designer,              // revisions, planned submission, drawing started
    preProduction: all || production || designer, // material, measurements, issued to production
    factory: all || production,            // stages 1–3
    site: all || pm,                       // stages 4–6
  };
}
export type Contractor = { id: string; name: string };
export type Variation = { id: string; project_id: string; vo_no: number; description: string | null; value: number; approved_on: string | null; source_enquiry_id?: string | null };
// stitched on by the app from target_revisions (projects_live is not rebuilt)
export type TargetInfo = { target_rev?: number | null; target_rev0_date?: string | null; items?: ItemCounts | null };
/** Anyone tagged to be kept updated on a project, on top of the PM, second PM and designer (db/015). */
export type Watcher = { project_id: string; person_id: string; added_by: string | null; added_at: string };
export type TargetRevision = { id: number; project_id: string; rev_no: number; target_date: string | null; prev_date: string | null; reason: string | null; set_by: string | null; set_at: string; who?: { name: string } | null };
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
/** days a submitted quote can sit unanswered before the board suggests marking it dormant */
export const DORMANT_AFTER_DAYS = 30;
export const SCOPES = ["Joinery", "Metalwork", "Stonework", "Glasswork", "Other"];
/** days until a quote is due: null = no date; amber within 3 days, red when overdue */
export function dueTone(due: string | null) {
  if (!due) return null;
  const d = Math.round((new Date(due).getTime() - Date.now()) / 86400000);
  return { d, tone: d < 0 ? "crit" : d <= 3 ? "warn" : "ok" } as const;
}

// ---------- meetings ----------
export type MeetingLocation = "ROOM" | "SITE" | "ONLINE";
export const LOCATION_LABEL: Record<MeetingLocation, string> = { ROOM: "Meeting room", SITE: "On site", ONLINE: "Online" };
export type Meeting = {
  id: string; title: string; project_id: string | null; location: MeetingLocation;
  meeting_date: string; start_time: string; end_time: string; notes: string | null; cancelled: boolean;
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
  // from meetings_live
  project_name: string | null; enquiry_no: string | null; created_by_name: string | null; updated_by_name: string | null;
  attendee_ids: string[]; attendees: string[];
  // Rev 3 stage meetings (db/018): the stage this meeting serves (5 Sales handover, 7 Kick-off), whether it was held, who attended
  stage_no: number | null; held: boolean; stage_short: string | null; attended_ids: string[]; attended: string[];
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

/** Sort key for enquiry numbers so pickers run chronologically: old plain numbers (2243) first, then YY-NNN (26-024…); no number last. */
export function enqKey(no: string | null | undefined): number {
  if (!no) return Number.MAX_SAFE_INTEGER;
  const m = no.trim().match(/^(\d{2})-(\d{1,4})/);
  if (m) return (2000 + parseInt(m[1], 10)) * 10000 + parseInt(m[2], 10);
  const n = parseInt(no.replace(/\D/g, ""), 10);
  return isNaN(n) ? Number.MAX_SAFE_INTEGER - 1 : n;
}
export const byEnq = <T extends { enquiry_no: string | null; name: string }>(a: T, b: T) => enqKey(a.enquiry_no) - enqKey(b.enquiry_no) || a.name.localeCompare(b.name);

// ---------- items & production (db/014) ----------
export type DrawingStatus = "A" | "B" | "C" | "D" | "UR";
export const DRAWING_STATUS: [DrawingStatus, string][] = [
  ["A", "Approved"], ["B", "Approved with comments"], ["C", "Revise & resubmit"], ["D", "Not required / cancelled"], ["UR", "Under review"],
];
export const DRAWING_LABEL: Record<DrawingStatus, string> = Object.fromEntries(DRAWING_STATUS) as Record<DrawingStatus, string>;
export type MaterialStatus = "PENDING" | "APPROVED" | "NA";
export type ProductionStage = "JOINERY" | "PAINT" | "DELIVERY" | "INSTALL" | "STONE" | "SNAGGING";
export const PRODUCTION_STAGES: [ProductionStage, string, "factory" | "site"][] = [
  ["JOINERY", "Joinery", "factory"], ["PAINT", "Paint", "factory"], ["DELIVERY", "Delivery", "factory"],
  ["INSTALL", "Install", "site"], ["STONE", "Stone", "site"], ["SNAGGING", "Snagging", "site"],
];
export const PSTAGE_LABEL: Record<ProductionStage, string> = Object.fromEntries(PRODUCTION_STAGES.map(([k, l]) => [k, l])) as Record<ProductionStage, string>;
export type StageStatus = "NOT_STARTED" | "IN_PROGRESS" | "DELAYED" | "ON_HOLD" | "COMPLETE";
export const STAGE_STATUS: [StageStatus, string][] = [["NOT_STARTED", "Not started"], ["IN_PROGRESS", "In progress"], ["DELAYED", "Delayed"], ["ON_HOLD", "On hold"], ["COMPLETE", "Complete"]];
export const STAGE_STATUS_LABEL: Record<StageStatus, string> = Object.fromEntries(STAGE_STATUS) as Record<StageStatus, string>;

/** One field drives the colours: derived in the database from the drawing state and the six production stages. */
export type ItemStage = "NOT_STARTED" | "DRAWING" | "SUBMITTED" | "APPROVED" | "ISSUED" | ProductionStage | "COMPLETE" | "CANCELLED";
export const ITEM_STAGES: [ItemStage, string][] = [
  ["NOT_STARTED", "Not started"], ["DRAWING", "Drawing"], ["SUBMITTED", "With client"], ["APPROVED", "Approved"], ["ISSUED", "Issued"],
  ...PRODUCTION_STAGES.map(([k, l]) => [k, l] as [ItemStage, string]), ["COMPLETE", "Complete"], ["CANCELLED", "Cancelled"],
];
export const ITEM_STAGE_LABEL: Record<ItemStage, string> = Object.fromEntries(ITEM_STAGES) as Record<ItemStage, string>;
export const ITEM_STAGE_ORDER: Record<ItemStage, number> = Object.fromEntries(ITEM_STAGES.map(([k], i) => [k, i])) as Record<ItemStage, number>;

export type ItemType = { id: string; name: string; code_letter: string; sort_order: number; is_active: boolean };
export type Item = {
  id: string; project_id: string; type_id: string; code_letter: string; seq: number; name: string; area: string | null;
  designer_id: string | null; drawing_started_date: string | null; planned_submission: string | null;
  current_revision: number | null; current_status: DrawingStatus | null; material_approval: MaterialStatus;
  measurements_date: string | null; issued_date: string | null; notes: string | null; cancelled: boolean; sort_order: number;
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
  // from items_live
  item_code: string; drawing_code: string; drawing_code_rev: string; type_name: string;
  project_name: string; enquiry_no: string | null; project_status: Status; client: string | null; project_deleted_at: string | null;
  pm_id: string | null; pm: string | null; designer: string | null;
  stage: ItemStage; last_submitted: string | null; last_returned: string | null;
  slipping: boolean; earliest_slip: string | null; submission_overdue: boolean; client_overdue: boolean; past_r3: boolean;
};
export type ItemRevision = { id: string; item_id: string; rev_no: number; submitted_date: string | null; returned_date: string | null; status: DrawingStatus | null; comments: string | null; created_by: string | null; created_at: string };
export type ItemProductionStage = { id: string; item_id: string; stage_no: number; stage: ProductionStage; planned_start: string | null; planned_end: string | null; actual_start: string | null; actual_end: string | null; status: StageStatus; na: boolean; notes: string | null; updated_by: string | null; updated_at: string };
export type ItemCounts = { items_total: number; items_approved: number; items_in_production: number; items_on_site: number; items_complete: number; items_attention: number; earliest_slip: string | null };

/** What needs someone's attention on an item, in priority order. Empty = fine. */
export function itemFlags(i: Item): { text: string; tone: Tone }[] {
  const f: { text: string; tone: Tone }[] = [];
  if (i.cancelled) return f;
  if (i.current_status === "C") f.push({ text: "Revise & resubmit", tone: "crit" });
  if (i.current_status === "D") f.push({ text: "Not required", tone: "none" });
  if (i.submission_overdue) f.push({ text: `R0 overdue ${fmtDShort(i.planned_submission)}`, tone: "crit" });
  if (i.client_overdue) f.push({ text: `With client since ${fmtDShort(i.last_submitted)}`, tone: "warn" });
  if (i.slipping) f.push({ text: `Slipping since ${fmtDShort(i.earliest_slip)}`, tone: "crit" });
  if (i.past_r3) f.push({ text: `R${i.current_revision} — problem drawing`, tone: "warn" });
  return f;
}
/** Tone for the stage chip */
export function itemTone(i: Pick<Item, "stage" | "cancelled" | "current_status" | "slipping" | "submission_overdue" | "client_overdue">): Tone {
  if (i.cancelled || i.stage === "CANCELLED") return "none";
  if (i.stage === "COMPLETE") return "done";
  if (i.current_status === "C" || i.slipping || i.submission_overdue) return "crit";
  if (i.client_overdue) return "warn";
  if (i.stage === "NOT_STARTED") return "none";
  if (i.stage === "SUBMITTED") return "soon";
  return "ok";
}
export const revLabel = (n: number | null | undefined) => n == null ? "—" : `R${n}`;

/** A project a VO enquiry can point at: live first, then completed (a won VO reopens a completed card — db/022). */
export type ParentOption = { id: string; name: string; enquiry_no: string | null; client?: string | null; completed?: boolean };
