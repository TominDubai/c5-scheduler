-- 017: Daily reminders (Workflow Rev 3 plan, step 4).
-- Runs at 07:30 Dubai from the existing scheduler-meetings-today cron job (db/010), which now also POSTs reminders.
-- Nothing here changes the data model of projects; it adds the knobs the reminder run reads.

set search_path = scheduler, public;

-- Thresholds live in alert_settings so Darren's numbers are a data change, not a deploy.
-- threshold for W1 is HOURS (the column is "days" for the item rules); the label says so.
insert into alert_settings(rule, label, threshold) values
  ('W1', 'Handover not accepted after N hours — remind the acceptor and the coordinator', 24),
  ('W2', 'Hold past its review date — remind the ball holder and the coordinator', 0),
  ('W3', 'Next action overdue — remind its owner', 0),
  ('W4', 'Stage overdue (per stage_targets) — remind the ball holder', 0)
on conflict (rule) do nothing;

-- Who gets the escalation when an acceptance sits past the stage's agreed response time (Rev 3: Jinky).
-- A flag on the person, maintained on the Team page — never a name in code.
alter table people add column if not exists handles_escalations boolean not null default false;
update people set handles_escalations = true where name = 'JINKY';

-- The Team page may edit this flag like notify_on_award (it is not a permission, so it is not protected by trg_protect_people_flags).
