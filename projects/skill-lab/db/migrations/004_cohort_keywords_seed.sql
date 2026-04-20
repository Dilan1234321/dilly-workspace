-- Seed per-cohort keyword allowlists. A video must contain at least one keyword
-- in its title + description to qualify. Matches are substring (case-insensitive),
-- so "python" matches "Learning Python". Tune freely — the ingest re-scores every run.

BEGIN;

INSERT INTO skill_lab_cohort_keywords (cohort, keyword, weight) VALUES
-- Software Engineering & CS
('Software Engineering & CS', 'algorithm', 1.0),
('Software Engineering & CS', 'data structure', 1.0),
('Software Engineering & CS', 'system design', 1.2),
('Software Engineering & CS', 'programming', 1.0),
('Software Engineering & CS', 'coding', 1.0),
('Software Engineering & CS', 'software engineer', 1.1),
('Software Engineering & CS', 'backend', 1.0),
('Software Engineering & CS', 'frontend', 1.0),
('Software Engineering & CS', 'javascript', 1.0),
('Software Engineering & CS', 'typescript', 1.0),
('Software Engineering & CS', 'python', 1.0),
('Software Engineering & CS', 'react', 1.0),
('Software Engineering & CS', 'api', 0.8),
('Software Engineering & CS', 'database', 0.9),
('Software Engineering & CS', 'leetcode', 1.1),
('Software Engineering & CS', 'computer science', 1.1),
('Software Engineering & CS', 'clean code', 1.0),

-- Data Science & Analytics
('Data Science & Analytics', 'data science', 1.2),
('Data Science & Analytics', 'machine learning', 1.0),
('Data Science & Analytics', 'pandas', 1.0),
('Data Science & Analytics', 'sql', 1.0),
('Data Science & Analytics', 'statistics', 1.0),
('Data Science & Analytics', 'numpy', 0.9),
('Data Science & Analytics', 'data analyst', 1.1),
('Data Science & Analytics', 'jupyter', 0.9),
('Data Science & Analytics', 'regression', 1.0),
('Data Science & Analytics', 'tableau', 0.9),
('Data Science & Analytics', 'power bi', 0.9),
('Data Science & Analytics', 'data analysis', 1.0),

-- Cybersecurity & IT
('Cybersecurity & IT', 'cybersecurity', 1.2),
('Cybersecurity & IT', 'ethical hacking', 1.1),
('Cybersecurity & IT', 'penetration testing', 1.1),
('Cybersecurity & IT', 'tryhackme', 1.1),
('Cybersecurity & IT', 'hackthebox', 1.1),
('Cybersecurity & IT', 'network security', 1.0),
('Cybersecurity & IT', 'ctf', 1.0),
('Cybersecurity & IT', 'security+', 1.0),
('Cybersecurity & IT', 'linux', 0.9),
('Cybersecurity & IT', 'firewall', 0.9),
('Cybersecurity & IT', 'malware', 1.0),
('Cybersecurity & IT', 'vulnerability', 1.0),

-- Electrical & Computer Engineering
('Electrical & Computer Engineering', 'circuit', 1.0),
('Electrical & Computer Engineering', 'embedded', 1.0),
('Electrical & Computer Engineering', 'verilog', 1.0),
('Electrical & Computer Engineering', 'fpga', 1.0),
('Electrical & Computer Engineering', 'signal processing', 1.1),
('Electrical & Computer Engineering', 'digital electronics', 1.1),
('Electrical & Computer Engineering', 'microcontroller', 1.0),
('Electrical & Computer Engineering', 'arduino', 0.8),
('Electrical & Computer Engineering', 'electronics', 0.9),

-- Mechanical & Aerospace Engineering
('Mechanical & Aerospace Engineering', 'mechanical engineering', 1.2),
('Mechanical & Aerospace Engineering', 'aerospace', 1.1),
('Mechanical & Aerospace Engineering', 'thermodynamics', 1.1),
('Mechanical & Aerospace Engineering', 'solidworks', 1.0),
('Mechanical & Aerospace Engineering', 'finite element', 1.1),
('Mechanical & Aerospace Engineering', 'fluid mechanics', 1.1),
('Mechanical & Aerospace Engineering', 'cad', 0.9),
('Mechanical & Aerospace Engineering', 'dynamics', 0.9),
('Mechanical & Aerospace Engineering', 'materials science', 1.0),

-- Civil & Environmental Engineering
('Civil & Environmental Engineering', 'civil engineering', 1.2),
('Civil & Environmental Engineering', 'structural analysis', 1.1),
('Civil & Environmental Engineering', 'geotechnical', 1.1),
('Civil & Environmental Engineering', 'autocad civil', 1.0),
('Civil & Environmental Engineering', 'concrete design', 1.0),
('Civil & Environmental Engineering', 'transportation engineering', 1.0),
('Civil & Environmental Engineering', 'environmental engineering', 1.0),

