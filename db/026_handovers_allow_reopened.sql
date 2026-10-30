-- 026 — db/022 added the REOPENED handover kind (a won VO reopens its completed parent) but never widened the
-- status check constraint, so every "Won → add VO" on a completed parent failed with handovers_status_check.
-- Found by Tom on the Yolanda VO (26-117), 30 Oct. Applied live as scheduler_026_handovers_allow_reopened.
alter table scheduler.handovers drop constraint handovers_status_check;
alter table scheduler.handovers add constraint handovers_status_check
  check (status = any (array['PENDING','ACCEPTED','RETURNED','CANCELLED','OVERRIDE','MIGRATED','CHECKPOINT','REOPENED']));
