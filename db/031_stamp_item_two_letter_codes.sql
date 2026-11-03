-- 031: stamp_item() declared the type letter as char(1); two-letter codes (DT, db/029) overflowed it and
-- every Shop Drawing Log import with a door type rolled back ("value too long for type character(1)" — Jinky, 3 Nov).
set search_path = scheduler, public;
create or replace function stamp_item() returns trigger language plpgsql security definer set search_path = scheduler, public as $$
declare
  letter text;
begin
  if tg_op = 'INSERT' then
    select code_letter into letter from item_types where id = new.type_id;
    new.code_letter := coalesce(new.code_letter, letter, 'O');
    if new.seq is null then
      select coalesce(max(seq), 0) + 1 into new.seq from items where project_id = new.project_id and code_letter = new.code_letter;
    end if;
    if new.designer_id is null then select designer_id into new.designer_id from projects where id = new.project_id; end if;
    if new.sort_order = 0 then select coalesce(max(sort_order), 0) + 1 into new.sort_order from items where project_id = new.project_id; end if;
    new.created_by := coalesce(new.created_by, current_person_id());
  else
    new.code_letter := old.code_letter; new.seq := old.seq;
  end if;
  new.updated_by := current_person_id();
  new.updated_at := now();
  return new;
end $$;
