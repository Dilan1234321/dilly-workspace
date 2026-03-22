-- Add multi-major, multi-minor, and pre-professional track columns to users table.
-- The legacy `major` (TEXT) column stays for backward compatibility — populated with majors[0].

ALTER TABLE users ADD COLUMN IF NOT EXISTS majors               JSONB   DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS minors               JSONB   DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pre_professional_track TEXT;
