-- 016c: projects_live rebuilt for Workflow Rev 3 — stage, ball holder, flow status, hold summary, stage age / target.
-- Applied via execute_sql (the migration tool refuses `drop view`). Also folds in the parent columns 011 could not add.
set search_path = scheduler, public;

drop view if exists projects_live;
create view projects_live with (security_invoker = true) as
select
  p.*,
  c.name  as contractor,
  pm.name as pm,
  pm2.name as pm2,
  dz.name as designer,
  td.name as technical_designer,
  es.name as estimator,
  co.name as coordinator,
  bh.name as ball_holder,
  bh.full_name as ball_holder_full,
  coalesce(bh.position, s.position) as ball_holder_position,
  bh.can_sign_in as ball_holder_can_sign_in,
  nao.name as next_action_owner,
  pp.name as parent_name,
  pp.enquiry_no as parent_enquiry_no,
  s.name as stage_name,
  s.short_name as stage_short,
  s.phase as phase,
  s.department as department,
  s.owner_rule as owner_rule,
  s.next_stage as next_stage,
  s.retains_ball as retains_ball,
  st.target_days as stage_target_days,
  case when p.stage_entered_at is null then null else (current_date - p.stage_entered_at::date) end as stage_age_days,
  case when st.target_days is null or p.stage_entered_at is null then false else (current_date - p.stage_entered_at::date) > st.target_days end as stage_overdue,
  h.id as hold_id,
  h.reason as hold_reason,
  coalesce(hw.name, h.waiting_on) as hold_waiting_on,
  h.required_action as hold_action,
  h.action_due as hold_action_due,
  h.blocked_since as hold_since,
  h.review_date as hold_review_date,
  ho.id as pending_handover_id,
  ho.to_person_id as pending_to_person_id,
  hop.name as pending_to_person,
  ho.to_stage as pending_to_stage,
  ho.requested_at as pending_since,
  p.signed_quote + coalesce((select sum(value) from variations v where v.project_id = p.id),0) as project_value,
  (select count(*) from variations v where v.project_id = p.id) as vo_count,
  p.target_date - p.start_date                       as days_to_completion,
  coalesce(p.completed_date, current_date) - p.start_date as duration_days,
  case when p.target_date is null then null
       else coalesce(p.completed_date, current_date) - p.target_date end as days_delayed,
  current_date - p.received_date as days_since_enquiry,
  (select max(changed_at) from status_history hs where hs.project_id = p.id) as status_since,
  case when p.quote_due_date is null then null else p.quote_due_date - current_date end as days_to_quote_due,
  (select count(*) from project_tasks t where t.project_id = p.id and t.done_at is null) as open_tasks
from projects p
left join contractors c on c.id = p.contractor_id
left join people pm  on pm.id  = p.pm_id
left join people pm2 on pm2.id = p.pm2_id
left join people dz  on dz.id  = p.designer_id
left join people td  on td.id  = p.technical_designer_id
left join people es  on es.id  = p.estimator_id
left join people co  on co.id  = p.coordinator_id
left join people bh  on bh.id  = p.ball_holder_id
left join people nao on nao.id = p.next_action_owner_id
left join projects pp on pp.id = p.parent_project_id
left join stages s on s.stage_no = p.stage
left join stage_targets st on st.stage_no = p.stage
left join holds h on h.project_id = p.id and h.released_at is null
left join people hw on hw.id = h.waiting_on_person_id
left join handovers ho on ho.project_id = p.id and ho.status = 'PENDING'
left join people hop on hop.id = ho.to_person_id;
grant select on projects_live to authenticated;
revoke all on projects_live from anon;
