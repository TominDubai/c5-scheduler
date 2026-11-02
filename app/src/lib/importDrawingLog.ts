import * as XLSX from "xlsx";

/**
 * Reads a designer's per-project Excel — the Shop Drawing Log or the Material Log (Jinky's 26-024 sample, 2 Nov 2026) —
 * by header NAME, not column position, so the sheet can be rearranged without breaking the import.
 * The header row is wherever "Drawing Number" and "Drawing Title" both appear. Rows run until the drawing-number
 * column has been empty for five rows in a row. Everything comes back as plain strings / ISO dates; the database
 * function import_drawing_log() does the matching and writing.
 */
export type ImportRevision = { rev: number; submitted: string | null; returned: string | null; status: string | null };
export type ImportRow = {
  drawing_no: string; type: string | null; title: string | null; boq_ref: string | null; drawn_by: string | null;
  planned_submission: string | null; measurements: string | null; release: string | null; delivery: string | null; installation: string | null;
  remarks: string | null; materials: string | null; revisions: ImportRevision[];
  latest_rev: string | null; latest_status: string | null;
};
export type ImportParse = { mode: "drawings" | "materials"; sheet: string; project_line: string | null; rows: ImportRow[]; warnings: string[] };

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const MATERIAL_COLS: [string, string][] = [
  ["shutters", "Shutters / external"], ["carcase", "Carcase / internal"], ["skirting", "Skirting"], ["stone", "Stone"], ["metal", "Metal"],
  ["glass", "Glass / mirror"], ["fabric", "Fabric / leather"], ["handles", "Handles"], ["others", "Hinges / others"], ["lighting", "Lighting"], ["appliances", "Appliances & accessories"],
];

function toISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/);           // 17-Oct-26
  if (m) { const mo = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m[2].toLowerCase()); if (mo >= 0) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`; } }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);                    // 17/10/2026 (day first — Dubai)
  if (m2) { const y = m2[3].length === 2 ? 2000 + Number(m2[3]) : Number(m2[3]); return `${y}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`; }
  const m3 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m3 ? `${m3[1]}-${m3[2]}-${m3[3]}` : null;
}
const txt = (v: unknown) => { const s = String(v ?? "").replace(/\s*\n\s*/g, " / ").trim(); return s === "" || s === "0" ? null : s; };

export function parseDrawingLog(buf: ArrayBuffer | Buffer): ImportParse {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });   // raw serials → parse_date_code; cellDates shifts a day in UTC
  const warnings: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    // find the header row
    let hr = -1;
    for (let r = 0; r < Math.min(grid.length, 60); r++) {
      const cells = (grid[r] ?? []).map(norm);
      if (cells.some((c) => c === "drawing number" || c === "drawing no." || c === "drawing no") && cells.some((c) => c.startsWith("drawing title") || c === "drawing code and title")) { hr = r; break; }
    }
    if (hr < 0) continue;
    const head = (grid[hr] ?? []).map(norm);
    const col = (...names: string[]) => { for (const n of names) { const i = head.findIndex((h) => h === n || h.startsWith(n)); if (i >= 0) return i; } return -1; };
    const cNo = col("drawing number", "drawing no"), cTitle = col("drawing title", "drawing code and title");
    const cType = col("type"), cBoq = col("boq ref"), cBy = col("drawn by"), cPlan = col("planned submission"), cRev = col("revision"), cStatus = col("status");
    const cMeas = col("final measurements"), cRel = col("production release"), cDel = col("delivery date"), cInst = col("installation date"), cRem = col("remarks");
    const matCols = MATERIAL_COLS.map(([k, label]) => [col(k), label] as const).filter(([i]) => i >= 0);
    const mode: ImportParse["mode"] = matCols.length >= 4 && cPlan < 0 ? "materials" : "drawings";
    const revCols: { rev: number; sub: number; ret: number; st: number }[] = [];
    for (let n = 0; n <= 9; n++) { const sub = col(`r${n} submitted`); if (sub < 0) continue; revCols.push({ rev: n, sub, ret: col(`r${n} returned`), st: col(`r${n} status`) }); }
    // project line, if the sheet has one above the header
    let project_line: string | null = null;
    for (let r = 0; r < hr; r++) { const row = grid[r] ?? []; const i = row.findIndex((c) => norm(c) === "project:" || norm(c) === "project"); if (i >= 0 && row[i + 1]) { project_line = String(row[i + 1]).trim(); break; } }

    const rows: ImportRow[] = [];
    let blank = 0;
    for (let r = hr + 1; r < grid.length && blank < 5; r++) {
      const row = grid[r] ?? [];
      const dn = txt(row[cNo]);
      if (!dn) { blank++; continue; }
      blank = 0;
      const title = cTitle >= 0 ? txt(row[cTitle]) : null;
      const revisions: ImportRevision[] = revCols.map((c) => ({ rev: c.rev, submitted: toISO(row[c.sub]), returned: c.ret >= 0 ? toISO(row[c.ret]) : null, status: c.st >= 0 ? txt(row[c.st])?.toUpperCase() ?? null : null })).filter((x) => x.submitted);
      const materials = matCols.length ? matCols.map(([i, label]) => { const v = txt(row[i]); return v ? `${label}: ${v}` : null; }).filter(Boolean).join("\n") || null : null;
      rows.push({
        drawing_no: dn.toUpperCase().replace(/\s+/g, ""), type: cType >= 0 ? txt(row[cType]) : null, title: mode === "materials" ? null : title,
        boq_ref: cBoq >= 0 ? txt(row[cBoq]) : null, drawn_by: cBy >= 0 ? txt(row[cBy]) : null,
        planned_submission: cPlan >= 0 ? toISO(row[cPlan]) : null, measurements: cMeas >= 0 ? toISO(row[cMeas]) : null, release: cRel >= 0 ? toISO(row[cRel]) : null,
        delivery: cDel >= 0 ? toISO(row[cDel]) : null, installation: cInst >= 0 ? toISO(row[cInst]) : null, remarks: cRem >= 0 ? txt(row[cRem]) : null,
        materials, revisions, latest_rev: cRev >= 0 ? txt(row[cRev]) : null, latest_status: cStatus >= 0 ? txt(row[cStatus]) : null,
      });
    }
    if (mode === "drawings" && revCols.length === 0) warnings.push("No R0 / R1 … columns found — revisions won't be imported from this sheet.");
    if (mode === "drawings" && cPlan < 0) warnings.push("No “Planned Submission” column found.");
    return { mode, sheet: name, project_line, rows, warnings };
  }
  throw new Error("Couldn't find a header row with “Drawing Number” and “Drawing Title” on any sheet. Is this the Shop Drawing Log or the Material Log?");
}
