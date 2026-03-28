"""
Dilly Academic Taxonomy — Complete US College Majors, Minors, Cohorts & Pre-Professional Tracks
"""

COHORTS = {
    "Software Engineering & CS": {
        "fields": ["software engineering","frontend","backend","full-stack","mobile","ios","android","cloud","devops","ai","machine learning","web development","systems engineering","embedded systems","game development"],
        "companies_boost": ["Stripe","Cloudflare","Databricks","Roblox","Figma","Airbnb","MongoDB","Asana"],
    },
    "Data Science & Analytics": {
        "fields": ["data science","data engineering","machine learning","ai","analytics","business intelligence","quantitative","statistical analysis","deep learning","nlp"],
        "companies_boost": ["Databricks","Scale AI","Cloudflare","MongoDB","Airbnb"],
    },
    "Cybersecurity & IT": {
        "fields": ["security","cybersecurity","information security","network security","cloud","devops","it","systems administration","infrastructure"],
        "companies_boost": ["Cloudflare","Okta","Verkada"],
    },
    "Electrical & Computer Engineering": {
        "fields": ["hardware","electrical engineering","embedded systems","semiconductor","robotics","signal processing","firmware","vlsi","iot"],
        "companies_boost": ["Verkada","Lucid Motors"],
    },
    "Mechanical & Aerospace Engineering": {
        "fields": ["mechanical engineering","aerospace","manufacturing","cad","thermal","robotics","materials","structural","propulsion"],
        "companies_boost": ["Lucid Motors"],
    },
    "Civil & Environmental Engineering": {
        "fields": ["civil engineering","environmental engineering","structural","geotechnical","transportation","urban planning","water resources","sustainability"],
        "companies_boost": [],
    },
    "Chemical & Biomedical Engineering": {
        "fields": ["chemical engineering","biomedical engineering","biomechanics","bioprocessing","pharmaceutical","materials science","nanotechnology"],
        "companies_boost": [],
    },
    "Finance & Accounting": {
        "fields": ["finance","accounting","investment banking","private equity","venture capital","financial analysis","financial modeling","audit","tax","corporate finance","wealth management","risk management","insurance","real estate finance"],
        "companies_boost": ["Robinhood","Brex","Affirm","Stripe"],
    },
    "Consulting & Strategy": {
        "fields": ["consulting","strategy","management consulting","business strategy","operations consulting","technology consulting","advisory"],
        "companies_boost": [],
    },
    "Marketing & Advertising": {
        "fields": ["marketing","advertising","brand management","digital marketing","social media","content marketing","seo","growth","public relations","market research","consumer insights"],
        "companies_boost": ["Airbnb","DoorDash","Pinterest","Grammarly"],
    },
    "Management & Operations": {
        "fields": ["operations","supply chain","logistics","project management","business operations","procurement","quality assurance","lean","six sigma"],
        "companies_boost": ["DoorDash","Flexport"],
    },
    "Entrepreneurship & Innovation": {
        "fields": ["product","startup","venture capital","business development","innovation","growth","go-to-market","partnerships"],
        "companies_boost": ["Stripe","Airbnb","Brex","Scale AI"],
    },
    "Economics & Public Policy": {
        "fields": ["economics","public policy","policy analysis","regulatory","government affairs","international development","research","think tank"],
        "companies_boost": [],
    },
    "Healthcare & Clinical": {
        "fields": ["healthcare","clinical","patient care","medical","hospital","nursing","pharmacy","dental","veterinary","public health","health administration","epidemiology","mental health","physical therapy","occupational therapy"],
        "companies_boost": [],
    },
    "Biotech & Pharmaceutical": {
        "fields": ["biotech","pharmaceutical","drug discovery","clinical trials","genomics","molecular biology","bioinformatics","regulatory affairs","medical devices"],
        "companies_boost": [],
    },
    "Life Sciences & Research": {
        "fields": ["research","biology","ecology","genetics","microbiology","neuroscience","lab","field research","conservation","marine biology"],
        "companies_boost": [],
    },
    "Physical Sciences & Math": {
        "fields": ["mathematics","physics","chemistry","astronomy","geology","statistics","actuarial","applied math","computational science","quantitative"],
        "companies_boost": ["Databricks","Scale AI"],
    },
    "Law & Government": {
        "fields": ["legal","law","government","public administration","regulatory","compliance","policy","legislative","judiciary","diplomatic","intelligence"],
        "companies_boost": [],
    },
    "Media & Communications": {
        "fields": ["media","journalism","broadcasting","film","television","radio","publishing","content creation","social media","communications","public relations","corporate communications"],
        "companies_boost": ["Roblox","Riot Games","Pinterest"],
    },
    "Design & Creative Arts": {
        "fields": ["design","ux","ui","graphic design","industrial design","product design","animation","visual arts","photography","fashion","interior design","architecture","creative direction","illustration"],
        "companies_boost": ["Figma","Airbnb","Pinterest","Squarespace"],
    },
    "Education & Human Development": {
        "fields": ["education","teaching","curriculum","instructional design","edtech","student affairs","higher education","k-12","special education","counseling"],
        "companies_boost": [],
    },
    "Social Sciences & Nonprofit": {
        "fields": ["social work","nonprofit","community development","humanitarian","international relations","sociology","anthropology","religious studies","philosophy","ethics","human rights","advocacy"],
        "companies_boost": [],
    },
}

