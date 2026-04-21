-- Curated query expansion for every cohort. Targets specific high-signal
-- creators and courses by name — that's how we get quality, not by
-- searching generic topics. Clears the old queries and replaces with
-- ~8 queries per cohort.
--
-- Apply with:
--   psql "$DATABASE_URL" -f db/migrations/006_queries_v2_curated.sql

BEGIN;

DELETE FROM skill_lab_cohort_queries;

INSERT INTO skill_lab_cohort_queries (cohort, query, weight) VALUES
-- ═══ Software Engineering & CS ═══
('Software Engineering & CS', 'NeetCode leetcode solutions', 1.3),
('Software Engineering & CS', 'ByteByteGo system design', 1.3),
('Software Engineering & CS', 'system design interview mock', 1.2),
('Software Engineering & CS', 'data structures and algorithms course', 1.1),
('Software Engineering & CS', 'clean code principles', 1.0),
('Software Engineering & CS', 'Fireship web development', 1.0),
('Software Engineering & CS', 'ThePrimeagen code review', 1.0),
('Software Engineering & CS', 'SOLID principles object oriented', 1.0),
('Software Engineering & CS', 'coding interview preparation tutorial', 1.1),
('Software Engineering & CS', 'backend architecture microservices', 1.0),

-- ═══ Data Science & Analytics ═══
('Data Science & Analytics', 'StatQuest machine learning', 1.3),
('Data Science & Analytics', '3Blue1Brown linear algebra', 1.3),
('Data Science & Analytics', 'Ken Jee data science projects', 1.2),
('Data Science & Analytics', 'Luke Barousse data analyst', 1.2),
('Data Science & Analytics', 'SQL window functions tutorial', 1.1),
('Data Science & Analytics', 'pandas python tutorial Corey Schafer', 1.1),
('Data Science & Analytics', 'A/B testing statistics explained', 1.0),
('Data Science & Analytics', 'machine learning fundamentals Andrew Ng', 1.2),
('Data Science & Analytics', 'data science interview questions', 1.1),
('Data Science & Analytics', 'data visualization matplotlib seaborn', 1.0),

-- ═══ Cybersecurity & IT ═══
('Cybersecurity & IT', 'Professor Messer Security+', 1.3),
('Cybersecurity & IT', 'TryHackMe beginner walkthrough', 1.2),
('Cybersecurity & IT', 'HackTheBox walkthrough', 1.1),
('Cybersecurity & IT', 'David Bombal networking CCNA', 1.2),
('Cybersecurity & IT', 'John Hammond malware analysis', 1.1),
('Cybersecurity & IT', 'OWASP Top 10 explained', 1.1),
('Cybersecurity & IT', 'Burp Suite penetration testing', 1.0),
('Cybersecurity & IT', 'NetworkChuck cybersecurity', 1.1),
('Cybersecurity & IT', 'incident response SOC analyst', 1.0),
('Cybersecurity & IT', 'Kali Linux beginner tutorial', 1.0),

-- ═══ Electrical & Computer Engineering ═══
('Electrical & Computer Engineering', 'Ben Eater computer from scratch', 1.3),
('Electrical & Computer Engineering', 'Neso Academy digital electronics', 1.3),
('Electrical & Computer Engineering', 'signals and systems MIT OpenCourseWare', 1.2),
('Electrical & Computer Engineering', 'Verilog tutorial FPGA', 1.1),
('Electrical & Computer Engineering', 'microcontroller embedded C programming', 1.1),
('Electrical & Computer Engineering', 'operational amplifier circuit analysis', 1.0),
('Electrical & Computer Engineering', 'ARM assembly programming tutorial', 1.0),
('Electrical & Computer Engineering', 'Khan Academy electrical engineering', 1.1),
('Electrical & Computer Engineering', 'embedded Linux development', 1.0),

-- ═══ Mechanical & Aerospace Engineering ═══
('Mechanical & Aerospace Engineering', 'The Efficient Engineer mechanical', 1.3),
('Mechanical & Aerospace Engineering', 'Lesics mechanical engineering', 1.2),
('Mechanical & Aerospace Engineering', 'Real Engineering aerospace', 1.2),
('Mechanical & Aerospace Engineering', 'SolidWorks tutorial complete course', 1.1),
('Mechanical & Aerospace Engineering', 'ANSYS finite element analysis tutorial', 1.1),
('Mechanical & Aerospace Engineering', 'thermodynamics MIT lecture', 1.2),
('Mechanical & Aerospace Engineering', 'fluid mechanics fundamentals', 1.1),
('Mechanical & Aerospace Engineering', 'machine design elements tutorial', 1.0),
('Mechanical & Aerospace Engineering', 'rocket propulsion fundamentals', 1.0),

