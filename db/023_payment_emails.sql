-- 023 (30 Oct 2026): payment emails. Team comments round 1, page 4 (Jinky).
-- Reaching stage 14 Installation → Jean raises the progress invoice (45%).
-- Reaching Completed            → Jean raises the final invoice; Veronica closes out supplier payments.
-- Tom, Aftab, Jinky, Darren and Basim are copied on both.
-- Who hears is a flag on the person (Team page, "Also emailed about"), never a name in code —
-- same pattern as notify_on_award (db/015) and handles_escalations (db/017).
set search_path = scheduler, public;

alter table people add column if not exists notify_progress_invoice boolean not null default false;
alter table people add column if not exists notify_final_invoice    boolean not null default false;
update people set notify_progress_invoice = true, notify_final_invoice = true
  where name in ('JEAN','HR','TOM','TOM-BOLSOVER','AFTAB','JINKY','DARREN','BASIM');
update people set notify_final_invoice = true where name = 'VERONICA';

-- One change_log row per event; notify.ts words it and adds the flagged people. Fires on the first
-- arrival at the stage (going back and forward again would fire again — that is a real event too).
create or replace function log_payment_events() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare who uuid := current_person_id();
begin
  if new.stage is distinct from old.stage then
    if new.stage = 14 and coalesce(old.stage, 0) < 14 then
      insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
      values (new.id, 'payment_progress', 'stage', (select name from stages where stage_no = old.stage), 'Installation', who);
    elsif new.stage = 17 then
      insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
      values (new.id, 'payment_final', 'stage', (select name from stages where stage_no = old.stage), 'Completed', who);
    end if;
  end if;
  return null;
end $$;
create or replace trigger trg_payment_events after update of stage on projects for each row execute function log_payment_events();
