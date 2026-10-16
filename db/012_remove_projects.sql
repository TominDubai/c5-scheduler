-- 012: Remove (soft-delete) projects — asked for 16 Oct 2026 ("wanted to delete some cards").
-- A removed project keeps its row, VOs, status history and change log; it just carries deleted_at and
-- disappears from the Board, List, Estimation and Dashboard. It can be restored from the List ("Removed" view).
-- Only people with can_manage_team (Tom, Darren, Jinky) may remove or restore. A reason is required.
-- projects_live is NOT rebuilt (p.* was fixed at creation); the app reads deleted_* straight from projects.
set search_path = scheduler, public;

alter table projects
  add column if not exists deleted_at     timestamptz,
  add column if not exists deleted_by     uuid references people(id),
  add column if not exists deleted_reason text;
create index if not exists projects_deleted on projects(deleted_at) where deleted_at is not null;

-- guard: only team managers may set/clear deleted_at; a reason is required; stamp who did it
create or replace function guard_project_removal() returns trigger language plpgsql set search_path = scheduler, public as $$
begin
  if new.deleted_at is distinct from old.deleted_at then
    if auth.role() = 'authenticated' and not coalesce((me()).can_manage_team, false) then
      raise exception 'Only Tom, Darren or Jinky can remove or restore a project';
    end if;
    if new.deleted_at is not null then
      if coalesce(trim(new.deleted_reason), '') = '' then raise exception 'Give a reason for removing the project'; end if;
      new.deleted_by := coalesce(current_person_id(), new.deleted_by);
    else
      new.deleted_by := null; new.deleted_reason := null;
    end if;
  elsif new.deleted_at is not null and (new.deleted_reason is distinct from old.deleted_reason or new.deleted_by is distinct from old.deleted_by) then
    -- don't let the reason/by be edited sideways
    new.deleted_reason := old.deleted_reason; new.deleted_by := old.deleted_by;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_project_removal on projects;
create trigger trg_guard_project_removal before update on projects for each row execute function guard_project_removal();

-- change log: removal / restore show up in the 10-minute digest to the project's PM and designer
create or replace function log_project_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
begin
  if tg_op = 'INSERT' then
    insert into change_log(project_id, kind, changed_by) values (new.id, 'created', who);
    return null;
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if new.deleted_at is not null then
      insert into change_log(project_id, kind, new_value, changed_by) values (new.id, 'removed', new.deleted_reason, who);
    else
      insert into change_log(project_id, kind, changed_by) values (new.id, 'restored', who);
    end if;
    return null; -- nothing else on this save matters
  end if;
  if new.name is distinct from old.name then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'name', old.name, new.name, who); end if;
  if new.client is distinct from old.client then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'client', old.client, new.client, who); end if;
  if new.enquiry_no is distinct from old.enquiry_no then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'enquiry_no', old.enquiry_no, new.enquiry_no, who); end if;
  if new.status is distinct from old.status then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'status', old.status::text, new.status::text, who); end if;
  if new.quote_stage is distinct from old.quote_stage then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'quote_stage', old.quote_stage::text, new.quote_stage::text, who); end if;
  if new.pm_id is distinct from old.pm_id then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'pm_id', person_name(old.pm_id), person_name(new.pm_id), who); end if;
  if new.pm2_id is distinct from old.pm2_id then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'pm2_id', person_name(old.pm2_id), person_name(new.pm2_id), who); end if;
  if new.designer_id is distinct from old.designer_id then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'designer_id', person_name(old.designer_id), person_name(new.designer_id), who); end if;
  if new.estimator_id is distinct from old.estimator_id then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'estimator_id', person_name(old.estimator_id), person_name(new.estimator_id), who); end if;
  if new.contractor_id is distinct from old.contractor_id then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'contractor_id', contractor_name(old.contractor_id), contractor_name(new.contractor_id), who); end if;
  if new.start_date is distinct from old.start_date then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'start_date', old.start_date::text, new.start_date::text, who); end if;
  if new.target_date is distinct from old.target_date then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'target_date', old.target_date::text, new.target_date::text, who); end if;
  if new.completed_date is distinct from old.completed_date then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'completed_date', old.completed_date::text, new.completed_date::text, who); end if;
  if new.quote_due_date is distinct from old.quote_due_date then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'quote_due_date', old.quote_due_date::text, new.quote_due_date::text, who); end if;
  if new.signed_quote is distinct from old.signed_quote then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'signed_quote', old.signed_quote::text, new.signed_quote::text, who); end if;
  if new.quoted_value is distinct from old.quoted_value then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.id, 'field', 'quoted_value', old.quoted_value::text, new.quoted_value::text, who); end if;
  return null;
end $$;
