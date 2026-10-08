# C5 Project Scheduler

Concept 5's project pipeline tracker — replaces `CONCEPT_5-_PROJECT_2026.xlsx`.

- `app/` — Next.js app (deployed on Vercel). Root directory for Vercel is `app`.
- `db/` — Supabase schema and seed for the `scheduler` schema inside the c5-os project.
- `import/` — Excel clean-up and import scripts, import report.
- `design/` — the two design-direction pages (Studio was chosen).

Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
