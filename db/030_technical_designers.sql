-- 030: More than one technical designer per project (Haydee, 31 Oct 2026).
--
-- Most projects have one to three draftsmen on them at once. projects.technical_designer_id stays as the
-- LEAD technical designer (stage 9's "allocated" tick, the team strip warning, the meeting must-attend list all
-- keep reading it). The others go here, same shape as project_watchers (db/015): rows, not names in code,
-- logged to change_log so the person hears in their next digest, and they receive the project's update emails.
set search_path = scheduler, public;

create table if not exists project_technical_designers (
  project_id uuid not null references projects(id) on delete cascade,
  person_id  uuid not null references people(id),
  added_by   uuid references people(id),
  added_at   timestamptz not null default now(),
  primary key (project_id, person_id)
);
create index if not exists project_technical_designers_person on project_technical_designers(person_id);

create or replace function stamp_tech_designer() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  new.added_by := coalesce(new.added_by, current_person_id());
  return new;
end $$;
drop trigger if exists trg_stamp_tech_designer on project_technical_designers;
create trigger trg_stamp_tech_designer before insert on project_technical_designers for each row execute function stamp_tech_designer();

create or replace function log_tech_designer_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
begin
  if tg_op = 'INSERT' then
    insert into change_log(project_id, kind, field, new_value, changed_by)
    values (new.project_id, 'tech_designer_added', 'technical_designer', person_name(new.person_id), who);
    return null;
  end if;
  if not exists (select 1 from projects p where p.id = old.project_id) then return null; end if;  -- project deleted
  insert into change_log(project_id, kind, field, old_value, changed_by)
  values (old.project_id, 'tech_designer_removed', 'technical_designer', person_name(old.person_id), who);
  return null;
end $$;
drop trigger if exists trg_tech_designer_change_log on project_technical_designers;
create trigger trg_tech_designer_change_log after insert or delete on project_technical_designers for each row execute function log_tech_designer_changes();

alter table project_technical_designers enable row level security;
drop policy if exists read_all on project_technical_designers;
create policy read_all on project_technical_designers for select to authenticated using (true);
drop policy if exists write_team on project_technical_designers;
create policy write_team on project_technical_designers for all to authenticated
  using (current_person_id() is not null) with check (current_person_id() is not null);
grant all on project_technical_designers to authenticated, service_role;
