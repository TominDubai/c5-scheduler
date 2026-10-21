-- 013: Target completion revisions — asked for 21 Oct 2026 ("normally we have a target date to complete
-- but this gets changed along the way").
-- The target date on a project stays the single, current number everything else uses (delay, days to
-- target, alerts). Every value it has ever held is kept here as Rev 0, Rev 1, Rev 2 … with who changed it,
-- when, and why. Written by trigger, so it cannot drift: the app never inserts into this table.
-- projects_live is NOT rebuilt (p.* was fixed at creation); the app reads revisions from target_revisions.
set search_path = scheduler, public;

create table if not exists target_revisions (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references projects(id) on delete cascade,
  rev_no      int  not null,                     -- 0 = original programme, then 1, 2, 3 …
  target_date date,                              -- null = target cleared
  prev_date   date,                              -- what it was before this revision
  reason      text,
  set_by      uuid references people(id),
  set_at      timestamptz not null default now(),
  unique (project_id, rev_no)
);
create index if not exists target_revisions_project on target_revisions(project_id, rev_no);

alter table target_revisions enable row level security;
create policy read_all on target_revisions for select to authenticated using (true);
-- no insert/update/delete policies for users: rows come only from the trigger below
grant select on target_revisions to authenticated;
grant all on target_revisions to service_role;

-- The form sends the reason alongside the new date. It is captured by the trigger and cleared,
-- so it never lingers on the project row.
alter table projects add column if not exists target_change_reason text;

create or replace function log_target_revision() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  next_rev int;
begin
  if tg_op = 'INSERT' then
    if tg_when = 'BEFORE' then return new; end if;   -- the row doesn't exist yet for the FK; the AFTER trigger does the work
    if new.target_date is not null then
      insert into target_revisions(project_id, rev_no, target_date, prev_date, reason, set_by)
      values (new.id, 0, new.target_date, null, nullif(trim(coalesce(new.target_change_reason, '')), ''), current_person_id());
    end if;
    return null;
  end if;

  -- BEFORE update: capture the reason into the revision, then clear it off the project row
  if new.target_date is distinct from old.target_date then
    select coalesce(max(rev_no) + 1, 0) into next_rev from target_revisions where project_id = new.id;
    insert into target_revisions(project_id, rev_no, target_date, prev_date, reason, set_by)
    values (new.id, next_rev, new.target_date, old.target_date, nullif(trim(coalesce(new.target_change_reason, '')), ''), current_person_id());
  end if;
  new.target_change_reason := null;
  return new;
end $$;

-- Live DB has both of these (a redundant BEFORE INSERT one named trg_target_revision also exists there and is a no-op).
create trigger trg_target_revision_upd before update on projects for each row execute function log_target_revision();
create trigger trg_target_revision_ins after insert on projects for each row execute function log_target_revision();

-- Backfill: every project that already has a target gets it recorded as Rev 0 (the original programme).
-- We cannot know earlier values the Excel overwrote, so history starts from today's value.
insert into target_revisions(project_id, rev_no, target_date, prev_date, reason, set_at)
select p.id, 0, p.target_date, null, 'Imported from tracker', coalesce(p.created_at, now())
from projects p
where p.target_date is not null
  and not exists (select 1 from target_revisions r where r.project_id = p.id);
