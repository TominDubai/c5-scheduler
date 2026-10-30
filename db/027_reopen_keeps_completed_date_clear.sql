-- 027 (30 Oct): reopening a completed parent (db/022) cleared completed_date, but log_status_change (db/007)
-- runs before sync_stage_status, saw status still = COMPLETED and re-stamped today's date. Only stamp when the
-- status is actually arriving at COMPLETED. Then clear the date on the one card it hit (26-117, reopened today).
-- Applied live as scheduler_027_reopen_keeps_completed_date_clear.
set search_path = scheduler, public;
create or replace function log_status_change() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into status_history(project_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, current_person_id());
  end if;
  if new.status = 'COMPLETED' and new.completed_date is null and (tg_op = 'INSERT' or old.status is distinct from 'COMPLETED') then
    new.completed_date := current_date;
  end if;
  new.updated_at := now();
  return new;
end $$;
update projects set completed_date = null where reopened_vo_no is not null and stage <> 17 and completed_date = current_date;
