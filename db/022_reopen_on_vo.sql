-- 022 (30 Oct 2026): a VO won against a COMPLETED project reopens the parent card.
-- Team comments round 1, page 3 (Yolanda / 26-117): completed projects had dropped out of the
-- "This is a VO for" list, so Ramus made a second card. Tom's decision 30 Oct: one card per
-- project for life; when a VO is won on a completed project the parent comes back to the board at
-- stage 3 Award / contract (Jean) and runs through allocation, sales handover and kick-off prep
-- again — nobody knows at quote time whether a "variation" is a tweak or new BOQ items, and the
-- drawing register at kick-off prep is where that gets caught. Jean may hand 3 → 11 directly when
-- no drawings are needed (an ordinary "Hand to another stage" — recorded).
set search_path = scheduler, public;

-- Which VO reopened the card. Set by win_as_vo, cleared when the card reaches Completed again.
alter table projects add column if not exists reopened_vo_no int;

create or replace function clear_reopened() returns trigger language plpgsql set search_path = scheduler, public as $$
begin
  if new.stage = 17 and old.stage is distinct from 17 then new.reopened_vo_no := null; end if;
  return new;
end $$;
create or replace trigger trg_clear_reopened before update of stage on projects for each row execute function clear_reopened();

-- win_as_vo: as db/011, plus the reopen when the parent is COMPLETED.
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
  insert into variations(project_id, vo_no, description, value, approved_on, source_enquiry_id)
  values (e.parent_project_id, n, coalesce(nullif(e.quote_type, ''), 'VO') || ' — ' || e.name || coalesce(' (' || e.enquiry_no || ')', ''), e.quoted_value, current_date, e.id);

  update projects set status = 'MERGED', quote_stage = 'SUBMITTED', quote_submitted_date = coalesce(quote_submitted_date, current_date) where id = e.id;

  -- Reopen a completed parent: back to stage 3 with Jean. sync_stage_status sets status, stage_entered_at
  -- and the ball holder from the stage; we clear the completion date so duration and delay run again.
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

-- log_handover: a REOPENED row rides the 10-minute digest like the others.
create or replace function log_handover() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare who uuid := current_person_id(); nm text := (select name from stages where stage_no = new.to_stage);
begin
  if tg_op = 'INSERT' and new.status = 'PENDING' then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'handover_requested', nm, person_name(new.from_person_id), person_name(new.to_person_id), who);
  elsif tg_op = 'INSERT' and new.status = 'CHECKPOINT' then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'checkpoint', nm, person_name(new.from_person_id), new.note, who);
  elsif tg_op = 'INSERT' and new.status = 'OVERRIDE' then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'handover_override', nm, person_name(new.from_person_id), person_name(new.to_person_id) || ' — ' || new.override_reason, who);
  elsif tg_op = 'INSERT' and new.status = 'REOPENED' then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'reopened', nm, person_name(new.to_person_id), new.note, who);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'ACCEPTED' then
      insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, case when new.override then 'handover_override' else 'handover_accepted' end, nm, person_name(new.from_person_id), person_name(new.to_person_id) || coalesce(' — recorded by ' || person_name(new.recorded_by), ''), who);
    elsif new.status = 'RETURNED' then
      insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'handover_returned', nm, person_name(new.to_person_id), new.return_reason, who);
    elsif new.status = 'CANCELLED' then
      insert into change_log(project_id, kind, field, old_value, new_value, changed_by) values (new.project_id, 'handover_cancelled', nm, person_name(new.to_person_id), null, who);
    end if;
  end if;
  return null;
end $$;
