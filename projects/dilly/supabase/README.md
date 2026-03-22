# Supabase migrations

Apply SQL in `migrations/` in filename order (e.g. Supabase Dashboard → SQL, or `supabase db push` if you use the CLI).

`20260320120000_student_core_schema.sql` defines the **student core** tables from the product spec (`users`, `verification_codes`, `audit_results`, `deadlines`, `applications`). The live Dilly API today still uses filesystem-backed profiles and existing auth; wiring the FastAPI app to these tables is a separate migration step.
