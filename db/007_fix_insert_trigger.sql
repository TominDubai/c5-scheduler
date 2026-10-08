-- Bug: trg_project_status was BEFORE INSERT and wrote status_history before the project row existed (FK failure)
-- => every new enquiry/project insert failed. Split into BEFORE (updates) + AFTER INSERT (first history row).
set search_path = scheduler, public;
create or replace function log_status_change() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into status_history(project_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, current_person_id());
  end if;
  if new.status = 'COMPLETED' and new.completed_date is null then new.completed_date := current_date; end if;
  new.updated_at := now();
  return new;
end $$;
create or replace function log_status_insert() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  insert into status_history(project_id, from_status, to_status, changed_by) values (new.id, null, new.status, current_person_id());
  return null;
end $$;
create trigger trg_project_status_insert after insert on projects for each row execute function log_status_insert();
