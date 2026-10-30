-- 021 (30 Oct 2026): evidence uploads failed with 'record "new" has no field "by"'.
-- stage_evidence has columns literally named "by" and "at" — both SQL reserved words — so plpgsql
-- could not resolve new.by / new.at in stamp_by(). Quote them. Applied live 30 Oct 12:50 as
-- migration scheduler_021_fix_stamp_by_reserved_words.
-- Lesson: never name a column by / at / from / to; the Rev 3 tables use from_stage / to_stage for a reason.
set search_path = scheduler, public;

create or replace function stamp_by()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'scheduler', 'public'
as $function$
begin
  if tg_table_name = 'stage_evidence' then
    new."by" := coalesce(current_person_id(), new."by");
    new."at" := now();
  elsif tg_table_name = 'project_tasks' then
    if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, current_person_id()); end if;
  elsif tg_table_name = 'reassignments' then
    new.authorised_by := coalesce(new.authorised_by, current_person_id());
  elsif tg_table_name = 'stage_owners' then
    new.set_by := current_person_id(); new.set_at := now();
  end if;
  return new;
end $function$;
