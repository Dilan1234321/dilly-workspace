-- Seed list of YouTube search queries per cohort. Curated to find high-signal
-- learning content rather than news or vlogs. Edit freely; the ingest script
-- re-ranks and re-scores on every run, so changes take effect the next night.

BEGIN;

INSERT INTO skill_lab_cohort_queries (cohort, query, weight) VALUES
-- Software Engineering & CS
('Software Engineering & CS', 'system design interview', 1.2),
('Software Engineering & CS', 'data structures and algorithms tutorial', 1.0),
('Software Engineering & CS', 'react tutorial full course', 1.0),
('Software Engineering & CS', 'typescript tutorial advanced', 1.0),
('Software Engineering & CS', 'rust programming tutorial', 0.9),
('Software Engineering & CS', 'clean code principles', 1.0),

-- Data Science & Analytics
('Data Science & Analytics', 'SQL for data science', 1.2),
('Data Science & Analytics', 'python pandas tutorial', 1.0),
('Data Science & Analytics', 'statistics for data science', 1.1),
('Data Science & Analytics', 'machine learning from scratch', 1.0),
('Data Science & Analytics', 'data science interview questions', 1.0),
('Data Science & Analytics', 'tableau tutorial', 0.8),

-- Cybersecurity & IT
('Cybersecurity & IT', 'tryhackme walkthrough', 1.2),
('Cybersecurity & IT', 'network security fundamentals', 1.0),
('Cybersecurity & IT', 'ethical hacking tutorial', 1.0),
('Cybersecurity & IT', 'CompTIA Security+ study guide', 1.1),
('Cybersecurity & IT', 'linux for hackers', 1.0),

-- Electrical & Computer Engineering
('Electrical & Computer Engineering', 'digital electronics tutorial', 1.0),
('Electrical & Computer Engineering', 'signals and systems', 1.1),
('Electrical & Computer Engineering', 'embedded systems programming', 1.0),
('Electrical & Computer Engineering', 'verilog tutorial', 0.9),

-- Mechanical & Aerospace Engineering
('Mechanical & Aerospace Engineering', 'solidworks tutorial beginner', 1.0),
('Mechanical & Aerospace Engineering', 'finite element analysis', 1.1),
('Mechanical & Aerospace Engineering', 'thermodynamics explained', 1.0),
('Mechanical & Aerospace Engineering', 'fluid mechanics fundamentals', 1.0),

-- Civil & Environmental Engineering
('Civil & Environmental Engineering', 'structural analysis tutorial', 1.0),
('Civil & Environmental Engineering', 'AutoCAD civil 3D', 0.9),
('Civil & Environmental Engineering', 'geotechnical engineering', 1.0),

-- Chemical & Biomedical Engineering
('Chemical & Biomedical Engineering', 'mass transfer lectures', 1.0),
('Chemical & Biomedical Engineering', 'biomedical signal processing', 1.0),
('Chemical & Biomedical Engineering', 'process control tutorial', 0.9),

-- Finance & Accounting
('Finance & Accounting', 'financial modeling tutorial', 1.2),
('Finance & Accounting', 'investment banking interview', 1.1),
('Finance & Accounting', 'DCF valuation tutorial', 1.1),
('Finance & Accounting', 'accounting basics', 1.0),
('Finance & Accounting', 'CFA level 1 study', 1.0),

-- Consulting & Strategy
('Consulting & Strategy', 'case interview prep', 1.3),
('Consulting & Strategy', 'mckinsey case study', 1.1),
('Consulting & Strategy', 'business frameworks explained', 1.0),

-- Marketing & Advertising
('Marketing & Advertising', 'copywriting tutorial', 1.0),
('Marketing & Advertising', 'digital marketing full course', 1.0),
('Marketing & Advertising', 'brand positioning strategy', 1.0),

-- Management & Operations
('Management & Operations', 'supply chain management basics', 1.0),
('Management & Operations', 'lean six sigma introduction', 1.0),
('Management & Operations', 'project management fundamentals', 1.0),

-- Entrepreneurship & Innovation
('Entrepreneurship & Innovation', 'how to start a startup', 1.1),
('Entrepreneurship & Innovation', 'customer discovery interviews', 1.1),
('Entrepreneurship & Innovation', 'pitch deck examples', 1.0),

-- Economics & Public Policy
('Economics & Public Policy', 'microeconomics lectures', 1.0),
('Economics & Public Policy', 'macroeconomics explained', 1.0),
('Economics & Public Policy', 'econometrics tutorial', 1.1),

-- Healthcare & Clinical
('Healthcare & Clinical', 'MCAT prep', 1.1),
('Healthcare & Clinical', 'anatomy and physiology lectures', 1.0),
('Healthcare & Clinical', 'NCLEX review', 1.0),

-- Biotech & Pharmaceutical
('Biotech & Pharmaceutical', 'molecular biology lectures', 1.0),
('Biotech & Pharmaceutical', 'pharmacology basics', 1.0),
('Biotech & Pharmaceutical', 'CRISPR tutorial', 1.1),

-- Life Sciences & Research
('Life Sciences & Research', 'genetics crash course', 1.0),
('Life Sciences & Research', 'cell biology lectures', 1.0),
('Life Sciences & Research', 'ecology fundamentals', 0.9),

-- Physical Sciences & Math
('Physical Sciences & Math', 'linear algebra full course', 1.2),
('Physical Sciences & Math', 'calculus explained', 1.0),
('Physical Sciences & Math', 'quantum mechanics lectures', 1.1),
('Physical Sciences & Math', 'real analysis course', 1.0),

-- Law & Government
('Law & Government', 'LSAT logical reasoning', 1.2),
('Law & Government', 'constitutional law lectures', 1.0),
('Law & Government', 'how to brief a case', 1.0),

-- Media & Communications
('Media & Communications', 'journalism writing tutorial', 1.0),
('Media & Communications', 'public speaking masterclass', 1.1),
('Media & Communications', 'interviewing techniques', 0.9),

-- Design & Creative Arts
('Design & Creative Arts', 'UI UX design course', 1.1),
('Design & Creative Arts', 'figma tutorial', 1.0),
('Design & Creative Arts', 'typography fundamentals', 1.0),

-- Education & Human Development
('Education & Human Development', 'pedagogy lectures', 1.0),
('Education & Human Development', 'classroom management strategies', 1.0),
('Education & Human Development', 'developmental psychology', 1.0),

-- Social Sciences & Nonprofit
('Social Sciences & Nonprofit', 'research methods qualitative', 1.0),
('Social Sciences & Nonprofit', 'political science introduction', 1.0),
('Social Sciences & Nonprofit', 'nonprofit management basics', 0.9)

ON CONFLICT (cohort, query) DO UPDATE SET weight = EXCLUDED.weight;

COMMIT;
