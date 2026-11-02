-- 029: Drawing-office numbering + Excel import (2 Nov 2026).
--
-- Jinky's sample (26-024 Shop Drawing Log) settled the open decision from the Items plan: Concept 5 already numbers
-- drawings  <project>-<room>-<type><seq>, e.g. 26-024-101-B001, 26-024-ZZZ-DT-01. Room = 3-digit location code
-- (1xx ground floor, 2xx first floor, ZZZ whole house, 000 scope documents). Types: B built-in, K kitchen,
-- W wardrobe, V vanity, DT door type (2-digit seq). The app adopts it: items gain a location code, type letters
-- may be two characters with their own sequence width, and a drawing number imported from a sheet is kept as-is.
-- Also: BOQ ref (the join to Ramus's quotation lines) and a materials summary (from the Material Log) per item,
-- and import_drawing_log() which upserts items, revisions and dates from the parsed sheet in one transaction.
set search_path = scheduler, public;

-- ---------- types: two-letter codes, sequence width ----------
alter table item_types alter column code_letter type text;
alter table items      alter column code_letter type text;
alter table item_types add column if not exists pad int not null default 3;
insert into item_types(name, code_letter, sort_order, pad) values
  ('Built-in / cladding', 'B', 0, 3),
  ('Door type', 'DT', 5, 2),
  ('Scope / document', 'S', 8, 3)
on conflict (code_letter) do update set name = excluded.name, sort_order = excluded.sort_order, pad = excluded.pad, is_active = true;
update item_types set is_active = false, name = 'TV / media unit (use Built-in)' where code_letter = 'T';
update item_types set sort_order = 1 where code_letter = 'K';
update item_types set sort_order = 2 where code_letter = 'W';
update item_types set sort_order = 3 where code_letter = 'V';

-- ---------- items: location, BOQ ref, materials, imported drawing number ----------
alter table items add column if not exists location_code text not null default 'ZZZ';
alter table items add column if not exists boq_ref       text;
alter table items add column if not exists materials     text;
alter table items add column if not exists code_override text;   -- drawing number exactly as on the designer's sheet
create index if not exists items_code_override on items(project_id, code_override);

create or replace function item_code_of(i items) returns text language sql stable set search_path = scheduler, public as $$
  select i.code_letter || lpad(i.seq::text, coalesce((select pad from item_types t where t.code_letter = i.code_letter), 3), '0')
$$;
create or replace function drawing_code_of(i items) returns text language sql stable set search_path = scheduler, public as $$
  select coalesce(i.code_override,
    coalesce((select enquiry_no from projects p where p.id = i.project_id), '??') || '-' || i.location_code || '-' ||
    i.code_letter || (case when i.code_letter = 'DT' then '-' else '' end) || lpad(i.seq::text, coalesce((select pad from item_types t where t.code_letter = i.code_letter), 3), '0'))
$$;
create or replace function item_label(i items) returns text language sql stable set search_path = scheduler, public as $$
  select drawing_code_of(i) || ' ' || i.name
$$;

-- ---------- items_live rebuilt with the new columns ----------
drop view if exists project_item_counts;
drop view if exists items_live;
create view items_live as
select
  i.*,
  item_code_of(i) as item_code,
  drawing_code_of(i) as drawing_code,
  drawing_code_of(i) || '-R' || coalesce(i.current_revision, 0) as drawing_code_rev,
  t.name as type_name,
  p.name as project_name, p.enquiry_no, p.status as project_status, p.client, p.deleted_at as project_deleted_at,
  p.pm_id, pm.name as pm, dz.name as designer,
  item_stage_label(i) as stage,
  (select max(r.submitted_date) from item_revisions r where r.item_id = i.id) as last_submitted,
  (select r.returned_date from item_revisions r where r.item_id = i.id order by rev_no desc limit 1) as last_returned,
  exists (select 1 from item_production_stages s where s.item_id = i.id and not s.na and s.status <> 'COMPLETE' and s.planned_end < current_date) as slipping,
  (select min(s.planned_end) from item_production_stages s where s.item_id = i.id and not s.na and s.status <> 'COMPLETE' and s.planned_end < current_date) as earliest_slip,
  (i.planned_submission is not null and i.planned_submission < current_date and i.current_revision is null and not i.cancelled) as submission_overdue,
  (i.current_revision is not null and i.current_status is null and
   (select r.submitted_date from item_revisions r where r.item_id = i.id order by rev_no desc limit 1) < current_date - (select coalesce(threshold,7) from alert_settings where rule='I2')) as client_overdue,
  (coalesce(i.current_revision, 0) > (select coalesce(threshold,3) from alert_settings where rule='R3')) as past_r3
from items i
join projects p on p.id = i.project_id
join item_types t on t.id = i.type_id
left join people pm on pm.id = p.pm_id
left join people dz on dz.id = i.designer_id;

create view project_item_counts as
select
  project_id,
  count(*) filter (where not cancelled)                                            as items_total,
  count(*) filter (where not cancelled and stage in ('APPROVED','ISSUED','JOINERY','PAINT','DELIVERY','INSTALL','STONE','SNAGGING','COMPLETE')) as items_approved,
  count(*) filter (where not cancelled and stage in ('ISSUED','JOINERY','PAINT','DELIVERY')) as items_in_production,
  count(*) filter (where not cancelled and stage in ('INSTALL','STONE','SNAGGING','COMPLETE')) as items_on_site,
  count(*) filter (where not cancelled and stage = 'COMPLETE')                      as items_complete,
  count(*) filter (where not cancelled and (slipping or submission_overdue or client_overdue or current_status in ('C','D'))) as items_attention,
  min(earliest_slip)                                                                as earliest_slip
from items_live
group by project_id;
grant select on items_live, project_item_counts to authenticated, service_role;

-- ---------- import from the designer's sheet ----------
-- rows: [{ drawing_no, type, title, boq_ref, drawn_by, planned_submission, measurements, release, delivery,
--          installation, remarks, materials, revisions: [{ rev, submitted, returned, status }] }]
-- Matches on the drawing number (code_override), else on parsed letter + seq + location. Creates or updates;
-- never duplicates. A row with no title but with materials only updates the materials (Material Log upload).
-- All the per-item change_log rows the triggers write are marked notified and replaced by one summary line.
create or replace function import_drawing_log(p_project uuid, rows jsonb) returns jsonb language plpgsql security definer set search_path = scheduler, public as $$
declare
  r jsonb; rev jsonb;
  dn text; loc text; letter text; seqn int; m text[];
  tname text; tid uuid; tletter text;
  iid uuid; existing items;
  who uuid := current_person_id();
  started timestamptz := clock_timestamp();
  n_new int := 0; n_upd int := 0; skipped jsonb := '[]'::jsonb;
  dz uuid; sub date; ret date; st text; rno int; rel date; pr boolean;
  area_txt text;
begin
  if who is null then raise exception 'Not signed in'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    dn := nullif(trim(r->>'drawing_no'), '');
    if dn is null then continue; end if;
    -- parse <anything>-<LOC>-<LETTERS>-?<DIGITS>
    m := regexp_match(upper(dn), '^(.+)-([A-Z0-9]{3})-([A-Z]{1,2})-?(\d{1,4})$');
    if m is null then
      skipped := skipped || jsonb_build_object('drawing_no', dn, 'why', 'drawing number not in the <project>-<room>-<type><seq> format');
      continue;
    end if;
    loc := m[2]; letter := m[3]; seqn := m[4]::int;
    -- type: by the sheet's TYPE column first, else by the letter in the code
    tname := upper(coalesce(r->>'type', ''));
    tletter := case
      when tname like 'BUILT%' then 'B' when tname like 'KITCHEN%' then 'K' when tname like 'WARDROBE%' then 'W'
      when tname like 'VANITY%' then 'V' when tname like 'DOOR%' then 'DT' when letter in ('B','K','W','V','DT','S') then letter
      else 'O' end;
    select id into tid from item_types where code_letter = tletter;
    if tid is null then select id into tid from item_types where code_letter = 'O'; end if;
    -- designer by short name
    dz := null;
    if nullif(trim(r->>'drawn_by'), '') is not null then
      select id into dz from people where upper(name) = upper(trim(r->>'drawn_by')) or upper(full_name) = upper(trim(r->>'drawn_by')) limit 1;
    end if;
    area_txt := case when upper(coalesce(r->>'title','')) like 'GF %' then 'Ground floor' when upper(coalesce(r->>'title','')) like 'FF %' then 'First floor' when upper(coalesce(r->>'title','')) like 'SF %' then 'Second floor' when upper(coalesce(r->>'title','')) like 'B %' then 'Basement' else null end;
    rel := nullif(r->>'release', '')::date;
    pr := false;

    -- match: exact drawing number first, then type letter + sequence (unique per type per project in the drawing office's
    -- scheme — the 26-024 Material Log had DT-05 under room 101 where the Drawing Log had ZZZ, so the room can't be trusted)
    select * into existing from items where project_id = p_project and code_override = dn limit 1;
    if existing.id is null then select * into existing from items where project_id = p_project and code_letter = letter and seq = seqn limit 1; end if;
    if existing.id is null then
      if nullif(trim(r->>'title'), '') is null then
        skipped := skipped || jsonb_build_object('drawing_no', dn, 'why', 'not in the app yet and the sheet has no title for it');
        continue;
      end if;
      insert into items(project_id, type_id, code_letter, seq, location_code, code_override, name, area, designer_id, planned_submission, boq_ref, measurements_date, issued_date, notes, materials)
      values (p_project, tid, letter, seqn, loc, dn, trim(r->>'title'), area_txt, dz, nullif(r->>'planned_submission','')::date, nullif(trim(r->>'boq_ref'), ''), nullif(r->>'measurements','')::date, rel, nullif(trim(r->>'remarks'), ''), nullif(trim(r->>'materials'), ''))
      returning id into iid;
      n_new := n_new + 1;
    else
      iid := existing.id;
      update items set
        name               = coalesce(nullif(trim(r->>'title'), ''), name),
        type_id            = case when nullif(trim(r->>'title'), '') is not null then tid else type_id end,
        area               = coalesce(area_txt, area),
        designer_id        = coalesce(dz, designer_id),
        planned_submission = coalesce(nullif(r->>'planned_submission','')::date, planned_submission),
        boq_ref            = coalesce(nullif(trim(r->>'boq_ref'), ''), boq_ref),
        measurements_date  = coalesce(nullif(r->>'measurements','')::date, measurements_date),
        issued_date        = coalesce(rel, issued_date),
        notes              = coalesce(nullif(trim(r->>'remarks'), ''), notes),
        materials          = coalesce(nullif(trim(r->>'materials'), ''), materials),
        code_override      = coalesce(code_override, dn),
        location_code      = case when nullif(trim(r->>'title'), '') is not null then loc else location_code end
      where id = iid;
      n_upd := n_upd + 1;
    end if;

    -- revisions R0..Rn: only those with a submitted date
    for rev in select * from jsonb_array_elements(coalesce(r->'revisions', '[]'::jsonb)) loop
      sub := nullif(rev->>'submitted', '')::date;
      if sub is null then continue; end if;
      rno := (rev->>'rev')::int;
      ret := nullif(rev->>'returned', '')::date;
      st := upper(nullif(trim(rev->>'status'), ''));
      if st = 'PR' then pr := true; st := 'A'; end if;          -- issued to production = approved, and issued
      if st not in ('A','B','C','D') then st := null; end if;    -- UR / blank = still with the client
      insert into item_revisions(item_id, rev_no, submitted_date, returned_date, status)
      values (iid, rno, sub, ret, st::drawing_status)
      on conflict (item_id, rev_no) do update set submitted_date = excluded.submitted_date, returned_date = coalesce(excluded.returned_date, item_revisions.returned_date), status = coalesce(excluded.status, item_revisions.status);
    end loop;
    if pr then update items set issued_date = coalesce(issued_date, rel, current_date) where id = iid; end if;

    -- delivery / installation dates land on the matching production stages once they exist
    if nullif(r->>'delivery','') is not null then
      update item_production_stages set planned_start = coalesce(planned_start, (r->>'delivery')::date), planned_end = (r->>'delivery')::date where item_id = iid and stage = 'DELIVERY';
    end if;
    if nullif(r->>'installation','') is not null then
      update item_production_stages set planned_start = (r->>'installation')::date, planned_end = coalesce(planned_end, (r->>'installation')::date) where item_id = iid and stage = 'INSTALL';
    end if;
  end loop;

  -- one digest line instead of one per item
  update change_log set notified_at = now() where project_id = p_project and item_id is not null and notified_at is null and changed_at >= started;
  if n_new + n_upd > 0 then
    insert into change_log(project_id, kind, field, new_value, changed_by)
    values (p_project, 'items_imported', null, n_new || ' new, ' || n_upd || ' updated from the drawing log', who);
  end if;
  return jsonb_build_object('created', n_new, 'updated', n_upd, 'skipped', skipped);
end $$;
grant execute on function import_drawing_log(uuid, jsonb) to authenticated;
