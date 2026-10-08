"""Estimation-Tracker.xlsx (Ramus's pricing pipeline) -> SQL for scheduler.projects.

Usage: python import_estimation_tracker.py Estimation-Tracker.xlsx > estimation_tracker.sql
Then run the SQL against the c5-os Supabase project (scheduler schema).

Mapping (tracker column -> projects column)
  Ref ENQ-26-001 -> enquiry_no '26-001'      Client (who sent it) -> contractor_id (DIR = DIRECT)
  End User -> client                          Location -> name (falls back to end user)
  Scope -> scope        Quote Type -> quote_type        Status -> quote_stage
  Waiting On -> waiting_on   Pending From -> pending_from   Estimator -> estimator_id (GIORG = GEORGIE)
  Received / Due / Submitted -> received_date / quote_due_date / quote_submitted_date
  Folder -> folder_path      Notes -> notes
Rows that are already in the project tracker are UPDATED (see MATCH), everything else is inserted with status QUOTE.
"""
import sys, datetime as dt
import openpyxl

STAGE = {"Queue": "QUEUED", "Pricing": "PRICING", "Waiting": "AWAITING_SUPPLIER", "Submitted": "SUBMITTED", "On Hold": "ON_HOLD"}
CONTRACTOR = {"DIR": "DIRECT", "ROMARA": "ROMARA (OLD LCI)"}
ESTIMATOR = {"GIORG": "GEORGIE"}
# (end user, location) in the tracker -> enquiry_no already in scheduler.projects
MATCH = {("DR. JOY", "JI C28 V13"): "26-095", ("MONTROSE", "FTR D58"): "2324", ("GHOBASH", "TWIN VILLA"): "26-009"}
# test rows left in the tracker
SKIP = {"TEST - DELETE ME", "NAME", "THE ADDRESS"}

def q(v):
    if v is None or v == "": return "null"
    if isinstance(v, (dt.date, dt.datetime)): return f"'{v.date() if isinstance(v, dt.datetime) else v}'"
    return "'" + str(v).strip().replace("'", "''") + "'"

def main(path):
    ws = openpyxl.load_workbook(path, data_only=True)["Pipeline"]
    rows = [r for r in ws.iter_rows(min_row=2, values_only=True) if any(c is not None for c in r)]
    out = ["set search_path = scheduler, public;", "begin;"]
    for (ref, client, end_user, loc, scope, qtype, status, waiting, pending, est, received, due, submitted, folder, notes) in rows:
        status = (status or "Queue").strip()
        if status in ("Won", "Lost"): continue  # not live; handled in the project tracker
        if (end_user or "").strip().upper() in SKIP or (loc or "").strip().upper() in SKIP: continue
        enq = ref.replace("ENQ-", "") if ref else None
        contractor = CONTRACTOR.get((client or "").strip(), (client or "").strip()) or None
        estimator = ESTIMATOR.get((est or "").strip(), (est or "").strip()) or None
        name = (loc or end_user or client or "UNNAMED").strip().upper()
        if not loc and qtype: name = f"{name} ({qtype.strip().upper()})"
        vals = {
            "client": q((end_user or "").upper() or None), "scope": q(scope), "quote_type": q(qtype),
            "quote_stage": f"'{STAGE[status]}'", "waiting_on": q(waiting), "pending_from": q((pending or "").upper() or None),
            "received_date": q(received), "quote_due_date": q(due), "quote_submitted_date": q(submitted),
            "folder_path": q(folder if not folder or ":" in folder else "Z:\\3_PROJECTS\\" + folder.strip()), "notes": q(notes),
            "contractor_id": f"(select id from contractors where name = {q(contractor)})" if contractor else "null",
            "estimator_id": f"(select id from people where name = {q(estimator)})" if estimator else "null",
        }
        key = MATCH.get(((end_user or "").strip(), (loc or "").strip()))
        if key:
            sets = ", ".join(f"{k} = coalesce({v}, {k})" for k, v in vals.items() if k != "quote_stage") + f", quote_stage = {vals['quote_stage']}"
            out.append(f"update projects set {sets} where enquiry_no = '{key}';")
        else:
            cols = ["enquiry_no", "name", "status"] + list(vals)
            v = [q(enq), q(name), "'QUOTE'"] + list(vals.values())
            out.append(f"insert into projects ({', '.join(cols)}) values ({', '.join(v)});")
    out.append("commit;")
    print("\n".join(out))

if __name__ == "__main__":
    main(sys.argv[1])
