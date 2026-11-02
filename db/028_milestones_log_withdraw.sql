-- 028: Anne's comments, 2 Nov 2026 — milestones with revision history, withdrawable revisions, project log.
--
-- 1. Four planned milestones per project, each with the same Rev 0 / Rev 1 … history the target completion
--    already has: Drawings released to production · Delivery to site · Installation complete · Handover.
--    Handover IS projects.target_date (everything — delay, pills, alerts — reads that column); the other three
--    live in project_milestones. All four write their history to ONE table, milestone_revisions.
--    target_revisions becomes a view over it so nothing that still reads the old name breaks.
-- 2. A revision can be withdrawn (struck through, kept, excluded from the slip maths) or its reason edited by
--    its author within 24 h, or by an admin at any time. Rev 0 cannot be withdrawn.
-- 3. project_log: dated updates / issues faced, with an optional file (evidence bucket) or link, shown in the
--    project history and sent in the 10-minute digest. Author can edit or remove their own entry within 24 h;
--    admins any time. Removal is a soft delete so the trail is auditable.
set search_path = scheduler, public;

-- ---------- milestone kinds ----------
create table if not exists milestone_kinds (
  kind              text primary key,
  label             text not null,
  short_label       text not null,
  sort_order        int  not null,
  reached_at_stage  smallint not null references stages(stage_no)   -- entering this stage = milestone actually reached
);
insert into milestone_kinds(kind, label, short_label, sort_order, reached_at_stage) values
  ('DRAWINGS_RELEASED', 'Drawings released to production', 'Drawings → production', 1, 10),
  ('DELIVERY',          'Delivery to site',                'Delivery',              2, 14),
  ('INSTALL_COMPLETE',  'Installation complete',           'Install complete',      3, 15),
  ('HANDOVER',          'Handover (target completion)',    'Handover',              4, 16)
on conflict (kind) do update set label = excluded.label, short_label = excluded.short_label, sort_order = excluded.sort_order, reached_at_stage = excluded.reached_at_stage;
alter table milestone_kinds enable row level security;
create policy read_all on milestone_kinds for select to authenticated using (true);
grant select on milestone_kinds to authenticated, service_role;

-- ---------- planned dates for the three non-handover milestones ----------
create table if not exists project_milestones (
  project_id     uuid not null references projects(id) on delete cascade,
  kind           text not null references milestone_kinds(kind),
  planned_date   date,
  change_reason  text,                       -- captured into the revision by trigger, then cleared
  updated_by     uuid references people(id),
  updated_at     timestamptz not null default now(),
  primary key (project_id, kind),
  check (kind <> 'HANDOVER')                 -- handover is projects.target_date
);
alter table project_milestones enable row level security;
create policy read_all on project_milestones for select to authenticated using (true);
create policy write_team on project_milestones for all to authenticated using (current_person_id() is not null) with check (current_person_id() is not null);
grant all on project_milestones to authenticated, service_role;

-- ---------- one revision table for all four ----------
create table if not exists milestone_revisions (
  id                bigint generated always as identity primary key,
  project_id        uuid not null references projects(id) on delete cascade,
  kind              text not null references milestone_kinds(kind),
  rev_no            int  not null,              -- 0 = original programme
  planned_date      date,                       -- null = cleared
  prev_date         date,
  reason            text,
  set_by            uuid references people(id),
  set_at            timestamptz not null default now(),
  edited_at         timestamptz,
  withdrawn_at      timestamptz,
  withdrawn_by      uuid references people(id),
  withdrawn_reason  text,
  unique (project_id, kind, rev_no)
);
create index if not exists milestone_revisions_project on milestone_revisions(project_id, kind, rev_no);
alter table milestone_revisions enable row level security;
create policy read_all on milestone_revisions for select to authenticated using (true);
-- no insert/update/delete for users: rows come from triggers, edits go through the two functions below
grant select on milestone_revisions to authenticated;
grant all on milestone_revisions to service_role;

-- carry the existing target history across as HANDOVER
insert into milestone_revisions(project_id, kind, rev_no, planned_date, prev_date, reason, set_by, set_at)
select project_id, 'HANDOVER', rev_no, target_date, prev_date, reason, set_by, set_at
from target_revisions
on conflict (project_id, kind, rev_no) do nothing;

-- target_revisions becomes a view (same columns the app used), withdrawn rows hidden
drop table target_revisions;
create view target_revisions as
  select id, project_id, rev_no, planned_date as target_date, prev_date, reason, set_by, set_at
  from milestone_revisions where kind = 'HANDOVER' and withdrawn_at is null;
grant select on target_revisions to authenticated, service_role;

