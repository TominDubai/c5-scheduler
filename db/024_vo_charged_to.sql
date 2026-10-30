-- 024 (30 Oct 2026): VO cards — "This VO is charged to" (team comments round 1, page 2, Jinky).
-- A VO enquiry records who pays for it (client, contractor, …) as free text; when it is won the
-- value carries over to the variation row on the parent so Jean sees who to invoice.
set search_path = scheduler, public;

alter table projects   add column if not exists charged_to text;   -- on a VO enquiry
alter table variations add column if not exists charged_to text;   -- carried over on win

create or replace function win_as_vo(enquiry uuid) returns int language plpgsql security definer set search_path = scheduler, public as $$
declare
  e projects%rowtype;
  par projects%rowtype;
  n int;
  jean uuid;
begin
  if not coalesce((me()).can_edit_estimation, false) and not coalesce((me()).can_edit_projects, false) then
    raise exception 'You need estimation rights to do that';
  end if;
  select * into e from projects where id = enquiry for update;
  if e.id is null then raise exception 'Enquiry not found'; end if;
  if e.status <> 'QUOTE' then raise exception 'That enquiry is no longer a quote'; end if;
  if e.parent_project_id is null then raise exception 'Pick which project this VO belongs to first'; end if;
  if coalesce(e.quoted_value, 0) = 0 then raise exception 'Enter the quoted value before marking it won (a credit is a minus figure)'; end if;
  select * into par from projects where id = e.parent_project_id for update;
  if par.status in ('LOST','MERGED') or par.deleted_at is not null then raise exception 'That project is no longer on the board — pick another parent'; end if;

  select coalesce(max(vo_no), 0) + 1 into n from variations where project_id = e.parent_project_id;
  insert into variations(project_id, vo_no, description, value, approved_on, source_enquiry_id, charged_to)
  values (e.parent_project_id, n, coalesce(nullif(e.quote_type, ''), 'VO') || ' — ' || e.name || coalesce(' (' || e.enquiry_no || ')', ''), e.quoted_value, current_date, e.id, nullif(trim(e.charged_to), ''));

  update projects set status = 'MERGED', quote_stage = 'SUBMITTED', quote_submitted_date = coalesce(quote_submitted_date, current_date) where id = e.id;

  if par.status = 'COMPLETED' or par.stage = 17 then
    jean := default_ball_holder(3::smallint, par.pm_id);
    update projects set stage = 3, ball_holder_id = jean, flow_status = 'ACTIVE', completed_date = null,
      stage_migrated = false, stage_accepted_at = null, reopened_vo_no = n,
      next_action = null, next_action_owner_id = null, next_action_due = null
      where id = par.id;
    insert into handovers(project_id, from_stage, to_stage, from_person_id, to_person_id, status, accepted_at, note)
    values (par.id, 17, 3, null, jean, 'REOPENED', now(),
      format('Reopened for VO%s — %s, %s. Was completed on %s.', n, e.name, to_char(e.quoted_value, 'FM999,999,999'), coalesce(to_char(par.completed_date, 'DD Mon YYYY'), 'an unrecorded date')));
  end if;
  return n;
end $$;
grant execute on function win_as_vo(uuid) to authenticated;
