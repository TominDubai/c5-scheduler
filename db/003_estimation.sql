set search_path = scheduler, public;

alter type person_role add value if not exists 'ESTIMATOR';

create type quote_stage as enum ('QUEUED','PRICING','AWAITING_SUPPLIER','SUBMITTED');

alter table projects
  add column quote_stage quote_stage not null default 'QUEUED',
  add column estimator_id uuid references people(id),
  add column quoted_value numeric(14,2),
  add column quote_submitted_date date,
  add column quote_due_date date,
  add column folder_path text;

create or replace function next_enquiry_no() returns text language sql stable set search_path = scheduler, public as $$
  select to_char(current_date,'YY') || '-' || lpad((
    coalesce(max(split_part(enquiry_no,'-',2)::int), 0) + 1
  )::text, 3, '0')
  from projects
  where enquiry_no ~ ('^' || to_char(current_date,'YY') || '-\d{3}$')
$$;
grant execute on function next_enquiry_no() to authenticated;

drop view projects_live;
create view projects_live as
select
  p.*,
  c.name  as contractor,
  pm.name as pm,
  pm2.name as pm2,
  dz.name as designer,
  es.name as estimator,
  p.signed_quote + coalesce((select sum(value) from variations v where v.project_id = p.id),0) as project_value,
  (select count(*) from variations v where v.project_id = p.id) as vo_count,
  p.target_date - p.start_date                       as days_to_completion,
  coalesce(p.completed_date, current_date) - p.start_date as duration_days,
  case when p.target_date is null then null
       else coalesce(p.completed_date, current_date) - p.target_date end as days_delayed,
  current_date - p.received_date as days_since_enquiry,
  (select max(changed_at) from status_history h where h.project_id = p.id) as status_since
from projects p
left join contractors c on c.id = p.contractor_id
left join people pm  on pm.id  = p.pm_id
left join people pm2 on pm2.id = p.pm2_id
left join people dz  on dz.id  = p.designer_id
left join people es  on es.id  = p.estimator_id;
grant select on projects_live to authenticated, anon;

insert into people(name, full_name, role) values ('RAMUS', 'Ramus', 'ESTIMATOR'), ('GEORGIE', 'Giorgina', 'ADMIN') on conflict (name) do nothing;

update projects set quote_stage = case when signed_quote > 0 then 'SUBMITTED'::quote_stage else 'PRICING'::quote_stage end where status = 'QUOTE';
