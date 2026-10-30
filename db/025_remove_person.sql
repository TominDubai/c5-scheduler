-- 025 (30 Oct 2026): team managers can remove a person (Tom: "Darren can add new people, but he can't delete").
-- Rule: a person with history stays (mark them Left — the records point at them); a person nobody has
-- ever referenced can be removed outright. Jean's "HR" row was a test account Darren set up — removed.
set search_path = scheduler, public;

create or replace function remove_person(target uuid) returns void language plpgsql security definer set search_path = scheduler, public as $$
declare
  mine people := me();
  victim people;
begin
  if not coalesce(mine.can_manage_team, false) then raise exception 'Only team managers can remove people'; end if;
  select * into victim from people where id = target;
  if victim.id is null then raise exception 'Person not found'; end if;
  if victim.id = mine.id then raise exception 'You can''t remove yourself'; end if;
  if coalesce(victim.is_admin, false) and not coalesce(mine.is_admin, false) then raise exception 'Only an administrator can remove another administrator'; end if;
  begin
    delete from people where id = target;
  exception when foreign_key_violation then
    raise exception '% is on the record of projects, handovers or meetings and can''t be deleted — untick Active to mark them as Left instead', coalesce(victim.full_name, initcap(victim.name));
  end;
end $$;
grant execute on function remove_person(uuid) to authenticated;
