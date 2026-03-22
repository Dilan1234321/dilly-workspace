-- Dilly student core schema (run in Supabase SQL editor or `supabase db push`).
-- If you already have similarly named tables, resolve conflicts before applying.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  major TEXT,
  minor TEXT,
  track TEXT,
  application_target TEXT,
  school TEXT,
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  final_score INTEGER,
  smart INTEGER,
  grit INTEGER,
  build INTEGER,
  track TEXT,
  findings JSONB,
  recommendations JSONB,
  raw_audit JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  company TEXT NOT NULL,
  event_type TEXT,
  due_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  company TEXT NOT NULL,
  role TEXT,
  status TEXT DEFAULT 'applied',
  applied_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes (email);
CREATE INDEX IF NOT EXISTS idx_audit_results_user_created ON audit_results (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deadlines_user_due ON deadlines (user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_applications_user_updated ON applications (user_id, updated_at DESC);
