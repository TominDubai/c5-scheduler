-- 019: log planned-date moves on production stages (the schedule's drag-to-move) to change_log, so the stage
-- owner hears about it in the 10-minute digest. Applied live 28 Oct 2026 via execute_sql.
set search_path = scheduler, public;
create or replace function log_stage_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
  i items;
  span text;
begin
  if new.status is distinct from old.status or new.planned_start is distinct from old.planned_start or new.planned_end is distinct from old.planned_end then
    select * into i from items where id = new.item_id;
  end if;
  if new.status is distinct from old.status then
    insert into change_log(project_id, item_id, kind, field, old_value, new_value, changed_by)
    values (i.project_id, i.id, 'item_stage', item_label(i) || ' · ' || initcap(new.stage::text), old.status::text, new.status::text, who);
  end if;
  if new.planned_start is distinct from old.planned_start or new.planned_end is distinct from old.planned_end then
    span := coalesce(to_char(new.planned_start, 'DD Mon'), '?') || ' – ' || coalesce(to_char(new.planned_end, 'DD Mon'), '?');
    insert into change_log(project_id, item_id, kind, field, old_value, new_value, changed_by)
    values (i.project_id, i.id, 'item_stage_dates', item_label(i) || ' · ' || initcap(new.stage::text),
            coalesce(to_char(old.planned_start, 'DD Mon'), '?') || ' – ' || coalesce(to_char(old.planned_end, 'DD Mon'), '?'), span, who);
  end if;
  return null;
end $$;