MAJOR_TO_COHORT = {
    "Computer Science":"Software Engineering & CS","Computer Engineering":"Software Engineering & CS","Software Engineering":"Software Engineering & CS","Information Science":"Software Engineering & CS","Informatics":"Software Engineering & CS","Computing":"Software Engineering & CS","Computer Programming":"Software Engineering & CS","Web Development":"Software Engineering & CS","Game Design":"Software Engineering & CS","Game Development":"Software Engineering & CS","Interactive Media":"Software Engineering & CS","Computational Linguistics":"Software Engineering & CS",
    "Data Science":"Data Science & Analytics","Data Analytics":"Data Science & Analytics","Business Analytics":"Data Science & Analytics","Financial Analytics":"Finance & Accounting","Sport Analytics":"Data Science & Analytics","Sports Analytics":"Data Science & Analytics","Health Analytics":"Healthcare & Clinical","Healthcare Analytics":"Healthcare & Clinical","Applied Statistics":"Data Science & Analytics","Statistical Science":"Data Science & Analytics","Computational Science":"Data Science & Analytics","Machine Learning":"Data Science & Analytics","Artificial Intelligence":"Data Science & Analytics",
    "Cybersecurity":"Cybersecurity & IT","Information Technology":"Cybersecurity & IT","Information Systems":"Cybersecurity & IT","Management Information Systems":"Cybersecurity & IT","Computer Information Systems":"Cybersecurity & IT","Network Administration":"Cybersecurity & IT","Network Security":"Cybersecurity & IT","Digital Forensics":"Cybersecurity & IT","Cloud Computing":"Cybersecurity & IT",
    "Electrical Engineering":"Electrical & Computer Engineering","Electronics Engineering":"Electrical & Computer Engineering","Microelectronics":"Electrical & Computer Engineering","Telecommunications Engineering":"Electrical & Computer Engineering","Robotics Engineering":"Electrical & Computer Engineering","Embedded Systems":"Electrical & Computer Engineering",
    "Mechanical Engineering":"Mechanical & Aerospace Engineering","Aerospace Engineering":"Mechanical & Aerospace Engineering","Aeronautical Engineering":"Mechanical & Aerospace Engineering","Astronautical Engineering":"Mechanical & Aerospace Engineering","Manufacturing Engineering":"Mechanical & Aerospace Engineering","Automotive Engineering":"Mechanical & Aerospace Engineering","Mechatronics":"Mechanical & Aerospace Engineering","Engineering Mechanics":"Mechanical & Aerospace Engineering","Naval Architecture":"Mechanical & Aerospace Engineering","Ocean Engineering":"Mechanical & Aerospace Engineering","Marine Engineering":"Mechanical & Aerospace Engineering",
    "Civil Engineering":"Civil & Environmental Engineering","Environmental Engineering":"Civil & Environmental Engineering","Structural Engineering":"Civil & Environmental Engineering","Construction Management":"Civil & Environmental Engineering","Construction Engineering":"Civil & Environmental Engineering","Architectural Engineering":"Civil & Environmental Engineering","Urban Planning":"Civil & Environmental Engineering","Environmental Science":"Civil & Environmental Engineering","Environmental Studies":"Civil & Environmental Engineering","Environmental Policy":"Civil & Environmental Engineering","Sustainability":"Civil & Environmental Engineering",
    "Chemical Engineering":"Chemical & Biomedical Engineering","Biomedical Engineering":"Chemical & Biomedical Engineering","Bioengineering":"Chemical & Biomedical Engineering","Biological Engineering":"Chemical & Biomedical Engineering","Materials Science":"Chemical & Biomedical Engineering","Materials Engineering":"Chemical & Biomedical Engineering","Polymer Science":"Chemical & Biomedical Engineering","Nanotechnology":"Chemical & Biomedical Engineering","Nuclear Engineering":"Chemical & Biomedical Engineering","Petroleum Engineering":"Chemical & Biomedical Engineering","Mining Engineering":"Chemical & Biomedical Engineering",
    "Engineering":"Mechanical & Aerospace Engineering","General Engineering":"Mechanical & Aerospace Engineering","Engineering Science":"Mechanical & Aerospace Engineering","Engineering Physics":"Physical Sciences & Math","Engineering Management":"Management & Operations","Industrial Engineering":"Management & Operations","Systems Engineering":"Management & Operations","Operations Research":"Management & Operations",
    "Finance":"Finance & Accounting","Accounting":"Finance & Accounting","Financial Planning":"Finance & Accounting","Financial Engineering":"Finance & Accounting","Actuarial Science":"Finance & Accounting","Risk Management":"Finance & Accounting","Insurance":"Finance & Accounting","Real Estate":"Finance & Accounting","Banking":"Finance & Accounting","Taxation":"Finance & Accounting","Forensic Accounting":"Finance & Accounting",
    "Business Administration":"Consulting & Strategy","Business Management":"Consulting & Strategy","General Business":"Consulting & Strategy","Strategic Management":"Consulting & Strategy","Organizational Leadership":"Consulting & Strategy","Business Strategy":"Consulting & Strategy",
    "Marketing":"Marketing & Advertising","Advertising":"Marketing & Advertising","Public Relations":"Marketing & Advertising","Digital Marketing":"Marketing & Advertising","Market Research":"Marketing & Advertising","Sales":"Marketing & Advertising","Retail Management":"Marketing & Advertising","Fashion Merchandising":"Marketing & Advertising","Sports Marketing":"Marketing & Advertising",
    "Management":"Management & Operations","Operations Management":"Management & Operations","Supply Chain Management":"Management & Operations","Logistics":"Management & Operations","Project Management":"Management & Operations","Human Resources":"Management & Operations","Human Resource Management":"Management & Operations","Organizational Behavior":"Management & Operations","Labor Relations":"Management & Operations","Hospitality Management":"Management & Operations","Hotel Management":"Management & Operations","Restaurant Management":"Management & Operations","Tourism Management":"Management & Operations","Event Management":"Management & Operations","Sports Management":"Management & Operations","Recreation Management":"Management & Operations","Healthcare Administration":"Management & Operations","Health Services Administration":"Management & Operations","Aviation Management":"Management & Operations","Agricultural Business":"Management & Operations","Agribusiness":"Management & Operations",
    "Entrepreneurship":"Entrepreneurship & Innovation","Innovation Management":"Entrepreneurship & Innovation","Technology Management":"Entrepreneurship & Innovation","Social Entrepreneurship":"Entrepreneurship & Innovation","Product Management":"Entrepreneurship & Innovation",
    "Economics":"Economics & Public Policy","Applied Economics":"Economics & Public Policy","Econometrics":"Economics & Public Policy","Political Economy":"Economics & Public Policy","Public Policy":"Economics & Public Policy","Public Administration":"Economics & Public Policy","Urban Studies":"Economics & Public Policy","International Relations":"Economics & Public Policy","International Affairs":"Economics & Public Policy","International Studies":"Economics & Public Policy","International Business":"Economics & Public Policy","Global Studies":"Economics & Public Policy","Diplomacy":"Economics & Public Policy","Development Studies":"Economics & Public Policy","Peace Studies":"Economics & Public Policy",
    "Nursing":"Healthcare & Clinical","Pre-Nursing":"Healthcare & Clinical","Health Science":"Healthcare & Clinical","Health Sciences":"Healthcare & Clinical","Allied Health":"Healthcare & Clinical","Public Health":"Healthcare & Clinical","Community Health":"Healthcare & Clinical","Global Health":"Healthcare & Clinical","Epidemiology":"Healthcare & Clinical","Clinical Laboratory Science":"Healthcare & Clinical","Medical Technology":"Healthcare & Clinical","Radiologic Technology":"Healthcare & Clinical","Respiratory Therapy":"Healthcare & Clinical","Physical Therapy":"Healthcare & Clinical","Occupational Therapy":"Healthcare & Clinical","Speech-Language Pathology":"Healthcare & Clinical","Audiology":"Healthcare & Clinical","Athletic Training":"Healthcare & Clinical","Exercise Science":"Healthcare & Clinical","Kinesiology":"Healthcare & Clinical","Sports Medicine":"Healthcare & Clinical","Nutrition":"Healthcare & Clinical","Dietetics":"Healthcare & Clinical","Food Science":"Healthcare & Clinical","Dental Hygiene":"Healthcare & Clinical","Pharmacy":"Healthcare & Clinical","Pharmaceutical Sciences":"Healthcare & Clinical","Physician Assistant Studies":"Healthcare & Clinical","Emergency Medical Services":"Healthcare & Clinical","Mental Health Counseling":"Healthcare & Clinical","Rehabilitation Sciences":"Healthcare & Clinical","Health Informatics":"Healthcare & Clinical","Veterinary Science":"Healthcare & Clinical","Veterinary Technology":"Healthcare & Clinical",
    "Biotechnology":"Biotech & Pharmaceutical","Bioinformatics":"Biotech & Pharmaceutical","Biostatistics":"Biotech & Pharmaceutical","Molecular Biology":"Biotech & Pharmaceutical","Molecular Genetics":"Biotech & Pharmaceutical","Genomics":"Biotech & Pharmaceutical","Pharmacology":"Biotech & Pharmaceutical","Toxicology":"Biotech & Pharmaceutical","Biomedical Sciences":"Biotech & Pharmaceutical",
    "Biology":"Life Sciences & Research","Biological Sciences":"Life Sciences & Research","Biochemistry":"Life Sciences & Research","Cell Biology":"Life Sciences & Research","Microbiology":"Life Sciences & Research","Genetics":"Life Sciences & Research","Neuroscience":"Life Sciences & Research","Cognitive Science":"Life Sciences & Research","Ecology":"Life Sciences & Research","Evolutionary Biology":"Life Sciences & Research","Marine Biology":"Life Sciences & Research","Zoology":"Life Sciences & Research","Botany":"Life Sciences & Research","Plant Biology":"Life Sciences & Research","Wildlife Biology":"Life Sciences & Research","Conservation Biology":"Life Sciences & Research","Forestry":"Life Sciences & Research","Natural Resources":"Life Sciences & Research","Agriculture":"Life Sciences & Research","Agricultural Science":"Life Sciences & Research","Animal Science":"Life Sciences & Research","Horticulture":"Life Sciences & Research","Soil Science":"Life Sciences & Research","Fisheries":"Life Sciences & Research",
    "Mathematics":"Physical Sciences & Math","Applied Mathematics":"Physical Sciences & Math","Statistics":"Physical Sciences & Math","Physics":"Physical Sciences & Math","Applied Physics":"Physical Sciences & Math","Astrophysics":"Physical Sciences & Math","Astronomy":"Physical Sciences & Math","Chemistry":"Physical Sciences & Math","Geology":"Physical Sciences & Math","Geophysics":"Physical Sciences & Math","Earth Science":"Physical Sciences & Math","Atmospheric Science":"Physical Sciences & Math","Meteorology":"Physical Sciences & Math","Oceanography":"Physical Sciences & Math","Geography":"Physical Sciences & Math","Geographic Information Science":"Physical Sciences & Math",
    "Political Science":"Law & Government","Government":"Law & Government","Legal Studies":"Law & Government","Pre-Law":"Law & Government","Paralegal Studies":"Law & Government","Criminal Justice":"Law & Government","Criminology":"Law & Government","Forensic Science":"Law & Government","Homeland Security":"Law & Government","Intelligence Studies":"Law & Government","National Security":"Law & Government","Military Science":"Law & Government","Law Enforcement":"Law & Government","Emergency Management":"Law & Government",
    "Communications":"Media & Communications","Communication Studies":"Media & Communications","Mass Communications":"Media & Communications","Journalism":"Media & Communications","Broadcast Journalism":"Media & Communications","Digital Journalism":"Media & Communications","Media Studies":"Media & Communications","Media Production":"Media & Communications","Film Studies":"Media & Communications","Film Production":"Media & Communications","Cinema Studies":"Media & Communications","Television Production":"Media & Communications","Screenwriting":"Media & Communications","Publishing":"Media & Communications","Technical Writing":"Media & Communications","Professional Writing":"Media & Communications","Creative Writing":"Media & Communications","Rhetoric":"Media & Communications","Speech Communication":"Media & Communications","Strategic Communication":"Media & Communications","Digital Media":"Media & Communications","Multimedia":"Media & Communications","New Media":"Media & Communications",
    "Graphic Design":"Design & Creative Arts","Visual Communication":"Design & Creative Arts","UX Design":"Design & Creative Arts","UI Design":"Design & Creative Arts","Interaction Design":"Design & Creative Arts","Product Design":"Design & Creative Arts","Industrial Design":"Design & Creative Arts","Interior Design":"Design & Creative Arts","Fashion Design":"Design & Creative Arts","Architecture":"Design & Creative Arts","Landscape Architecture":"Design & Creative Arts","Fine Arts":"Design & Creative Arts","Studio Art":"Design & Creative Arts","Art":"Design & Creative Arts","Art History":"Design & Creative Arts","Visual Arts":"Design & Creative Arts","Painting":"Design & Creative Arts","Sculpture":"Design & Creative Arts","Photography":"Design & Creative Arts","Illustration":"Design & Creative Arts","Animation":"Design & Creative Arts","Motion Graphics":"Design & Creative Arts","Music":"Design & Creative Arts","Music Performance":"Design & Creative Arts","Music Education":"Design & Creative Arts","Music Production":"Design & Creative Arts","Music Business":"Design & Creative Arts","Music Technology":"Design & Creative Arts","Music Therapy":"Design & Creative Arts","Theater":"Design & Creative Arts","Theatre Arts":"Design & Creative Arts","Acting":"Design & Creative Arts","Musical Theater":"Design & Creative Arts","Drama":"Design & Creative Arts","Dance":"Design & Creative Arts","Arts Administration":"Design & Creative Arts",
    "Education":"Education & Human Development","Elementary Education":"Education & Human Development","Secondary Education":"Education & Human Development","Early Childhood Education":"Education & Human Development","Special Education":"Education & Human Development","Mathematics Education":"Education & Human Development","Science Education":"Education & Human Development","English Education":"Education & Human Development","Physical Education":"Education & Human Development","Curriculum and Instruction":"Education & Human Development","Educational Leadership":"Education & Human Development","Educational Technology":"Education & Human Development","Instructional Design":"Education & Human Development","School Counseling":"Education & Human Development","Higher Education":"Education & Human Development","Student Affairs":"Education & Human Development","Adult Education":"Education & Human Development","TESOL":"Education & Human Development","Bilingual Education":"Education & Human Development","Child Development":"Education & Human Development","Human Development":"Education & Human Development","Family Science":"Education & Human Development","Family Studies":"Education & Human Development","Gerontology":"Education & Human Development",
    "Sociology":"Social Sciences & Nonprofit","Anthropology":"Social Sciences & Nonprofit","Archaeology":"Social Sciences & Nonprofit","Psychology":"Social Sciences & Nonprofit","Clinical Psychology":"Social Sciences & Nonprofit","Developmental Psychology":"Social Sciences & Nonprofit","Social Psychology":"Social Sciences & Nonprofit","Industrial-Organizational Psychology":"Social Sciences & Nonprofit","Behavioral Science":"Social Sciences & Nonprofit","Social Work":"Social Sciences & Nonprofit","Human Services":"Social Sciences & Nonprofit","Nonprofit Management":"Social Sciences & Nonprofit","Social Justice":"Social Sciences & Nonprofit","Gender Studies":"Social Sciences & Nonprofit","Women\'s Studies":"Social Sciences & Nonprofit","Ethnic Studies":"Social Sciences & Nonprofit","African American Studies":"Social Sciences & Nonprofit","Latino Studies":"Social Sciences & Nonprofit","Asian American Studies":"Social Sciences & Nonprofit","Native American Studies":"Social Sciences & Nonprofit","Disability Studies":"Social Sciences & Nonprofit","History":"Social Sciences & Nonprofit","Philosophy":"Social Sciences & Nonprofit","Ethics":"Social Sciences & Nonprofit","Religious Studies":"Social Sciences & Nonprofit","Theology":"Social Sciences & Nonprofit","Classics":"Social Sciences & Nonprofit","English":"Social Sciences & Nonprofit","English Literature":"Social Sciences & Nonprofit","Comparative Literature":"Social Sciences & Nonprofit","Linguistics":"Social Sciences & Nonprofit","Applied Linguistics":"Social Sciences & Nonprofit","French":"Social Sciences & Nonprofit","Spanish":"Social Sciences & Nonprofit","German":"Social Sciences & Nonprofit","Italian":"Social Sciences & Nonprofit","Chinese":"Social Sciences & Nonprofit","Japanese":"Social Sciences & Nonprofit","Korean":"Social Sciences & Nonprofit","Arabic":"Social Sciences & Nonprofit","Russian":"Social Sciences & Nonprofit","Sign Language":"Social Sciences & Nonprofit","Liberal Arts":"Social Sciences & Nonprofit","Liberal Studies":"Social Sciences & Nonprofit","General Studies":"Social Sciences & Nonprofit","Interdisciplinary Studies":"Social Sciences & Nonprofit","Humanities":"Social Sciences & Nonprofit","American Studies":"Social Sciences & Nonprofit","Cultural Studies":"Social Sciences & Nonprofit",
}