-- the projects trigger now writes HANDOVER rows here (same trigger names stay in place)
create or replace function log_target_revision() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare next_rev int;
begin
  if tg_op = 'INSERT' then
    if tg_when = 'BEFORE' then return new; end if;
    if new.target_date is not null then
      insert into milestone_revisions(project_id, kind, rev_no, planned_date, prev_date, reason, set_by)
      values (new.id, 'HANDOVER', 0, new.target_date, null, nullif(trim(coalesce(new.target_change_reason, '')), ''), current_person_id());
    end if;
    return null;
  end if;
  if new.target_date is distinct from old.target_date then
    select coalesce(max(rev_no) + 1, 0) into next_rev from milestone_revisions where project_id = new.id and kind = 'HANDOVER';
    insert into milestone_revisions(project_id, kind, rev_no, planned_date, prev_date, reason, set_by)
    values (new.id, 'HANDOVER', next_rev, new.target_date, old.target_date, nullif(trim(coalesce(new.target_change_reason, '')), ''), current_person_id());
  end if;
  new.target_change_reason := null;
  return new;
end $$;
-- the live DB only had the BEFORE trigger (insert half is a no-op); make sure Rev 0 is written on insert too
create trigger trg_target_revision_ins028 after insert on projects for each row execute function log_target_revision();

-- same mechanism for the three project_milestones kinds, plus a change_log row so the digest carries it
create or replace function log_milestone_revision() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare next_rev int; who uuid := current_person_id(); lbl text;
begin
  select label into lbl from milestone_kinds where kind = new.kind;
  if tg_op = 'INSERT' then
    if new.planned_date is not null then
      insert into milestone_revisions(project_id, kind, rev_no, planned_date, prev_date, reason, set_by)
      values (new.project_id, new.kind, 0, new.planned_date, null, nullif(trim(coalesce(new.change_reason, '')), ''), who);
      insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'milestone', lbl, null, to_char(new.planned_date, 'DD Mon YY'), who);
    end if;
  elsif new.planned_date is distinct from old.planned_date then
    select coalesce(max(rev_no) + 1, 0) into next_rev from milestone_revisions where project_id = new.project_id and kind = new.kind;
    insert into milestone_revisions(project_id, kind, rev_no, planned_date, prev_date, reason, set_by)
    values (new.project_id, new.kind, next_rev, new.planned_date, old.planned_date, nullif(trim(coalesce(new.change_reason, '')), ''), who);
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
    values (new.project_id, 'milestone', lbl, to_char(old.planned_date, 'DD Mon YY'), coalesce(to_char(new.planned_date, 'DD Mon YY'), '—') || coalesce(' — ' || nullif(trim(new.change_reason), ''), ''), who);
  end if;
  new.change_reason := null; new.updated_by := who; new.updated_at := now();
  return new;
end $$;
create trigger trg_milestone_revision before insert or update on project_milestones for each row execute function log_milestone_revision();

-- ---------- withdraw / edit a revision ----------
create or replace function can_touch_revision(r milestone_revisions) returns boolean language sql stable set search_path = scheduler, public as $$
  select is_admin() or (r.set_by is not null and r.set_by = current_person_id() and r.set_at > now() - interval '24 hours')
$$;

create or replace function withdraw_milestone_revision(rev_id bigint, undo boolean default false, why text default null) returns void language plpgsql security definer set search_path = scheduler, public as $$
declare r milestone_revisions; lbl text;
begin
  select * into r from milestone_revisions where id = rev_id;
  if r.id is null then raise exception 'Revision not found'; end if;
  if r.rev_no = 0 then raise exception 'Rev 0 is the original programme — it cannot be withdrawn. Change the date in the form instead.'; end if;
  if not can_touch_revision(r) then raise exception 'Only the person who made this entry (within 24 hours) or an admin can withdraw it.'; end if;
  select label into lbl from milestone_kinds where kind = r.kind;
  if undo then
    update milestone_revisions set withdrawn_at = null, withdrawn_by = null, withdrawn_reason = null where id = rev_id;
  else
    update milestone_revisions set withdrawn_at = now(), withdrawn_by = current_person_id(), withdrawn_reason = nullif(trim(coalesce(why, '')), '') where id = rev_id;
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
    values (r.project_id, 'milestone_withdrawn', lbl, 'Rev ' || r.rev_no, nullif(trim(coalesce(why, '')), ''), current_person_id());
  end if;
end $$;
grant execute on function withdraw_milestone_revision(bigint, boolean, text) to authenticated;

