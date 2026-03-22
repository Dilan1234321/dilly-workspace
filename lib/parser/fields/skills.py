"""
Layer 3 — Skills extraction.
"""
import re
from typing import List, Set

from ..types import ExtractedField, ExtractedSkills

# Canonical dictionaries by category.
PROGRAMMING_LANGUAGES: Set[str] = {
    "python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "golang",
    "rust", "kotlin", "swift", "scala", "ruby", "php", "perl", "r", "matlab",
    "julia", "dart", "objective-c", "bash", "powershell", "groovy", "fortran",
    "haskell", "lua", "assembly", "sql", "pl/sql", "t-sql", "sas", "abap",
}
FRAMEWORKS_AND_LIBS: Set[str] = {
    "react", "next.js", "angular", "vue", "svelte", "nuxt", "gatsby", "redux",
    "node", "node.js", "express", "nestjs", "django", "flask", "fastapi",
    "spring", "spring boot", "rails", "laravel", "asp.net", ".net", "blazor",
    "tensorflow", "pytorch", "keras", "scikit-learn", "sklearn", "xgboost",
    "lightgbm", "opencv", "pandas", "numpy", "matplotlib", "seaborn", "plotly",
    "hadoop", "spark", "pyspark", "airflow", "dbt", "streamlit", "gradio",
    "graphql", "rest api", "grpc", "socket.io", "tailwind", "bootstrap",
}
CLOUD_AND_DEVOPS: Set[str] = {
    "aws", "amazon web services", "ec2", "s3", "lambda", "rds", "dynamodb",
    "cloudwatch", "cloudformation", "gcp", "google cloud", "bigquery", "vertex ai",
    "azure", "azure functions", "azure devops", "docker", "kubernetes", "helm",
    "terraform", "ansible", "jenkins", "github actions", "gitlab ci", "circleci",
    "travis ci", "prometheus", "grafana", "datadog", "new relic", "splunk",
    "nginx", "apache", "linux", "unix", "git", "svn", "bitbucket",
}
DATABASES_AND_DATA: Set[str] = {
    "mysql", "postgresql", "postgres", "mongodb", "redis", "sqlite", "oracle",
    "sql server", "snowflake", "redshift", "cassandra", "dynamodb", "firebase",
    "elasticsearch", "neo4j", "couchbase", "hive", "presto", "trino", "kafka",
    "rabbitmq", "databricks", "looker", "power bi", "tableau", "qlik",
}
PRODUCTIVITY_TOOLS: Set[str] = {
    "excel", "word", "powerpoint", "outlook", "access", "visio", "onedrive",
    "google sheets", "google docs", "google slides", "google analytics",
    "google ads", "adobe photoshop", "photoshop", "illustrator", "after effects",
    "premiere pro", "indesign", "figma", "sketch", "canva", "miro", "notion",
    "jira", "confluence", "asana", "trello", "monday.com", "smartsheet", "airtable",
    "slack", "zoom", "teams", "sharepoint", "servicenow",
}
FINANCE_AND_BUSINESS_TOOLS: Set[str] = {
    "bloomberg", "bloomberg terminal", "bloomberg market concepts",
    "factset", "capital iq", "pitchbook", "thomson reuters eikon", "refinitiv",
    "quickbooks", "netsuite", "sap", "oracle erp", "workday", "tableau crm",
    "salesforce", "hubspot", "zoho crm", "marketo", "pardot", "mailchimp",
    "ga4", "amplitude", "mixpanel", "hotjar",
}
SOFT_SKILLS: Set[str] = {
    "communication", "written communication", "verbal communication", "leadership",
    "teamwork", "collaboration", "problem solving", "critical thinking", "adaptability",
    "creativity", "time management", "project management", "stakeholder management",
    "public speaking", "negotiation", "mentorship", "cross-functional collaboration",
    "attention to detail", "decision making", "conflict resolution",
}

KNOWN_SKILLS: Set[str] = (
    PROGRAMMING_LANGUAGES
    | FRAMEWORKS_AND_LIBS
    | CLOUD_AND_DEVOPS
    | DATABASES_AND_DATA
    | PRODUCTIVITY_TOOLS
    | FINANCE_AND_BUSINESS_TOOLS
    | SOFT_SKILLS
)

