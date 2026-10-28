-- 015: Who gets told what, and when (asked for 21 Oct 2026).
--
-- Two gaps this closes:
--  1. When a quote is won nobody is reliably told. The email list for a project is PM / 2nd PM /
--     designer, and at the moment of award none of them are assigned yet, so the only person who
--     heard was Aftab, hard-coded in notify.ts on 12 Oct. CD management now get a "project signed"
--     email: Basim, Aftab, Jinky, Darren, Tom — held as a flag on the person, not names in code,
--     so the Team page maintains it when someone joins or leaves.
--  2. Only the PM and designer could be kept in the loop. Jinky can now tag anyone else on the
--     project; that list plus PM / 2nd PM / designer is exactly who receives the update emails.
set search_path = scheduler, public;

alter table people add column if not exists notify_on_award boolean not null default false;
update people set notify_on_award = true where name in ('BASIM','AFTAB','JINKY','DARREN','TOM','TOM-BOLSOVER');

create table if not exists project_watchers (
  project_id  uuid not null references projects(id) on delete cascade,
  person_id   uuid not null references people(id)   on delete cascade,
  added_by    uuid references people(id),
  added_at    timestamptz not null default now(),
  primary key (project_id, person_id)
);
create index if not exists project_watchers_person on project_watchers(person_id);

create or replace function stamp_watcher() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  new.added_by := coalesce(new.added_by, current_person_id());
  return new;
end $$;
create trigger trg_stamp_watcher before insert on project_watchers for each row execute function stamp_watcher();

-- tagging someone rides the normal 10-minute digest, so they find out they're on it
create or replace function log_watcher_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
begin
  if tg_op = 'INSERT' then
    insert into change_log(project_id, kind, field, new_value, changed_by)
    values (new.project_id, 'watcher_added', 'watcher', person_name(new.person_id), who);
    return null;
  end if;
  if not exists (select 1 from projects p where p.id = old.project_id) then return null; end if;  -- project deleted
  insert into change_log(project_id, kind, field, old_value, changed_by)
  values (old.project_id, 'watcher_removed', 'watcher', person_name(old.person_id), who);
  return null;
end $$;
create trigger trg_watcher_change_log after insert or delete on project_watchers for each row execute function log_watcher_changes();

alter table project_watchers enable row level security;
create policy read_all on project_watchers for select to authenticated using (true);
create policy write_team on project_watchers for all to authenticated
  using (current_person_id() is not null) with check (current_person_id() is not null);
grant all on project_watchers to authenticated, service_role;