-- ═══ Civil & Environmental Engineering ═══
('Civil & Environmental Engineering', 'Practical Engineering Grady', 1.3),
('Civil & Environmental Engineering', 'structural analysis beams lecture', 1.2),
('Civil & Environmental Engineering', 'AutoCAD Civil 3D complete tutorial', 1.1),
('Civil & Environmental Engineering', 'geotechnical engineering soil mechanics', 1.1),
('Civil & Environmental Engineering', 'reinforced concrete design tutorial', 1.1),
('Civil & Environmental Engineering', 'transportation engineering highway design', 1.0),
('Civil & Environmental Engineering', 'hydraulics fluid mechanics civil', 1.0),
('Civil & Environmental Engineering', 'construction project management', 1.0),
('Civil & Environmental Engineering', 'environmental engineering water treatment', 1.0),

-- ═══ Chemical & Biomedical Engineering ═══
('Chemical & Biomedical Engineering', 'LearnChemE chemical engineering', 1.3),
('Chemical & Biomedical Engineering', 'mass transfer operations lecture', 1.2),
('Chemical & Biomedical Engineering', 'reactor design chemical engineering', 1.2),
('Chemical & Biomedical Engineering', 'process control engineering tutorial', 1.1),
('Chemical & Biomedical Engineering', 'biomedical engineering introduction', 1.2),
('Chemical & Biomedical Engineering', 'bioprocess engineering fundamentals', 1.0),
('Chemical & Biomedical Engineering', 'drug delivery systems biomedical', 1.0),
('Chemical & Biomedical Engineering', 'medical device design biomedical', 1.0),

-- ═══ Finance & Accounting ═══
('Finance & Accounting', 'Aswath Damodaran valuation', 1.3),
('Finance & Accounting', 'Corporate Finance Institute DCF', 1.3),
('Finance & Accounting', 'Wall Street Prep financial modeling', 1.2),
('Finance & Accounting', 'three statement financial model tutorial', 1.2),
('Finance & Accounting', 'investment banking interview questions', 1.2),
('Finance & Accounting', 'CFA Level 1 study guide', 1.1),
('Finance & Accounting', 'LBO model tutorial leveraged buyout', 1.1),
('Finance & Accounting', 'accounting fundamentals debits credits', 1.0),
('Finance & Accounting', 'equity research report tutorial', 1.0),
('Finance & Accounting', 'discounted cash flow valuation', 1.2),

-- ═══ Consulting & Strategy ═══
('Consulting & Strategy', 'Victor Cheng case interview', 1.3),
('Consulting & Strategy', 'McKinsey case interview tutorial', 1.3),
('Consulting & Strategy', 'Management Consulted case prep', 1.2),
('Consulting & Strategy', 'Craft Your Case BCG Bain', 1.2),
('Consulting & Strategy', 'market sizing framework consulting', 1.1),
('Consulting & Strategy', 'profitability case interview', 1.1),
('Consulting & Strategy', 'business strategy frameworks Porter', 1.1),
('Consulting & Strategy', 'MBA case study method', 1.0),
('Consulting & Strategy', 'management consulting fit interview', 1.0),

-- ═══ Marketing & Advertising ═══
('Marketing & Advertising', 'Neil Patel SEO tutorial', 1.2),
('Marketing & Advertising', 'HubSpot inbound marketing academy', 1.2),
('Marketing & Advertising', 'copywriting masterclass fundamentals', 1.2),
('Marketing & Advertising', 'Google Ads complete tutorial', 1.1),
('Marketing & Advertising', 'Facebook Meta ads tutorial', 1.1),
('Marketing & Advertising', 'brand strategy positioning', 1.2),
('Marketing & Advertising', 'growth marketing framework', 1.1),
('Marketing & Advertising', 'content marketing strategy', 1.0),
('Marketing & Advertising', 'conversion rate optimization tutorial', 1.0),
('Marketing & Advertising', 'marketing analytics fundamentals', 1.0),

