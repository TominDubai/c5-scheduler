-- 009: Team page — people with project-edit rights can maintain the team list (names, emails, WhatsApp, active flag, add people).
-- Permission flags (can_edit_*) are deliberately NOT editable from the app; change them in SQL.
set search_path = scheduler, public;

create policy update_people on people for update to authenticated
  using ((me()).can_edit_projects) with check ((me()).can_edit_projects);
create policy insert_people on people for insert to authenticated
  with check ((me()).can_edit_projects and can_edit_projects = false and can_edit_estimation = false);

-- stop the app from flipping permission flags even with the update policy above
create or replace function protect_people_flags() returns trigger language plpgsql set search_path = scheduler, public as $$
begin
  if auth.role() = 'authenticated' and (new.can_edit_projects is distinct from old.can_edit_projects or new.can_edit_estimation is distinct from old.can_edit_estimation) then
    raise exception 'Permissions can only be changed by an administrator';
  end if;
  return new;
end $$;
create trigger trg_protect_people_flags before update on people for each row execute function protect_people_flags();