create or replace function edit_milestone_revision_reason(rev_id bigint, new_reason text) returns void language plpgsql security definer set search_path = scheduler, public as $$
declare r milestone_revisions;
begin
  select * into r from milestone_revisions where id = rev_id;
  if r.id is null then raise exception 'Revision not found'; end if;
  if not can_touch_revision(r) then raise exception 'Only the person who made this entry (within 24 hours) or an admin can edit it.'; end if;
  update milestone_revisions set reason = nullif(trim(coalesce(new_reason, '')), ''), edited_at = now() where id = rev_id;
end $$;
grant execute on function edit_milestone_revision_reason(bigint, text) to authenticated;

-- ---------- milestones_live: one row per live project per kind ----------
-- planned (current), rev number (ignoring withdrawn), original, and the actual date it was reached — the first
-- accepted / override / checkpoint handover into the milestone's stage or beyond. Migrated cards have no
-- handover history before 28 Oct, so a migrated card already past the stage shows reached = true, actual null.
create or replace view milestones_live as
with planned as (
  select p.id as project_id, k.kind, k.label, k.short_label, k.sort_order, k.reached_at_stage,
         case when k.kind = 'HANDOVER' then p.target_date else pm.planned_date end as planned_date,
         p.stage
  from projects p cross join milestone_kinds k
  left join project_milestones pm on pm.project_id = p.id and pm.kind = k.kind
  where p.deleted_at is null and p.status not in ('LOST', 'MERGED')
), revs as (
  select project_id, kind,
         max(rev_no) filter (where withdrawn_at is null) as rev_no,
         count(*) filter (where withdrawn_at is null and rev_no > 0) as revisions,
         (array_agg(planned_date order by rev_no) filter (where rev_no = 0))[1] as rev0_date
  from milestone_revisions group by project_id, kind
), actual as (
  select h.project_id, k.kind, min(coalesce(h.accepted_at, h.requested_at))::date as actual_date
  from handovers h join milestone_kinds k on h.to_stage >= k.reached_at_stage
  where h.status in ('ACCEPTED', 'OVERRIDE', 'CHECKPOINT')
  group by h.project_id, k.kind
)
select pl.project_id, pl.kind, pl.label, pl.short_label, pl.sort_order, pl.reached_at_stage, pl.planned_date,
       coalesce(r.rev_no, 0) as rev_no, coalesce(r.revisions, 0) as revisions, r.rev0_date,
       a.actual_date,
       (pl.stage is not null and pl.stage >= pl.reached_at_stage) as reached,
       case
         when pl.planned_date is null then null
         when a.actual_date is not null then (a.actual_date > pl.planned_date)
         when pl.stage is not null and pl.stage >= pl.reached_at_stage then false
         else (pl.planned_date < (now() at time zone 'Asia/Dubai')::date)
       end as late
from planned pl
left join revs r on r.project_id = pl.project_id and r.kind = pl.kind
left join actual a on a.project_id = pl.project_id and a.kind = pl.kind;
grant select on milestones_live to authenticated, service_role;

-- ---------- project log ----------
create table if not exists project_log (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  body        text not null,
  file_path   text,
  file_name   text,
  link_url    text,
  created_by  uuid references people(id) default current_person_id(),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz,
  deleted_by  uuid references people(id)
);
create index if not exists project_log_project on project_log(project_id, created_at desc);
alter table project_log enable row level security;
create policy read_all on project_log for select to authenticated using (true);
create policy insert_team on project_log for insert to authenticated with check (current_person_id() is not null and created_by = current_person_id());
create policy edit_own_or_admin on project_log for update to authenticated
  using (is_admin() or (created_by = current_person_id() and created_at > now() - interval '24 hours'))
  with check (is_admin() or (created_by = current_person_id() and created_at > now() - interval '24 hours'));
grant select, insert, update on project_log to authenticated;
grant all on project_log to service_role;

create or replace function guard_project_log() returns trigger language plpgsql set search_path = scheduler, public as $$
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
      raise exception 'A log entry cannot be moved or re-attributed';
    end if;
    if new.deleted_at is not null and old.deleted_at is null then new.deleted_by := current_person_id(); end if;
    if new.body <> old.body or new.link_url is distinct from old.link_url or new.file_path is distinct from old.file_path then new.edited_at := now(); end if;
  end if;
  return new;
end $$;
create trigger trg_guard_project_log before update on project_log for each row execute function guard_project_log();

create or replace function log_project_log_entry() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
  values (new.project_id, 'log_entry', new.file_name, null, left(new.body, 300), new.created_by);
  return new;
end $$;
create trigger trg_log_project_log_entry after insert on project_log for each row execute function log_project_log_entry();
