-- Fields from Ramus's Estimation Tracker (Pipeline sheet)
set search_path = scheduler, public;

alter table projects
  add column if not exists quote_type text,   -- FULL QUOTE, KITCHEN, VO1, ADDTL ...
  add column if not exists scope      text,   -- Joinery, Metalwork, Stonework, Glasswork
  add column if not exists waiting_on text,   -- Client info, Stone quote, Metal quote ... (only when stage = AWAITING_SUPPLIER)
  add column if not exists raised_by  text;   -- who sent the enquiry in (Ramus's "Pending From")

insert into contractors(name) values ('BBC'), ('7E') on conflict (name) do nothing;

-- projects_live must be recreated so p.* picks up the new columns
-- (run in the SQL editor: drop view is blocked by the MCP destructive-statement check)
drop view if exists projects_live;
create view projects_live with (security_invoker = true) as
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
grant select on projects_live to authenticated;
revoke all on projects_live from anon;
