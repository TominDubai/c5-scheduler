-- 008: change log for batched email notifications
-- Every significant change to a project (or its VOs) is written here by trigger.
-- A job every 10 minutes (pg_cron -> POST /api/notify) groups the unsent rows per person and emails one digest.
-- Saving a project without changing anything significant logs nothing, so repeated saves do not spam.
set search_path = scheduler, public;

create table if not exists change_log (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references projects(id) on delete cascade,
  kind        text not null,              -- created | field | vo_added | vo_changed | vo_removed
  field       text,                       -- column name for kind = field
  old_value   text,                       -- human-readable (names, labels), not ids
  new_value   text,
  changed_by  uuid references people(id),
  changed_at  timestamptz not null default now(),
  notified_at timestamptz                 -- null = not yet emailed
);
create index if not exists change_log_unsent on change_log(changed_at) where notified_at is null;

alter table change_log enable row level security;
create policy read_all on change_log for select to authenticated using (true);
-- no insert/update policies: rows are written only by the security-definer triggers below,
-- and marked notified by the service role from /api/notify.

-- ---------- helpers ----------
create or replace function person_name(p uuid) returns text language sql stable set search_path = scheduler, public as $$
  select name from people where id = p
$$;
create or replace function contractor_name(c uuid) returns text language sql stable set search_path = scheduler, public as $$
  select name from contractors where id = c
$$;

-- ---------- projects ----------
create or replace function log_project_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
begin
  if tg_op = 'INSERT' then
    insert into change_log(project_id, kind, changed_by) values (new.id, 'created', who);
    return null;
  end if;

  -- one row per significant field that actually changed
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
  -- not logged on purpose: notes, difficulty, folder_path, scope, quote_type, waiting_on, raised_by, received_date, technical_designer_id
  return null;
end $$;

drop trigger if exists trg_project_change_log on projects;
create trigger trg_project_change_log after insert or update on projects
  for each row execute function log_project_changes();

-- ---------- variations ----------
create or replace function log_variation_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
  label text;
begin
  if tg_op = 'DELETE' then
    insert into change_log(project_id, kind, field, old_value, changed_by)
    values (old.project_id, 'vo_removed', 'VO' || old.vo_no, coalesce(old.description,'') || ' | ' || old.value::text, who);
    return null;
  end if;
  label := coalesce(new.description,'') || ' | ' || new.value::text;
  if tg_op = 'INSERT' then
    insert into change_log(project_id, kind, field, new_value, changed_by) values (new.project_id, 'vo_added', 'VO' || new.vo_no, label, who);
  elsif new.value is distinct from old.value or new.description is distinct from old.description or new.approved_on is distinct from old.approved_on then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
    values (new.project_id, 'vo_changed', 'VO' || new.vo_no, coalesce(old.description,'') || ' | ' || old.value::text, label, who);
  end if;
  return null;
end $$;

drop trigger if exists trg_variation_change_log on variations;
create trigger trg_variation_change_log after insert or update or delete on variations
  for each row execute function log_variation_changes();

-- ---------- the 10-minute job ----------
-- pg_cron calls the app, which does the grouping and sends the emails via Resend.
-- The shared secret lives in Supabase Vault (name: scheduler_notify_secret) and in Vercel as NOTIFY_SECRET.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'scheduler-notify';
select cron.schedule(
  'scheduler-notify',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url     := 'https://c5-scheduler.vercel.app/api/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_notify_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);
