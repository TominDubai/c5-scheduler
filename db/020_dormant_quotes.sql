-- 020: Active / Dormant split of submitted quotations (Jinky, 30 Oct 2026).
-- A submitted quote is ACTIVE by default — we are chasing it and expect a decision. Ramus / Jinky mark it DORMANT when
-- it is too small to chase or the client has gone quiet. Dormant quotes stay winnable; they just drop out of the
-- "awaiting decision" count so the active number is the one that means something.
-- Part 1 (this file) via the migration tool. Part 2: re-run db/016c_projects_live.sql via execute_sql so the view
-- picks up the two new columns (p.* is expanded when the view is created).
set search_path = scheduler, public;

alter table projects
  add column if not exists quote_dormant boolean not null default false,
  add column if not exists quote_dormant_since date;

-- keep the flag honest: stamp the date, and clear it when the quote leaves Submitted or stops being a quote
create or replace function keep_quote_dormant() returns trigger language plpgsql set search_path = scheduler, public as $$
begin
  if new.status <> 'QUOTE' or new.quote_stage <> 'SUBMITTED' then
    new.quote_dormant := false;
  end if;
  if new.quote_dormant is distinct from old.quote_dormant then
    new.quote_dormant_since := case when new.quote_dormant then current_date else null end;
  end if;
  return new;
end $$;
drop trigger if exists trg_keep_quote_dormant on projects;
create trigger trg_keep_quote_dormant before update on projects for each row execute function keep_quote_dormant();

-- a trail in change_log (rides the 10-minute digest to the estimator / watchers like any other field)
create or replace function log_quote_dormant() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
begin
  if new.quote_dormant is distinct from old.quote_dormant and new.status = 'QUOTE' then
    insert into change_log(project_id, kind, field, old_value, new_value, changed_by)
    values (new.id, 'field', 'quote_activity', case when old.quote_dormant then 'Dormant' else 'Active' end,
            case when new.quote_dormant then 'Dormant' else 'Active' end, current_person_id());
  end if;
  return null;
end $$;
drop trigger if exists trg_log_quote_dormant on projects;
create trigger trg_log_quote_dormant after update on projects for each row execute function log_quote_dormant();
