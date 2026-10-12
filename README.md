# C5 Project Scheduler

Concept 5's project pipeline tracker — replaces `CONCEPT_5-_PROJECT_2026.xlsx`.

- `app/` — Next.js app (deployed on Vercel). Root directory for Vercel is `app`.
- `db/` — Supabase schema and seed for the `scheduler` schema inside the c5-os project.
- `import/` — Excel clean-up and import scripts, import report.
- `design/` — the two design-direction pages (Studio was chosen).

Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Change notifications

Significant project changes (status, PM/designer, dates, signed quote, VOs, new projects) are logged by trigger to `scheduler.change_log` (`db/008_change_log.sql`). Every 10 minutes pg_cron POSTs to `/api/notify`, which groups the unsent changes per person and sends one email each via Resend (`app/src/lib/notify.ts`). Projects edited in the last 3 minutes are held for the next run; whoever made the change isn't emailed about their own edit.

Extra env vars on Vercel: `NOTIFY_SECRET` (same value as the `scheduler_notify_secret` entry in Supabase Vault), `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`.
Dry run: `GET /api/notify` with `Authorization: Bearer <NOTIFY_SECRET>` shows who would be emailed without sending.
