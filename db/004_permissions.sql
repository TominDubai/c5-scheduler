set search_path = scheduler, public;

alter table people
  add column can_edit_estimation boolean not null default false,
  add column can_edit_projects boolean not null default false;

insert into people(name, full_name, role, email, can_edit_estimation, can_edit_projects) values
  ('JEAN',   'Jean',   'ADMIN',      'jean@concept-5.com',   true,  true),
  ('DARREN', 'Darren Dinglasan', 'MANAGEMENT', 'darren@concept-5.com', false, true),
  ('INFO',   'Concept 5 office', 'ADMIN',   'info@concept-5.com',   false, true)
on conflict (name) do update set email = excluded.email, can_edit_estimation = excluded.can_edit_estimation, can_edit_projects = excluded.can_edit_projects;

update people set email = 'ramus@concept-5.com',    can_edit_estimation = true,  can_edit_projects = false where name = 'RAMUS';
update people set email = 'giorgina@concept-5.com', can_edit_estimation = true,  can_edit_projects = false where name = 'GEORGIE';
update people set email = 'jinky@concept-5.com',    can_edit_estimation = true,  can_edit_projects = true  where name = 'JINKY';
update people set email = 'aftab@concept-5.com',    can_edit_estimation = false, can_edit_projects = true  where name = 'AFTAB';
update people set email = 'tom@concept-5.com',      can_edit_estimation = false, can_edit_projects = true  where name = 'TOM';
insert into people(name, full_name, role, email, can_edit_estimation, can_edit_projects) values ('TOM-BOLSOVER', 'Tom Brooks', 'MANAGEMENT', 'tom@bolsovercontracting.com', true, true) on conflict (name) do nothing;

create or replace function me() returns people language sql stable set search_path = scheduler, public as $$
  select * from scheduler.people where email is not null and lower(email) = lower(coalesce(auth.jwt()->>'email','')) limit 1
$$;
grant execute on function me() to authenticated;

drop policy if exists write_team on projects;
drop policy if exists write_team on variations;
drop policy if exists write_team on contractors;

create policy insert_rows on projects for insert to authenticated
  with check ((me()).can_edit_projects or ((me()).can_edit_estimation and status = 'QUOTE'));
create policy update_rows on projects for update to authenticated
  using ((me()).can_edit_projects or ((me()).can_edit_estimation and status = 'QUOTE'))
  with check ((me()).can_edit_projects or ((me()).can_edit_estimation and status in ('QUOTE','DESIGN_DRAWINGS','LOST')));
create policy delete_rows on projects for delete to authenticated using ((me()).can_edit_projects);
create policy write_vos on variations for all to authenticated using ((me()).can_edit_projects) with check ((me()).can_edit_projects);
create policy add_contractor on contractors for insert to authenticated with check ((me()).can_edit_projects or (me()).can_edit_estimation);
