-- 014: Items & production — the layer below the project card (plan: C5-Items-and-Production_Plan_v1.md, 21 Oct 2026).
-- Once a project is awarded, the designer breaks it into ITEMS (every piece of joinery that needs a shop drawing).
-- Each item walks drawing → approval → six production stages (Joinery, Paint, Delivery = Gajanand; Install, Stone,
-- Snagging = PM). One row per item is the truth; everything on the board is computed from it.
--
-- Codes: project code = enquiry no (YY-NNN). Item code = type letter + sequence per type per project (K01, W02 …),
-- never reused. Drawing code = project code + item code + revision, e.g. 26-011-K01-R1 — assembled in the view, never typed.
-- Data reality (checked 21 Oct): enquiry numbers are not unique in the live data (VO enquiries share the parent's
-- number; the Sobha Hartland batch has 12 villas on "2161"; old 4-digit numbers exist). So uniqueness is enforced
-- per project (project_id, type, seq), the YY-NNN format check only fires on NEW or CHANGED enquiry numbers, and
-- old numbers are grandfathered.
set search_path = scheduler, public;

-- ---------- people: Production role, admin flag ----------
alter type person_role add value if not exists 'PRODUCTION';
alter table people add column if not exists is_admin boolean not null default false;
-- Tom, Aftab, Darren, Jinky: full access to everything at every level (decided 21 Oct)
update people set is_admin = true where name in ('TOM','TOM-BOLSOVER','AFTAB','DARREN','JINKY');
update people set can_manage_team = true where name = 'AFTAB';
-- protect the new flag like the others (app can't flip it)
create or replace function protect_people_flags() returns trigger language plpgsql set search_path = scheduler, public as $$
begin
  if auth.role() = 'authenticated' and (
       new.can_edit_projects is distinct from old.can_edit_projects
    or new.can_edit_estimation is distinct from old.can_edit_estimation
    or new.can_manage_team is distinct from old.can_manage_team
    or new.is_admin is distinct from old.is_admin) then
    raise exception 'Permissions can only be changed by an administrator';
  end if;
  return new;
end $$;
alter policy insert_people on people with check ((me()).can_manage_team and can_edit_projects = false and can_edit_estimation = false and can_manage_team = false and is_admin = false);

create or replace function is_admin() returns boolean language sql stable set search_path = scheduler, public as $$
  select coalesce((me()).is_admin, false)
$$;
grant execute on function is_admin() to authenticated;

-- ---------- project code format: YY-NNN, unique among live projects; only checked when the number is new or changed ----------
update projects set enquiry_no = regexp_replace(enquiry_no, '^\s*ENQ-?\s*', '') where enquiry_no ~* '^\s*ENQ';
update projects set enquiry_no = trim(enquiry_no) where enquiry_no <> trim(enquiry_no);

create or replace function check_project_code() returns trigger language plpgsql set search_path = scheduler, public as $$
begin
  if new.enquiry_no is null then return new; end if;
  new.enquiry_no := upper(trim(new.enquiry_no));
  if tg_op = 'UPDATE' and new.enquiry_no is not distinct from old.enquiry_no then return new; end if;
  if new.enquiry_no !~ '^\d{2}-\d{3}$' then
    raise exception 'Project code must be in the format YY-NNN (e.g. 26-011), got "%"', new.enquiry_no;
  end if;
  -- a VO enquiry shares its parent's number; otherwise the number must be free among live projects
  if new.parent_project_id is null and exists (
      select 1 from projects p where p.enquiry_no = new.enquiry_no and p.id <> new.id and p.deleted_at is null
        and p.status <> 'MERGED' and p.parent_project_id is null) then
    raise exception 'Project code % is already used by another project', new.enquiry_no;
  end if;
  return new;
end $$;
create trigger trg_check_project_code before insert or update of enquiry_no on projects for each row execute function check_project_code();

-- ---------- lookups ----------
create type drawing_status as enum ('A','B','C','D','UR');      -- Approved · Approved w/ comments · Revise & resubmit · Not required · Under review
create type material_status as enum ('PENDING','APPROVED','NA');
create type production_stage as enum ('JOINERY','PAINT','DELIVERY','INSTALL','STONE','SNAGGING');
create type stage_status as enum ('NOT_STARTED','IN_PROGRESS','DELAYED','ON_HOLD','COMPLETE');

create table item_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  code_letter char(1) not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true
);
insert into item_types(name, code_letter, sort_order) values
  ('Kitchen','K',1), ('Wardrobe / walk-in','W',2), ('Vanity','V',3), ('TV / media unit','T',4), ('Other','O',9);

