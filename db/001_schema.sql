-- C5 Project Scheduler — schema v1
-- Mirrors CONCEPT_5-_PROJECT_2026.xlsx "LIVE 2026" sheet, fixed by construction.

create schema if not exists scheduler;
set search_path = scheduler, public;

-- ---------- lookups ----------
create type project_status as enum (
  'QUOTE','DESIGN_DRAWINGS','PROD_DRAWINGS','PRODUCTION','INSTALLATION','SNAGGING','COMPLETED',
  'SITE_ON_HOLD','LOST'
);

create type person_role as enum ('PM','DESIGNER','TECHNICAL_DESIGNER','MANAGEMENT','ADMIN');

-- ---------- people ----------
create table people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- as written in the sheet: BASIM, JINKY ...
  full_name   text,
  role        person_role not null,
  email       text unique,                   -- login (magic link)
  whatsapp    text,                          -- +9715xxxxxxx
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table contractors (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique               -- GTS, MACS, DIRECT, BOLSOVER ...
);

-- ---------- projects ----------
create table projects (
  id                    uuid primary key default gen_random_uuid(),
  enquiry_no            text,                     -- 2243, 26-024 ...
  name                  text not null,
  client                text,
  contractor_id         uuid references contractors(id),
  pm_id                 uuid references people(id),
  pm2_id                uuid references people(id),  -- shared projects (BASIM/AKASH)
  designer_id           uuid references people(id),
  technical_designer_id uuid references people(id),
  status                project_status not null default 'QUOTE',
  difficulty            smallint check (difficulty between 0 and 3),  -- sheet legend, optional
  received_date         date,
  start_date            date,
  target_date           date,
  completed_date        date,
  signed_quote          numeric(14,2) not null default 0,  -- inc. 5% VAT, as in the sheet
  notes                 text,
  excel_row             int,                      -- provenance for the import, drop later
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on projects(status);
create index on projects(pm_id);

-- ---------- variation orders (replaces VO1..VO15 columns) ----------
create table variations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  vo_no       int  not null,
  description text,
  value       numeric(14,2) not null default 0,
  approved_on date,
  created_at  timestamptz not null default now(),
  unique (project_id, vo_no)
);

-- ---------- status history (the sheet has none) ----------
create table status_history (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  from_status project_status,
  to_status   project_status not null,
  changed_by  uuid references people(id),
  changed_at  timestamptz not null default now(),
  note        text
);

create or replace function log_status_change() returns trigger language plpgsql set search_path = scheduler, public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into status_history(project_id, from_status, to_status)
    values (new.id, case when tg_op='INSERT' then null else old.status end, new.status);
    if new.status = 'COMPLETED' and new.completed_date is null then
      new.completed_date := current_date;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_project_status
  before insert or update on projects
  for each row execute function log_status_change();

-- ---------- alerts ----------
create table alerts (
  id           uuid primary key default gen_random_uuid(),
  rule         text not null,                -- target_missed, target_14d, stuck, no_target, no_pm, digest
  project_id   uuid references projects(id) on delete cascade,
  sent_to      uuid references people(id),
  channel      text not null default 'email', -- email | whatsapp
  sent_at      timestamptz not null default now(),
  acknowledged_at timestamptz
);

-- ---------- the sheet's calculated columns, live ----------
create view projects_live as
select
  p.*,
  c.name  as contractor,
  pm.name as pm,
  pm2.name as pm2,
  dz.name as designer,
  p.signed_quote + coalesce((select sum(value) from variations v where v.project_id = p.id),0) as project_value,
  (select count(*) from variations v where v.project_id = p.id) as vo_count,
  p.target_date - p.start_date                       as days_to_completion,
  coalesce(p.completed_date, current_date) - p.start_date as duration_days,
  -- delay stops counting on the completion date; null when no target
  case when p.target_date is null then null
       else coalesce(p.completed_date, current_date) - p.target_date end as days_delayed,
  (select max(changed_at) from status_history h where h.project_id = p.id) as status_since
from projects p
left join contractors c on c.id = p.contractor_id
left join people pm  on pm.id  = p.pm_id
left join people pm2 on pm2.id = p.pm2_id
left join people dz  on dz.id  = p.designer_id;

-- ---------- row security (everyone signed in can read; write rules come with the app roles) ----------
alter table people          enable row level security;
alter table contractors     enable row level security;
alter table projects        enable row level security;
alter table variations      enable row level security;
alter table status_history  enable row level security;
alter table alerts          enable row level security;

create policy read_all on people         for select to authenticated using (true);
create policy read_all on contractors    for select to authenticated using (true);
create policy read_all on projects       for select to authenticated using (true);
create policy read_all on variations     for select to authenticated using (true);
create policy read_all on status_history for select to authenticated using (true);
create policy read_all on alerts         for select to authenticated using (true);

-- expose the schema to the Supabase API roles
grant usage on schema scheduler to anon, authenticated, service_role;
grant all on all tables in schema scheduler to authenticated, service_role;
grant select on all tables in schema scheduler to anon;
alter default privileges in schema scheduler grant all on tables to authenticated, service_role;