-- ═══ Management & Operations ═══
('Management & Operations', 'PMP project management preparation', 1.3),
('Management & Operations', 'Agile Scrum master tutorial', 1.2),
('Management & Operations', 'lean six sigma yellow belt', 1.2),
('Management & Operations', 'operations management MIT lecture', 1.1),
('Management & Operations', 'supply chain management fundamentals', 1.2),
('Management & Operations', 'process improvement Kaizen tutorial', 1.0),
('Management & Operations', 'logistics supply chain tutorial', 1.0),
('Management & Operations', 'Operations Management Jacobs', 1.0),
('Management & Operations', 'productivity systems OKR', 1.0),

-- ═══ Entrepreneurship & Innovation ═══
('Entrepreneurship & Innovation', 'Y Combinator how to start a startup', 1.3),
('Entrepreneurship & Innovation', 'Stanford how to start startup Sam Altman', 1.3),
('Entrepreneurship & Innovation', 'Steve Blank customer discovery', 1.2),
('Entrepreneurship & Innovation', 'pitch deck fundraising Sequoia', 1.2),
('Entrepreneurship & Innovation', 'product market fit startup', 1.2),
('Entrepreneurship & Innovation', 'SaaS metrics unit economics', 1.1),
('Entrepreneurship & Innovation', 'lean startup methodology Eric Ries', 1.1),
('Entrepreneurship & Innovation', 'founder interview Y Combinator', 1.0),
('Entrepreneurship & Innovation', 'seed fundraising VC pitch', 1.0),
('Entrepreneurship & Innovation', 'startup school YC lecture', 1.2),

-- ═══ Economics & Public Policy ═══
('Economics & Public Policy', 'Marginal Revolution University', 1.3),
('Economics & Public Policy', 'Khan Academy microeconomics', 1.2),
('Economics & Public Policy', 'Khan Academy macroeconomics', 1.2),
('Economics & Public Policy', 'econometrics lecture MIT', 1.2),
('Economics & Public Policy', 'public policy analysis introduction', 1.1),
('Economics & Public Policy', 'game theory introduction Yale', 1.2),
('Economics & Public Policy', 'behavioral economics Kahneman', 1.1),
('Economics & Public Policy', 'economic development lectures', 1.0),
('Economics & Public Policy', 'principles of economics Mankiw', 1.1),

-- ═══ Healthcare & Clinical ═══
('Healthcare & Clinical', 'Kaplan MCAT prep', 1.3),
('Healthcare & Clinical', 'Dirty Medicine USMLE', 1.3),
('Healthcare & Clinical', 'Osmosis from Elsevier medical', 1.3),
('Healthcare & Clinical', 'Picmonic medical mnemonics', 1.2),
('Healthcare & Clinical', 'ICU Advantage nursing', 1.2),
('Healthcare & Clinical', 'anatomy physiology Crash Course', 1.2),
('Healthcare & Clinical', 'pharmacology made easy', 1.1),
('Healthcare & Clinical', 'clinical reasoning pre-med', 1.0),
('Healthcare & Clinical', 'NCLEX RN review', 1.1),
('Healthcare & Clinical', 'pathology made simple', 1.0),

-- ═══ Biotech & Pharmaceutical ═══
('Biotech & Pharmaceutical', 'biochemistry tutorial lecture', 1.3),
('Biotech & Pharmaceutical', 'CRISPR Cas9 explained science', 1.2),
('Biotech & Pharmaceutical', 'drug discovery process pharmaceutical', 1.2),
('Biotech & Pharmaceutical', 'pharmacology fundamentals lecture', 1.2),
('Biotech & Pharmaceutical', 'molecular cloning protocol tutorial', 1.1),
('Biotech & Pharmaceutical', 'pharmaceutical industry overview', 1.1),
('Biotech & Pharmaceutical', 'bioinformatics tutorial beginner', 1.0),
('Biotech & Pharmaceutical', 'FDA drug regulation process', 1.0),
('Biotech & Pharmaceutical', 'iBiology seminars research', 1.1),

-- ═══ Life Sciences & Research ═══
('Life Sciences & Research', 'Amoeba Sisters biology', 1.3),
('Life Sciences & Research', 'Crash Course biology', 1.3),
('Life Sciences & Research', 'iBiology research seminars', 1.2),
('Life Sciences & Research', 'molecular biology fundamentals', 1.2),
('Life Sciences & Research', 'genetics Mendelian crosses', 1.1),
('Life Sciences & Research', 'ecology ecosystems biology', 1.1),
('Life Sciences & Research', 'evolution phylogenetics lecture', 1.1),
('Life Sciences & Research', 'cell biology MIT lecture', 1.2),
('Life Sciences & Research', 'biology research methods tutorial', 1.0),

