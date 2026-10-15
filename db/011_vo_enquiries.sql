-- 011: VO enquiries (15 Oct 2026, asked for by Jinky).
-- A VO enquiry on the Estimation tab can point at the live project it belongs to. When Ramus marks it Won,
-- it becomes the next VO line on that project (app assigns the VO number — Tom's decision) and the enquiry
-- row is marked MERGED so it disappears from the boards. The parent project's PM gets the usual digest.
set search_path = scheduler, public;

-- step 1 (own transaction): new outcome for enquiries folded into a parent project
alter type project_status add value if not exists 'MERGED';

-- step 2
alter table projects add column if not exists parent_project_id uuid references projects(id) on delete set null;
create index if not exists projects_parent on projects(parent_project_id) where parent_project_id is not null;
alter table variations add column if not exists source_enquiry_id uuid references projects(id) on delete set null;

-- estimators may now also set a QUOTE row to MERGED (through win_as_vo)
alter policy update_rows on projects
  with check ((me()).can_edit_projects or ((me()).can_edit_estimation and status in ('QUOTE','DESIGN_DRAWINGS','LOST','MERGED')));

-- projects_live: add the parent's name/number so cards can say "VO for …"
drop view if exists projects_live;
create view projects_live with (security_invoker = true) as
select
  p.*,
  c.name  as contractor,
  pm.name as pm,
  pm2.name as pm2,
  dz.name as designer,
  es.name as estimator,
  pp.name as parent_name,
  pp.enquiry_no as parent_enquiry_no,
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
left join people es  on es.id  = p.estimator_id
left join projects pp on pp.id = p.parent_project_id;
grant select on projects_live to authenticated, anon;

-- Won on a VO enquiry: add the VO to the parent, retire the enquiry. One transaction, runs as owner so an
-- estimator (who can't normally write variations) can do it; the caller still needs estimation rights.
create or replace function win_as_vo(enquiry uuid) returns int language plpgsql security definer set search_path = scheduler, public as $$
declare
  e projects%rowtype;
  n int;
begin
  if not coalesce((me()).can_edit_estimation, false) and not coalesce((me()).can_edit_projects, false) then
    raise exception 'You need estimation rights to do that';
  end if;
  select * into e from projects where id = enquiry for update;
  if e.id is null then raise exception 'Enquiry not found'; end if;
  if e.status <> 'QUOTE' then raise exception 'That enquiry is no longer a quote'; end if;
  if e.parent_project_id is null then raise exception 'Pick which project this VO belongs to first'; end if;
  if coalesce(e.quoted_value, 0) <= 0 then raise exception 'Enter the quoted value before marking it won'; end if;

  select coalesce(max(vo_no), 0) + 1 into n from variations where project_id = e.parent_project_id;
  insert into variations(project_id, vo_no, description, value, approved_on, source_enquiry_id)
  values (e.parent_project_id, n, coalesce(nullif(e.quote_type, ''), 'VO') || ' — ' || e.name || coalesce(' (' || e.enquiry_no || ')', ''), e.quoted_value, current_date, e.id);

  update projects set status = 'MERGED', quote_stage = 'SUBMITTED', quote_submitted_date = coalesce(quote_submitted_date, current_date) where id = e.id;
  return n;
end $$;
grant execute on function win_as_vo(uuid) to authenticated;