-- Chemical & Biomedical Engineering
('Chemical & Biomedical Engineering', 'chemical engineering', 1.2),
('Chemical & Biomedical Engineering', 'biomedical engineering', 1.2),
('Chemical & Biomedical Engineering', 'mass transfer', 1.1),
('Chemical & Biomedical Engineering', 'process control', 1.1),
('Chemical & Biomedical Engineering', 'bioreactor', 1.0),
('Chemical & Biomedical Engineering', 'reaction engineering', 1.0),

-- Finance & Accounting
('Finance & Accounting', 'finance', 1.0),
('Finance & Accounting', 'accounting', 1.1),
('Finance & Accounting', 'financial modeling', 1.2),
('Finance & Accounting', 'valuation', 1.1),
('Finance & Accounting', 'dcf', 1.1),
('Finance & Accounting', 'investment banking', 1.1),
('Finance & Accounting', 'cfa', 1.1),
('Finance & Accounting', 'audit', 1.0),
('Finance & Accounting', 'excel', 0.8),
('Finance & Accounting', 'balance sheet', 1.0),
('Finance & Accounting', 'income statement', 1.0),

-- Consulting & Strategy
('Consulting & Strategy', 'consulting', 1.2),
('Consulting & Strategy', 'case interview', 1.2),
('Consulting & Strategy', 'mckinsey', 1.0),
('Consulting & Strategy', 'bain', 1.0),
('Consulting & Strategy', 'bcg', 1.0),
('Consulting & Strategy', 'strategy', 1.0),
('Consulting & Strategy', 'business framework', 1.0),
('Consulting & Strategy', 'market sizing', 1.1),

-- Marketing & Advertising
('Marketing & Advertising', 'marketing', 1.1),
('Marketing & Advertising', 'advertising', 1.0),
('Marketing & Advertising', 'copywriting', 1.1),
('Marketing & Advertising', 'brand', 1.0),
('Marketing & Advertising', 'seo', 1.0),
('Marketing & Advertising', 'paid ads', 1.0),
('Marketing & Advertising', 'content marketing', 1.0),
('Marketing & Advertising', 'growth marketing', 1.1),

-- Management & Operations
('Management & Operations', 'supply chain', 1.1),
('Management & Operations', 'operations management', 1.2),
('Management & Operations', 'lean six sigma', 1.1),
('Management & Operations', 'project management', 1.1),
('Management & Operations', 'logistics', 1.0),
('Management & Operations', 'scrum', 0.9),
('Management & Operations', 'agile', 0.9),

-- Entrepreneurship & Innovation
('Entrepreneurship & Innovation', 'startup', 1.1),
('Entrepreneurship & Innovation', 'entrepreneur', 1.1),
('Entrepreneurship & Innovation', 'y combinator', 1.1),
('Entrepreneurship & Innovation', 'pitch deck', 1.1),
('Entrepreneurship & Innovation', 'product market fit', 1.1),
('Entrepreneurship & Innovation', 'venture capital', 1.0),
('Entrepreneurship & Innovation', 'fundraising', 1.0),
('Entrepreneurship & Innovation', 'founder', 1.0),

-- Economics & Public Policy
('Economics & Public Policy', 'economics', 1.1),
('Economics & Public Policy', 'microeconomics', 1.1),
('Economics & Public Policy', 'macroeconomics', 1.1),
('Economics & Public Policy', 'econometrics', 1.1),
('Economics & Public Policy', 'public policy', 1.0),
('Economics & Public Policy', 'game theory', 1.0),
('Economics & Public Policy', 'economic theory', 1.0),

-- Healthcare & Clinical
('Healthcare & Clinical', 'mcat', 1.1),
('Healthcare & Clinical', 'nclex', 1.1),
('Healthcare & Clinical', 'anatomy', 1.0),
('Healthcare & Clinical', 'physiology', 1.0),
('Healthcare & Clinical', 'nursing', 1.0),
('Healthcare & Clinical', 'clinical', 1.0),
('Healthcare & Clinical', 'medical school', 1.0),
('Healthcare & Clinical', 'pre-med', 1.0),
('Healthcare & Clinical', 'pharmacology', 0.9),

-- Biotech & Pharmaceutical
('Biotech & Pharmaceutical', 'biotech', 1.1),
('Biotech & Pharmaceutical', 'pharmaceutical', 1.1),
('Biotech & Pharmaceutical', 'molecular biology', 1.0),
('Biotech & Pharmaceutical', 'crispr', 1.1),
('Biotech & Pharmaceutical', 'drug discovery', 1.1),
('Biotech & Pharmaceutical', 'bioinformatics', 1.0),
('Biotech & Pharmaceutical', 'pharmacology', 1.0),