-- ═══ Physical Sciences & Math ═══
('Physical Sciences & Math', '3Blue1Brown essence of linear algebra', 1.3),
('Physical Sciences & Math', '3Blue1Brown essence of calculus', 1.3),
('Physical Sciences & Math', 'Professor Leonard calculus', 1.3),
('Physical Sciences & Math', 'Organic Chemistry Tutor', 1.3),
('Physical Sciences & Math', 'MIT OpenCourseWare linear algebra', 1.2),
('Physical Sciences & Math', 'PatrickJMT calculus tutorial', 1.1),
('Physical Sciences & Math', 'quantum mechanics Leonard Susskind', 1.2),
('Physical Sciences & Math', 'real analysis lecture', 1.1),
('Physical Sciences & Math', 'MIT physics 8.01 Walter Lewin', 1.2),
('Physical Sciences & Math', 'Stanford probability introduction', 1.1),

-- ═══ Law & Government ═══
('Law & Government', 'Khan Academy LSAT prep', 1.3),
('Law & Government', '7sage LSAT tutorial', 1.3),
('Law & Government', 'constitutional law lectures Yale', 1.2),
('Law & Government', 'how to brief a case law school', 1.2),
('Law & Government', 'LegalEagle law explained', 1.1),
('Law & Government', 'legal reasoning IRAC method', 1.1),
('Law & Government', 'American government civics Crash Course', 1.1),
('Law & Government', 'Supreme Court oral arguments', 1.0),
('Law & Government', 'international law introduction', 1.0),

-- ═══ Media & Communications ═══
('Media & Communications', 'journalism fundamentals reporting', 1.2),
('Media & Communications', 'public speaking masterclass TED', 1.3),
('Media & Communications', 'TED Talk storytelling', 1.2),
('Media & Communications', 'Vox video production', 1.1),
('Media & Communications', 'interview techniques journalism', 1.1),
('Media & Communications', 'podcasting complete tutorial', 1.1),
('Media & Communications', 'copywriting for journalism', 1.0),
('Media & Communications', 'media literacy critical thinking', 1.0),
('Media & Communications', 'Nancy Duarte presentation', 1.1),

-- ═══ Design & Creative Arts ═══
('Design & Creative Arts', 'The Futur design masterclass', 1.3),
('Design & Creative Arts', 'AJ&Smart UX design sprint', 1.3),
('Design & Creative Arts', 'Figma complete tutorial', 1.2),
('Design & Creative Arts', 'typography fundamentals design', 1.2),
('Design & Creative Arts', 'design systems tutorial', 1.1),
('Design & Creative Arts', 'brand identity design process', 1.2),
('Design & Creative Arts', 'Adobe Illustrator complete course', 1.1),
('Design & Creative Arts', 'color theory for designers', 1.1),
('Design & Creative Arts', 'UX research methods interview', 1.1),
('Design & Creative Arts', 'motion design principles', 1.0),

-- ═══ Education & Human Development ═══
('Education & Human Development', 'classroom management strategies teachers', 1.3),
('Education & Human Development', 'Edutopia teaching strategies', 1.2),
('Education & Human Development', 'developmental psychology Crash Course', 1.2),
('Education & Human Development', 'Piaget Vygotsky developmental', 1.1),
('Education & Human Development', 'pedagogy lecture education', 1.1),
('Education & Human Development', 'differentiated instruction tutorial', 1.1),
('Education & Human Development', 'Universal Design Learning UDL', 1.0),
('Education & Human Development', 'assessment in education formative', 1.0),
('Education & Human Development', 'social emotional learning SEL', 1.0),

-- ═══ Social Sciences & Nonprofit ═══
('Social Sciences & Nonprofit', 'qualitative research methods tutorial', 1.3),
('Social Sciences & Nonprofit', 'Crash Course sociology', 1.3),
('Social Sciences & Nonprofit', 'Crash Course political science', 1.2),
('Social Sciences & Nonprofit', 'Crash Course anthropology', 1.2),
('Social Sciences & Nonprofit', 'nonprofit management fundamentals', 1.2),
('Social Sciences & Nonprofit', 'program evaluation methods', 1.1),
('Social Sciences & Nonprofit', 'grant writing tutorial nonprofit', 1.1),
('Social Sciences & Nonprofit', 'social work ethics practice', 1.1),
('Social Sciences & Nonprofit', 'research methods social science', 1.1)

ON CONFLICT (cohort, query) DO UPDATE SET weight = EXCLUDED.weight;

COMMIT;