PRE_PROFESSIONAL_TRACKS = {
    "Pre-Med":"Healthcare & Clinical","Pre-Medicine":"Healthcare & Clinical","Pre-Medical":"Healthcare & Clinical","Pre-Health":"Healthcare & Clinical",
    "Pre-Dental":"Healthcare & Clinical","Pre-Dentistry":"Healthcare & Clinical",
    "Pre-Vet":"Healthcare & Clinical","Pre-Veterinary":"Healthcare & Clinical",
    "Pre-PA":"Healthcare & Clinical","Pre-Physician Assistant":"Healthcare & Clinical",
    "Pre-Nursing":"Healthcare & Clinical",
    "Pre-Pharmacy":"Biotech & Pharmaceutical",
    "Pre-Optometry":"Healthcare & Clinical",
    "Pre-Physical Therapy":"Healthcare & Clinical",
    "Pre-Occupational Therapy":"Healthcare & Clinical",
    "Pre-Law":"Law & Government","Pre-Legal":"Law & Government",
    "Pre-Theology":"Social Sciences & Nonprofit","Pre-Seminary":"Social Sciences & Nonprofit",
    "Pre-Business":"Consulting & Strategy",
    "Pre-Engineering":"Mechanical & Aerospace Engineering",
}

def get_cohort(major, pre_professional_track=None):
    if pre_professional_track:
        track_key = pre_professional_track.strip()
        if track_key in PRE_PROFESSIONAL_TRACKS:
            return PRE_PROFESSIONAL_TRACKS[track_key]
        # Only fuzzy match if the track looks like a pre-professional track (starts with "Pre")
        track_lower = track_key.lower()
        if track_lower.startswith("pre"):
            for t, cohort in PRE_PROFESSIONAL_TRACKS.items():
                if t.lower() in track_lower or track_lower in t.lower():
                    return cohort
    if not major:
        return "Social Sciences & Nonprofit"
    if major in MAJOR_TO_COHORT:
        return MAJOR_TO_COHORT[major]
    major_lower = major.lower().strip()
    for m, cohort in MAJOR_TO_COHORT.items():
        if m.lower() == major_lower:
            return cohort
    for m, cohort in MAJOR_TO_COHORT.items():
        if major_lower in m.lower() or m.lower() in major_lower:
            return cohort
    return "Social Sciences & Nonprofit"

def get_cohort_fields(cohort_name):
    return COHORTS.get(cohort_name, {}).get("fields", [])

def get_cohort_boosted_companies(cohort_name):
    return COHORTS.get(cohort_name, {}).get("companies_boost", [])

def get_all_majors():
    return sorted(MAJOR_TO_COHORT.keys())

def get_all_cohorts():
    return sorted(COHORTS.keys())

def get_all_pre_professional_tracks():
    return sorted(set(PRE_PROFESSIONAL_TRACKS.keys()))

