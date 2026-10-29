-- 018: Meetings ↔ workflow stages (Rev 3 §16): the Sales Handover (stage 5) and Kick-off (stage 7) are booked
-- meetings with an attendance record. A meeting can be tagged with the stage it serves; once it is marked held,
-- who attended is recorded per attendee, and the stage's "held" / "attendance" checklist items tick themselves.

set search_path = scheduler, public;

alter table meetings
  add column if not exists stage_no smallint references stages(stage_no),   -- 5 or 7 today; any stage with attendance later
  add column if not exists held     boolean not null default false;
alter table meeting_attendees
  add column if not exists attended boolean;                                 -- null = not recorded yet

create index if not exists meetings_stage on meetings(project_id, stage_no) where stage_no is not null and not cancelled;

-- meetings_live: stage, held, and who actually attended
drop view if exists meetings_live;
create view meetings_live as
select
  m.*,
  p.name as project_name, p.enquiry_no,
  cb.name as created_by_name, ub.name as updated_by_name,
  s.short_name as stage_short,
  coalesce((select array_agg(a.person_id order by pp.name) from meeting_attendees a join people pp on pp.id = a.person_id where a.meeting_id = m.id), '{}'::uuid[]) as attendee_ids,
  coalesce((select array_agg(pp.name order by pp.name) from meeting_attendees a join people pp on pp.id = a.person_id where a.meeting_id = m.id), '{}'::text[]) as attendees,
  coalesce((select array_agg(a.person_id order by pp.name) from meeting_attendees a join people pp on pp.id = a.person_id where a.meeting_id = m.id and a.attended), '{}'::uuid[]) as attended_ids,
  coalesce((select array_agg(pp.name order by pp.name) from meeting_attendees a join people pp on pp.id = a.person_id where a.meeting_id = m.id and a.attended), '{}'::text[]) as attended
from meetings m
left join projects p on p.id = m.project_id
left join people cb on cb.id = m.created_by
left join people ub on ub.id = m.updated_by
left join stages s on s.stage_no = m.stage_no;
grant select on meetings_live to authenticated, service_role;

-- log the stage tag and "held" so they ride the digest, and tick the stage checklist when a stage meeting is held
create or replace function log_meeting_stage() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  who uuid := current_person_id();
  k text;
begin
  if new.stage_no is distinct from old.stage_no then
    insert into change_log(meeting_id, kind, field, old_value, new_value, changed_by)
    values (new.id, 'meeting_field', 'stage', (select name from stages where stage_no = old.stage_no), (select name from stages where stage_no = new.stage_no), who);
  end if;
  if new.held and not old.held then
    insert into change_log(meeting_id, kind, changed_by) values (new.id, 'meeting_held', who);
    if new.project_id is not null and new.stage_no is not null then
      for k in select x->>'key' from stages s, jsonb_array_elements(s.checklist) x where s.stage_no = new.stage_no and x->>'key' in ('held','attendance') loop
        insert into stage_evidence(project_id, stage_no, item_key, done, note, by)
        values (new.project_id, new.stage_no, k, true, 'Meeting held ' || meeting_when(new.meeting_date, new.start_time, new.end_time), who)
        on conflict (project_id, stage_no, item_key) where item_key is not null do update set done = true, note = excluded.note, by = excluded.by, at = now();
      end loop;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_meeting_stage_log on meetings;
create trigger trg_meeting_stage_log after update on meetings for each row execute function log_meeting_stage();