# Extended long-tail coverage to support broader ATS extraction across domains.
EXTRA_SKILLS: Set[str] = {
    "html", "css", "scss", "sass", "less", "xml", "json", "yaml", "toml", "protobuf",
    "webpack", "vite", "rollup", "babel", "eslint", "prettier", "jest", "vitest", "cypress",
    "playwright", "selenium", "puppeteer", "storybook", "chakra ui", "material ui", "ant design",
    "styled-components", "emotion", "rxjs", "mobx", "zustand", "apollo", "relay",
    "microservices", "event-driven architecture", "domain-driven design", "oop", "functional programming",
    "design patterns", "clean architecture", "system design", "distributed systems", "websockets",
    "oauth", "jwt", "saml", "openid connect", "ldap", "active directory", "rbac", "abac",
    "penetration testing", "owasp", "siem", "soc", "incident response", "threat modeling",
    "wireshark", "nmap", "metasploit", "burp suite", "snort", "suricata", "crowdstrike",
    "sentinelone", "okta", "duo", "iam", "secrets management", "vault",
    "etl", "elt", "data warehousing", "data modeling", "dimensional modeling", "star schema",
    "feature engineering", "model deployment", "mlops", "a/b testing", "statistical modeling",
    "hypothesis testing", "time series", "nlp", "computer vision", "recommendation systems",
    "langchain", "llamaindex", "prompt engineering", "vector databases", "pinecone", "weaviate",
    "milvus", "faiss", "chroma", "rag", "openai api", "anthropic api",
    "word2vec", "bert", "transformers", "hugging face", "onnx", "triton inference server",
    "cuda", "opencl", "mpi", "parallel computing", "high performance computing", "hpc",
    "embedded systems", "arduino", "raspberry pi", "fpga", "verilog", "vhdl", "rtos",
    "ios", "android", "react native", "flutter", "xcode", "android studio", "swiftui",
    "kotlin multiplatform", "unity", "unreal engine", "godot", "3d modeling", "blender",
    "maya", "cinema 4d", "autocad", "solidworks", "catia", "ansys", "comsol",
    "jira service management", "servicenow itsm", "incident management", "change management",
    "itil", "scrum", "kanban", "safe", "agile", "waterfall", "prince2",
    "ms project", "wrike", "basecamp", "clickup", "linear", "youtrack",
    "crm", "erp", "hris", "sap hana", "sap fico", "sap mm", "sap sd",
    "oracle fusion", "dynamics 365", "netsuite erp", "workiva",
    "ifrs", "gaap", "financial modeling", "valuation", "dcf", "lbo", "mergers and acquisitions",
    "account reconciliation", "auditing", "tax preparation", "forecasting", "budgeting",
    "treasury management", "risk management", "portfolio management", "equity research",
    "fixed income", "derivatives", "options pricing", "monte carlo simulation",
    "sas enterprise guide", "minitab", "eviews", "gretl", "stochastic calculus",
    "biochemistry", "molecular biology", "cell culture", "western blot", "pcr", "qpcr",
    "crispr", "gel electrophoresis", "flow cytometry", "mass spectrometry", "hplc", "gc-ms",
    "elisa", "microscopy", "immunohistochemistry", "animal handling", "clinical research",
    "ehr", "epic", "cerner", "meditech", "hipaa", "cpt coding", "icd-10",
    "public health", "epidemiology", "biostatistics",
    "legal research", "lexisnexis", "westlaw", "contract drafting", "case management",
    "ediscovery", "intellectual property", "compliance", "regulatory affairs",
    "seo", "sem", "content marketing", "social media marketing", "email marketing",
    "brand strategy", "market research", "customer segmentation", "copywriting", "google tag manager",
    "meta ads manager", "tiktok ads", "linkedin ads", "programmatic advertising",
    "ux research", "ui design", "wireframing", "prototyping", "usability testing",
    "accessibility", "wcag", "design systems", "information architecture",
    "customer success", "sales enablement", "business development", "account management",
    "cold outreach", "pipeline management", "sales operations", "revops",
    "supply chain", "logistics", "inventory management", "procurement", "demand planning",
    "lean six sigma", "kaizen", "quality assurance", "quality control", "iso 9001",
    "manufacturing", "plc programming", "scada", "cad/cam",
    "teaching", "curriculum development", "instructional design", "classroom management",
    "training delivery", "coaching", "mentoring", "facilitation",
    "multilingual", "spanish", "french", "german", "mandarin", "arabic", "hindi",
    "portuguese", "italian", "japanese", "korean", "russian",
}

KNOWN_SKILLS |= EXTRA_SKILLS


def extract_skills(
    skills_section_text: str,
    experience_section_text: str,
) -> ExtractedField:
    """From skills section: split on delimiters. From experience: match known skills."""
    all_skills: Set[str] = set()
    technical: List[str] = []
    soft: List[str] = []
    tools: List[str] = []
    languages: List[str] = []

    # Skills section
    if skills_section_text:
        parts = re.split(r"[,|•·;/\n]", skills_section_text)
        for p in parts:
            p = re.sub(r"\(?(expert|advanced|intermediate|beginner|proficient|familiar|basic|native|fluent)\)?", "", p, flags=re.I).strip()
            p = re.sub(r"\d+\+?\s+years?", "", p, flags=re.I).strip()
            if 1 < len(p) < 50:
                all_skills.add(p)

    # Experience section - known skills
    combined = (skills_section_text or "") + "\n" + (experience_section_text or "")
    text_lower = combined.lower()
    for skill in KNOWN_SKILLS:
        if re.search(r"\b" + re.escape(skill) + r"\b", text_lower):
            all_skills.add(skill)

    # Categorize
    for s in sorted(all_skills, key=lambda x: x.lower()):
        low = s.lower()
        if low in SOFT_SKILLS:
            soft.append(s)
        elif low in PROGRAMMING_LANGUAGES:
            languages.append(s)
            technical.append(s)
        elif low in FRAMEWORKS_AND_LIBS or low in CLOUD_AND_DEVOPS or low in DATABASES_AND_DATA:
            technical.append(s)
        elif low in PRODUCTIVITY_TOOLS or low in FINANCE_AND_BUSINESS_TOOLS:
            tools.append(s)
        else:
            # Heuristic fallback
            if any(k in low for k in ("sql", "api", "cloud", "server", "python", "java", "react", "docker", "kubernetes")):
                technical.append(s)
            elif any(k in low for k in ("communication", "leadership", "team", "collab", "management")):
                soft.append(s)
            else:
                tools.append(s)

    result = ExtractedSkills(
        technical=technical,
        soft=soft,
        tools=tools,
        languages=languages,
        all=sorted(all_skills, key=lambda x: x.lower()),
    )
    confidence = "high" if len(all_skills) > 3 else "medium" if all_skills else "low"
    return ExtractedField(value=result, confidence=confidence, strategy="regex+dict", raw=skills_section_text[:300] if skills_section_text else None)