-- Life Sciences & Research
('Life Sciences & Research', 'biology', 1.0),
('Life Sciences & Research', 'genetics', 1.1),
('Life Sciences & Research', 'cell biology', 1.1),
('Life Sciences & Research', 'ecology', 1.0),
('Life Sciences & Research', 'evolution', 1.0),
('Life Sciences & Research', 'microbiology', 1.0),
('Life Sciences & Research', 'research methods', 1.0),

-- Physical Sciences & Math
('Physical Sciences & Math', 'calculus', 1.1),
('Physical Sciences & Math', 'linear algebra', 1.1),
('Physical Sciences & Math', 'physics', 1.0),
('Physical Sciences & Math', 'quantum mechanics', 1.1),
('Physical Sciences & Math', 'real analysis', 1.1),
('Physical Sciences & Math', 'differential equation', 1.1),
('Physical Sciences & Math', 'mathematics', 1.0),
('Physical Sciences & Math', 'chemistry', 0.9),

-- Law & Government
('Law & Government', 'lsat', 1.2),
('Law & Government', 'law school', 1.1),
('Law & Government', 'constitutional law', 1.1),
('Law & Government', 'legal', 0.9),
('Law & Government', 'case brief', 1.1),
('Law & Government', 'supreme court', 1.0),
('Law & Government', 'government', 0.9),
('Law & Government', 'public administration', 1.0),

-- Media & Communications
('Media & Communications', 'journalism', 1.1),
('Media & Communications', 'public speaking', 1.1),
('Media & Communications', 'communication skills', 1.1),
('Media & Communications', 'interview techniques', 1.0),
('Media & Communications', 'writing', 0.9),
('Media & Communications', 'storytelling', 1.0),
('Media & Communications', 'broadcasting', 1.0),

-- Design & Creative Arts
('Design & Creative Arts', 'ui design', 1.1),
('Design & Creative Arts', 'ux design', 1.1),
('Design & Creative Arts', 'figma', 1.1),
('Design & Creative Arts', 'typography', 1.0),
('Design & Creative Arts', 'graphic design', 1.1),
('Design & Creative Arts', 'design principles', 1.0),
('Design & Creative Arts', 'adobe', 0.9),
('Design & Creative Arts', 'illustrator', 0.9),

-- Education & Human Development
('Education & Human Development', 'pedagogy', 1.1),
('Education & Human Development', 'teaching', 1.0),
('Education & Human Development', 'classroom', 0.9),
('Education & Human Development', 'developmental psychology', 1.1),
('Education & Human Development', 'child development', 1.1),
('Education & Human Development', 'education theory', 1.0),
('Education & Human Development', 'lesson plan', 0.9),

-- Social Sciences & Nonprofit
('Social Sciences & Nonprofit', 'sociology', 1.0),
('Social Sciences & Nonprofit', 'political science', 1.0),
('Social Sciences & Nonprofit', 'anthropology', 1.0),
('Social Sciences & Nonprofit', 'nonprofit', 1.1),
('Social Sciences & Nonprofit', 'social work', 1.0),
('Social Sciences & Nonprofit', 'qualitative research', 1.0),
('Social Sciences & Nonprofit', 'research methods', 1.0)

ON CONFLICT (cohort, keyword) DO UPDATE SET weight = EXCLUDED.weight;


-- Per-cohort denylist (supplementing global one). Prevent common topical drift.
INSERT INTO skill_lab_cohort_denylist (cohort, phrase) VALUES
    ('Software Engineering & CS', 'phone review'),
    ('Software Engineering & CS', 'laptop review'),
    ('Software Engineering & CS', 'gaming pc'),
    ('Data Science & Analytics', 'astrology'),
    ('Cybersecurity & IT', 'crypto pump'),
    ('Finance & Accounting', 'get rich quick'),
    ('Finance & Accounting', 'forex robot'),
    ('Finance & Accounting', 'day trading academy'),
    ('Marketing & Advertising', 'make money online scam'),
    ('Entrepreneurship & Innovation', 'drop shipping secrets'),
    ('Healthcare & Clinical', 'miracle cure'),
    ('Healthcare & Clinical', 'alternative medicine scam'),
    ('Biotech & Pharmaceutical', 'conspiracy'),
    ('Physical Sciences & Math', 'flat earth'),
    ('Law & Government', 'sovereign citizen')
ON CONFLICT DO NOTHING;

COMMIT;
