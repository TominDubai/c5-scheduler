-- 016a: Workflow Rev 3 — new roles (plan: C5-Workflow-Rev3_Plan_v1.md, 28 Oct 2026).
-- Enum values must be committed before they can be used, so this is its own file; 016b does the rest.
set search_path = scheduler, public;

alter type person_role add value if not exists 'PROJECT_COORDINATOR';
alter type person_role add value if not exists 'PROCUREMENT';
alter type person_role add value if not exists 'STORE';
alter type person_role add value if not exists 'ACCOUNTS';
alter type person_role add value if not exists 'SALES';
