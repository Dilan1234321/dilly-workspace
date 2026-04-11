-- Generated resumes: stores AI-tailored resumes per user per job
CREATE TABLE IF NOT EXISTS generated_resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    job_title TEXT NOT NULL,
    company TEXT NOT NULL,
    job_description TEXT,
    sections JSONB NOT NULL DEFAULT '[]',
    cohort TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_generated_resumes_student ON generated_resumes(student_id);
CREATE INDEX idx_generated_resumes_created ON generated_resumes(created_at DESC);
