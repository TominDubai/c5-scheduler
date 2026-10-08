alter view scheduler.projects_live set (security_invoker = true);
revoke select on scheduler.projects_live from anon;
revoke select on all tables in schema scheduler from anon;
