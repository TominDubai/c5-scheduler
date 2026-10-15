-- 010: Meetings — one shared diary for the Concept 5 meeting room and site meetings (15 Oct 2026).
-- Decisions: everybody enters their own meetings and anybody can edit any meeting; the meeting room is the only
-- bookable space (hard no-overlap rule, enforced here); everything else is "on site", details in the notes.
set search_path = scheduler, public;

create extension if not exists btree_gist with schema extensions;

create type meeting_location as enum ('ROOM', 'SITE');

create table meetings (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  project_id    uuid references projects(id) on delete set null,
  location      meeting_location not null default 'ROOM',
  meeting_date  date not null,
  start_time    time not null,
  end_time      time not null,
  notes         text,
  cancelled     boolean not null default false,
  created_by    uuid references people(id),
  updated_by    uuid references people(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint meeting_times check (end_time > start_time),
  -- the meeting room cannot be double-booked: two live ROOM meetings on the same day may not overlap in time
  constraint room_no_overlap exclude using gist (
    meeting_date with =,
    tsrange(meeting_date + start_time, meeting_date + end_time) with &&
  ) where (location = 'ROOM' and not cancelled)
);
create index on meetings(meeting_date);
create index on meetings(project_id);

create table meeting_attendees (
  meeting_id  uuid not null references meetings(id) on delete cascade,
  person_id   uuid not null references people(id) on delete cascade,
  primary key (meeting_id, person_id)
);

-- stamp who made the change
create or replace function stamp_meeting() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, current_person_id()); end if;
  new.updated_by := current_person_id();
  new.updated_at := now();
  return new;
end $$;
create trigger trg_meeting_stamp before insert or update on meetings for each row execute function stamp_meeting();

-- ---------- security: anyone on the team list can read and write any meeting ----------
alter table meetings enable row level security;
alter table meeting_attendees enable row level security;
create policy read_all on meetings for select to authenticated using (true);
create policy read_all on meeting_attendees for select to authenticated using (true);
create policy write_team on meetings for all to authenticated
  using (current_person_id() is not null) with check (current_person_id() is not null);
create policy write_team on meeting_attendees for all to authenticated
  using (current_person_id() is not null) with check (current_person_id() is not null);
grant all on meetings, meeting_attendees to authenticated, service_role;

-- ---------- the diary view ----------
create view meetings_live as
select
  m.*,
  p.name as project_name, p.enquiry_no,
  cb.name as created_by_name, ub.name as updated_by_name,
  coalesce((select array_agg(a.person_id order by pp.name) from meeting_attendees a join people pp on pp.id = a.person_id where a.meeting_id = m.id), '{}'::uuid[]) as attendee_ids,
  coalesce((select array_agg(pp.name order by pp.name) from meeting_attendees a join people pp on pp.id = a.person_id where a.meeting_id = m.id), '{}'::text[]) as attendees
from meetings m
left join projects p on p.id = m.project_id
left join people cb on cb.id = m.created_by
left join people ub on ub.id = m.updated_by;
grant select on meetings_live to authenticated, service_role;

-- ---------- change log: meetings feed the same 10-minute digest as projects ----------
alter table change_log alter column project_id drop not null;
alter table change_log add column meeting_id uuid references meetings(id) on delete cascade;
alter table change_log add constraint change_log_target check (project_id is not null or meeting_id is not null);
create index change_log_meeting on change_log(meeting_id) where meeting_id is not null;

create or replace function meeting_when(d date, s time, e time) returns text language sql immutable as $$
  select to_char(d, 'Dy DD Mon') || ' ' || to_char(s, 'HH24:MI') || '–' || to_char(e, 'HH24:MI')
$$;

create or replace function log_meeting_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
begin
  if tg_op = 'INSERT' then
    insert into change_log(meeting_id, kind, changed_by) values (new.id, 'meeting_created', who);
    return null;
  end if;
  if new.cancelled and not old.cancelled then
    insert into change_log(meeting_id, kind, changed_by) values (new.id, 'meeting_cancelled', who);
    return null;
  end if;
  if old.cancelled and not new.cancelled then
    insert into change_log(meeting_id, kind, changed_by) values (new.id, 'meeting_restored', who);
  end if;
  if new.title is distinct from old.title then
    insert into change_log(meeting_id, kind, field, old_value, new_value, changed_by) values (new.id, 'meeting_field', 'title', old.title, new.title, who); end if;
  if new.meeting_date is distinct from old.meeting_date or new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time then
    insert into change_log(meeting_id, kind, field, old_value, new_value, changed_by)
    values (new.id, 'meeting_field', 'when', meeting_when(old.meeting_date, old.start_time, old.end_time), meeting_when(new.meeting_date, new.start_time, new.end_time), who); end if;
  if new.location is distinct from old.location then
    insert into change_log(meeting_id, kind, field, old_value, new_value, changed_by) values (new.id, 'meeting_field', 'location', old.location::text, new.location::text, who); end if;
  if new.project_id is distinct from old.project_id then
    insert into change_log(meeting_id, kind, field, old_value, new_value, changed_by)
    values (new.id, 'meeting_field', 'project', (select name from projects where id = old.project_id), (select name from projects where id = new.project_id), who); end if;
  -- notes are not logged
  return null;
end $$;
create trigger trg_meeting_change_log after insert or update on meetings for each row execute function log_meeting_changes();

create or replace function log_attendee_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
begin
  if tg_op = 'INSERT' then
    -- a brand-new meeting already logs 'meeting_created'; attendees added in the same second ride on that
    if not exists (select 1 from meetings m where m.id = new.meeting_id and m.created_at > now() - interval '5 seconds') then
      insert into change_log(meeting_id, kind, field, new_value, changed_by) values (new.meeting_id, 'attendee_added', 'attendee', person_name(new.person_id), who);
    end if;
    return null;
  end if;
  if not exists (select 1 from meetings m where m.id = old.meeting_id) then return null; end if; -- cascade from a deleted meeting
  insert into change_log(meeting_id, kind, field, old_value, changed_by) values (old.meeting_id, 'attendee_removed', 'attendee', person_name(old.person_id), who);
  return null;
end $$;
create trigger trg_attendee_change_log after insert or delete on meeting_attendees for each row execute function log_attendee_changes();

-- ---------- 07:30 Dubai "your meetings today" (Sun–Thu). Dubai is UTC+4 with no DST, so 03:30 UTC. ----------
select cron.unschedule(jobid) from cron.job where jobname = 'scheduler-meetings-today';
select cron.schedule(
  'scheduler-meetings-today',
  '30 3 * * 0-4',
  $job$
  select net.http_post(
    url     := 'https://c5-scheduler.vercel.app/api/notify/daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_notify_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);