create table alert_settings (
  rule        text primary key,
  label       text not null,
  threshold   int,                 -- days, meaning depends on the rule
  enabled     boolean not null default true
);
insert into alert_settings(rule, label, threshold) values
  ('I1','Submission overdue (planned submission passed, no R0)', 0),
  ('I2','Client sitting on it (submitted, no return after N days)', 7),
  ('I3','Returned C or D', 0),
  ('I4','Material / measurements blocking (Joinery start within N days)', 7),
  ('I5','Stage slipping (planned end passed, not complete)', 0),
  ('I6','Install at risk (Install start within N days, Delivery not complete)', 3),
  ('I7','Awarded, no items after N working days', 5),
  ('I8','Awarded, no designer', 0),
  ('I9','Issued, not scheduled after N working days', 3),
  ('I10','Delivered, no install date', 0),
  ('R3','Flag drawings past this revision', 3);

-- ---------- items ----------
create table items (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  type_id               uuid not null references item_types(id),
  code_letter           char(1) not null,            -- frozen at creation; changing the type keeps the code
  seq                   int not null,                -- per letter per project, never reused
  name                  text not null,
  area                  text,                        -- room / location on site
  designer_id           uuid references people(id),  -- defaults to the project designer
  drawing_started_date  date,
  planned_submission    date,
  current_revision      int,                         -- maintained by trigger from item_revisions
  current_status        drawing_status,              -- status of the latest revision
  material_approval     material_status not null default 'PENDING',
  measurements_date     date,
  issued_date           date,                        -- issued to production → six stage rows are created
  notes                 text,
  cancelled             boolean not null default false,
  sort_order            int not null default 0,
  created_by            uuid references people(id),
  updated_by            uuid references people(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (project_id, code_letter, seq)
);
create index on items(project_id);
create index on items(designer_id);

create table item_revisions (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references items(id) on delete cascade,
  rev_no          int not null,                      -- 0 = R0
  submitted_date  date,
  returned_date   date,
  status          drawing_status,                    -- null while out with the client (treated as UR)
  comments        text,
  created_by      uuid references people(id),
  created_at      timestamptz not null default now(),
  unique (item_id, rev_no)
);

create table item_production_stages (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references items(id) on delete cascade,
  stage_no       smallint not null check (stage_no between 1 and 6),
  stage          production_stage not null,
  planned_start  date,
  planned_end    date,
  actual_start   date,
  actual_end     date,
  status         stage_status not null default 'NOT_STARTED',
  na             boolean not null default false,
  notes          text,
  updated_by     uuid references people(id),
  updated_at     timestamptz not null default now(),
  unique (item_id, stage_no)
);
create index on item_production_stages(item_id);

-- ---------- item code generation + stamping ----------
create or replace function stamp_item() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  letter char(1);
begin
  if tg_op = 'INSERT' then
    select code_letter into letter from item_types where id = new.type_id;
    new.code_letter := coalesce(new.code_letter, letter, 'O');
    if new.seq is null then
      select coalesce(max(seq), 0) + 1 into new.seq from items where project_id = new.project_id and code_letter = new.code_letter;
    end if;
    if new.designer_id is null then select designer_id into new.designer_id from projects where id = new.project_id; end if;
    if new.sort_order = 0 then select coalesce(max(sort_order), 0) + 1 into new.sort_order from items where project_id = new.project_id; end if;
    new.created_by := coalesce(new.created_by, current_person_id());
  else
    new.code_letter := old.code_letter; new.seq := old.seq;   -- codes never change
  end if;
  new.updated_by := current_person_id();
  new.updated_at := now();
  return new;
end $$;
create trigger trg_stamp_item before insert or update on items for each row execute function stamp_item();

-- issued to production → the six stage rows appear (once)
create or replace function create_item_stages() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  if new.issued_date is not null and not exists (select 1 from item_production_stages s where s.item_id = new.id) then
    insert into item_production_stages(item_id, stage_no, stage) values
      (new.id, 1, 'JOINERY'), (new.id, 2, 'PAINT'), (new.id, 3, 'DELIVERY'), (new.id, 4, 'INSTALL'), (new.id, 5, 'STONE'), (new.id, 6, 'SNAGGING');
  end if;
  return null;
end $$;
create trigger trg_item_stages after insert or update of issued_date on items for each row execute function create_item_stages();

-- latest revision → items.current_revision / current_status
create or replace function sync_item_revision() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  iid uuid := coalesce(new.item_id, old.item_id);
begin
  update items i set
    current_revision = (select max(rev_no) from item_revisions r where r.item_id = iid),
    current_status   = (select r.status from item_revisions r where r.item_id = iid order by rev_no desc limit 1)
  where i.id = iid;
  return null;
end $$;
create trigger trg_sync_item_revision after insert or update or delete on item_revisions for each row execute function sync_item_revision();

create or replace function stamp_stage() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  if new.status = 'COMPLETE' and new.actual_end is null then new.actual_end := current_date; end if;
  if new.status in ('IN_PROGRESS','DELAYED') and new.actual_start is null then new.actual_start := current_date; end if;
  new.updated_by := current_person_id(); new.updated_at := now();
  return new;
end $$;
create trigger trg_stamp_stage before update on item_production_stages for each row execute function stamp_stage();

-- ---------- change log: item events ride on the project (same 10-minute digest, no new plumbing) ----------
alter table change_log add column if not exists item_id uuid references items(id) on delete cascade;

create or replace function item_label(i items) returns text language sql stable as $$
  select i.code_letter || lpad(i.seq::text, 2, '0') || ' ' || i.name
$$;

create or replace function log_item_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
begin
  if tg_op = 'INSERT' then
    insert into change_log(project_id, item_id, kind, field, new_value, changed_by) values (new.project_id, new.id, 'item_created', item_label(new), new.name, who);
    return null;
  end if;
  if new.cancelled and not old.cancelled then
    insert into change_log(project_id, item_id, kind, field, changed_by) values (new.project_id, new.id, 'item_cancelled', item_label(new), who); return null; end if;
  if new.current_status is distinct from old.current_status or new.current_revision is distinct from old.current_revision then
    insert into change_log(project_id, item_id, kind, field, old_value, new_value, changed_by)
    values (new.project_id, new.id, 'item_drawing', item_label(new),
      case when old.current_revision is null then null else 'R' || old.current_revision || coalesce(' ' || old.current_status::text, '') end,
      case when new.current_revision is null then null else 'R' || new.current_revision || coalesce(' ' || new.current_status::text, ' submitted') end, who); end if;
  if new.issued_date is distinct from old.issued_date then
    insert into change_log(project_id, item_id, kind, field, old_value, new_value, changed_by) values (new.project_id, new.id, 'item_issued', item_label(new), old.issued_date::text, new.issued_date::text, who); end if;
  if new.designer_id is distinct from old.designer_id then
    insert into change_log(project_id, item_id, kind, field, old_value, new_value, changed_by) values (new.project_id, new.id, 'item_designer', item_label(new), person_name(old.designer_id), person_name(new.designer_id), who); end if;
  if new.material_approval is distinct from old.material_approval then
    insert into change_log(project_id, item_id, kind, field, old_value, new_value, changed_by) values (new.project_id, new.id, 'item_material', item_label(new), old.material_approval::text, new.material_approval::text, who); end if;
  return null;
end $$;
create trigger trg_item_change_log after insert or update on items for each row execute function log_item_changes();

create or replace function log_stage_changes() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
  i items;
begin
  if new.status is distinct from old.status then
    select * into i from items where id = new.item_id;
    insert into change_log(project_id, item_id, kind, field, old_value, new_value, changed_by)
    values (i.project_id, i.id, 'item_stage', item_label(i) || ' · ' || initcap(new.stage::text), old.status::text, new.status::text, who);
  end if;
  return null;
end $$;
create trigger trg_stage_change_log after update on item_production_stages for each row execute function log_stage_changes();

-- ---------- the computed view ----------
create or replace function item_stage_label(i items) returns text language plpgsql stable set search_path = scheduler, public as $$
declare
  cur production_stage;
  n_open int;
begin
  if i.cancelled then return 'CANCELLED'; end if;
  if i.issued_date is not null then
    select count(*) into n_open from item_production_stages s where s.item_id = i.id and not s.na and s.status <> 'COMPLETE';
    if n_open = 0 and exists (select 1 from item_production_stages s where s.item_id = i.id) then return 'COMPLETE'; end if;
    select s.stage into cur from item_production_stages s where s.item_id = i.id and not s.na and s.status <> 'COMPLETE' order by s.stage_no limit 1;
    return coalesce(cur::text, 'ISSUED');
  end if;
  if i.current_status in ('A','B') then return 'APPROVED'; end if;
  if i.current_revision is not null then return 'SUBMITTED'; end if;
  if i.drawing_started_date is not null then return 'DRAWING'; end if;
  return 'NOT_STARTED';
end $$;

create view items_live as
select
  i.*,
  i.code_letter || lpad(i.seq::text, 2, '0') as item_code,
  coalesce(p.enquiry_no, '??') || '-' || i.code_letter || lpad(i.seq::text, 2, '0') as drawing_code,
  coalesce(p.enquiry_no, '??') || '-' || i.code_letter || lpad(i.seq::text, 2, '0') || '-R' || coalesce(i.current_revision, 0) as drawing_code_rev,
  t.name as type_name,
  p.name as project_name, p.enquiry_no, p.status as project_status, p.client, p.deleted_at as project_deleted_at,
  p.pm_id, pm.name as pm, dz.name as designer,
  item_stage_label(i) as stage,
  (select max(r.submitted_date) from item_revisions r where r.item_id = i.id) as last_submitted,
  (select r.returned_date from item_revisions r where r.item_id = i.id order by rev_no desc limit 1) as last_returned,
  exists (select 1 from item_production_stages s where s.item_id = i.id and not s.na and s.status <> 'COMPLETE' and s.planned_end < current_date) as slipping,
  (select min(s.planned_end) from item_production_stages s where s.item_id = i.id and not s.na and s.status <> 'COMPLETE' and s.planned_end < current_date) as earliest_slip,
  (i.planned_submission is not null and i.planned_submission < current_date and i.current_revision is null and not i.cancelled) as submission_overdue,
  (i.current_revision is not null and i.current_status is null and
   (select r.submitted_date from item_revisions r where r.item_id = i.id order by rev_no desc limit 1) < current_date - (select coalesce(threshold,7) from alert_settings where rule='I2')) as client_overdue,
  (coalesce(i.current_revision, 0) > (select coalesce(threshold,3) from alert_settings where rule='R3')) as past_r3
from items i
join projects p on p.id = i.project_id
join item_types t on t.id = i.type_id
left join people pm on pm.id = p.pm_id
left join people dz on dz.id = i.designer_id;

-- per-project counts for cards, dashboard and the digest (projects_live is left alone; the app stitches these on)
create view project_item_counts as
select
  project_id,
  count(*) filter (where not cancelled)                                            as items_total,
  count(*) filter (where not cancelled and stage in ('APPROVED','ISSUED','JOINERY','PAINT','DELIVERY','INSTALL','STONE','SNAGGING','COMPLETE')) as items_approved,
  count(*) filter (where not cancelled and stage in ('ISSUED','JOINERY','PAINT','DELIVERY')) as items_in_production,
  count(*) filter (where not cancelled and stage in ('INSTALL','STONE','SNAGGING','COMPLETE')) as items_on_site,
  count(*) filter (where not cancelled and stage = 'COMPLETE')                      as items_complete,
  count(*) filter (where not cancelled and (slipping or submission_overdue or client_overdue or current_status in ('C','D'))) as items_attention,
  min(earliest_slip)                                                                as earliest_slip
from items_live
group by project_id;

-- ---------- security ----------
alter table item_types enable row level security;
alter table alert_settings enable row level security;
alter table items enable row level security;
alter table item_revisions enable row level security;
alter table item_production_stages enable row level security;
create policy read_all on item_types for select to authenticated using (true);
create policy read_all on alert_settings for select to authenticated using (true);
create policy read_all on items for select to authenticated using (true);
create policy read_all on item_revisions for select to authenticated using (true);
create policy read_all on item_production_stages for select to authenticated using (true);
-- v1: anyone on the team list can write (the app greys out columns that aren't yours); admins can do anything.
-- Hard per-role rules come once the workflow settles.
create policy write_team on items for all to authenticated using (current_person_id() is not null) with check (current_person_id() is not null);
create policy write_team on item_revisions for all to authenticated using (current_person_id() is not null) with check (current_person_id() is not null);
create policy write_team on item_production_stages for all to authenticated using (current_person_id() is not null) with check (current_person_id() is not null);
create policy write_admin on item_types for all to authenticated using (is_admin()) with check (is_admin());
create policy write_admin on alert_settings for all to authenticated using (is_admin()) with check (is_admin());
grant all on item_types, alert_settings, items, item_revisions, item_production_stages to authenticated, service_role;
grant select on items_live, project_item_counts to authenticated, service_role;
