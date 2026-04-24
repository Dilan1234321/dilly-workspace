"""
Candidate company slugs for ATS discovery.

A big list of potential Greenhouse / Lever / Ashby slugs to probe.
Most will 404 — that's expected. The discovery pass hits each against
the vendor's public API; successful hits get persisted into
`discovered_boards` for the main crawler to pick up on every run.

Sources:
  - Y Combinator public company directory (top ~2,000 W23-F25 cos)
  - Known tech unicorns + Series B+ from public news
  - Fortune 1000 + adjacent enterprise
  - Climate tech / biotech / fintech curated sets

This file intentionally contains more candidates than will succeed —
wider net means more discovered boards. Dedup is handled at probe time.

Format: lowercase, hyphen-separated, no whitespace. The same name may
appear multiple times in different format variants (e.g. 'stripe-inc'
+ 'stripe') since different companies use different conventions.
"""

# Curated as lowercase a-z0-9- slugs. We try the exact slug as-is
# against each vendor's public board API. Most 404; successful ones
# get persisted.
CANDIDATE_SLUGS: list[str] = [
    # ── AI / ML / LLMs ──────────────────────────────────────────
    "anthropic", "openai", "xai", "cohere", "mistral", "mistralai", "ai21labs",
    "inflection", "adept", "character-ai", "characterai", "replicate",
    "huggingface", "stability", "stabilityai", "runwayml", "midjourney",
    "pika-labs", "pikalabs", "elevenlabs", "eleven", "suno", "udio",
    "perplexity", "glean", "harvey", "harvey-ai", "hebbia", "magic",
    "magic-dev", "sierra", "sierra-ai", "decagon", "decagon-ai",
    "together-ai", "togetherxyz", "fireworks", "fireworks-ai",
    "replicate-com", "modal", "modal-labs", "baseten", "lamini",
    "groq", "cerebras", "tenstorrent", "sambanova", "rain",
    "rain-ai", "lightmatter", "luminous-ai", "psiquantum", "quantinuum",
    "ionq", "rigetti", "atom-computing", "quera", "pasqal",
    "ambient", "ambient-ai", "cresta", "observe-ai", "regal",
    "regal-ai", "augment", "imbue", "reka", "reka-ai",
    "poolside", "cognition", "devin", "cursor", "cursor-so",
    "bolt-new", "lovable", "vercel-v0", "codeium", "supermaven",
    "warp", "warpdotdev", "zed", "zed-industries", "fig-io",
    "raycast", "raycast-app", "arc-browser", "the-browser-company",
    "thebrowsercompany", "continuedev", "aider-ai", "sweep-dev",
    "langchain", "langchain-ai", "llamaindex", "langfuse", "braintrust",
    "weights-and-biases", "wandb", "comet-ml", "labelbox", "scale",
    "scaleai", "snorkel", "snorkel-ai", "arize", "arize-ai", "truera",
    "gantry", "fiddler-ai", "whylabs", "galileo-ai", "humanloop",
    "promptlayer", "pinecone", "weaviate", "qdrant", "chroma",
    "trychroma", "milvus", "vectara", "marqo", "lancedb",
    "convex", "convex-dev", "temporal", "temporal-tech",

    # ── Dev tooling / infra ─────────────────────────────────────
    "netlify", "vercel", "render", "fly-io", "fly", "railway", "railway-app",
    "cloudflare", "fastly", "bunny-net", "cdn77", "akamai",
    "aws", "gcp", "azure",
    "supabase", "firebase", "planetscale", "neon", "neondatabase", "xata",
    "cockroachdb", "cockroach-labs", "scylla", "scylladb", "yugabyte",
    "materialize", "rockset", "singlestore", "imply", "tinybird",
    "redpanda", "confluent", "kafka", "aiven", "snowflake",
    "databricks", "motherduck", "firebolt", "starburst", "dremio",
    "datacoral", "trino", "presto", "clickhouse",
    "grafana", "grafana-labs", "prometheus", "prometheus-io",
    "datadoghq", "datadog", "splunk", "newrelic", "dynatrace",
    "appdynamics", "sumologic", "sumo-logic", "honeycomb", "lightstep",
    "chronosphere", "cribl", "observe", "observe-inc", "lumigo",
    "sentry", "sentry-io", "rollbar", "bugsnag", "loggly",
    "statuspage", "better-stack", "betteruptime", "pingdom", "uptimerobot",
    "opsgenie", "pagerduty", "incident-io", "incident", "firehydrant",
    "rootly", "blameless", "blameless-io", "courier", "twilio",
    "plivo", "vonage", "bandwidth", "messagebird", "sinch",
    "sendgrid", "mailgun", "postmark", "resend", "loops",
    "customer-io", "customerio", "braze", "iterable", "klaviyo",
    "mailchimp", "activecampaign", "drip", "omnisend", "postscript",
    "attentive", "attentive-inc", "klaviyo-inc",
    "algolia", "meilisearch", "typesense", "elastic", "elasticsearch",
    "mongodb", "mongodb-inc", "redis", "redis-io", "memcached",
    "couchbase", "arangodb", "dgraph", "neo4j", "surrealdb",
    "edgedb", "prisma", "prismaio",
    "docker", "docker-inc", "kubernetes", "canonical", "redhat",
    "suse", "tanzu",
    "hashicorp", "terraform", "ansible", "pulumi", "chef",
    "puppet", "spacelift", "env0", "scalr", "terraform-cloud",
    "github", "gitlab", "bitbucket", "sourcehut",
    "jira", "atlassian", "linear", "linear-app", "height", "shortcut",
    "clickup", "monday", "asana", "notion", "airtable",
    "tana", "capacities", "obsidian", "roam", "logseq",
    "circleci", "buildkite", "codefresh", "semaphore", "drone",
    "harness", "harness-io", "jenkins", "teamcity",
    "launchdarkly", "statsig", "growthbook", "flagsmith", "devcycle",
    "split-software", "optimizely", "amplitude", "mixpanel",
    "heap", "posthog", "pendo", "fullstory", "hotjar",
    "rudderstack", "segment", "segment-io", "mparticle", "hightouch",
    "census",

    # ── Fintech ──────────────────────────────────────────────────
    "stripe", "square", "block", "shopify", "plaid",
    "paddle", "lemon-squeezy", "revenuecat", "recharge", "rechargepayments",
    "adyen", "checkout", "checkoutcom", "rapyd", "nium",
    "airwallex", "brex", "ramp", "mercury", "novo", "novofund",
    "chime", "sofi", "varo", "current", "step",
    "dave", "cashapp", "venmo", "zelle",
    "robinhood", "public", "webull", "moomoo", "tastyworks",
    "alpaca", "alpaca-markets", "tradier", "questrade",
    "wealthfront", "betterment", "ellevest", "personalcapital",
    "plaid-inc", "finix", "finix-payments", "modern-treasury",
    "unit", "unit21", "column", "column-tax", "treasury-prime",
    "highnote", "lithic", "marqeta", "bond", "synapse",
    "galileo-ft", "ncino", "nCino", "affirm", "klarna", "afterpay",
    "sezzle", "paypal", "stripe-atlas", "mercury-bank",
    "deel", "remote-com", "oyster", "velocity-global", "omnipresent",
    "rippling", "gusto", "justworks", "trinet", "paychex",
    "carta", "pulley", "angellist-venture", "republic",
    "forge-global", "equityzen", "ourcrowd",
    "nerdwallet", "creditkarma", "lendingtree", "sofi-inc",
    "truework", "argyle", "atomic", "atomicfi",

    # ── Consumer / e-commerce / DTC ─────────────────────────────
    "airbnb", "doordash", "instacart", "uber", "lyft", "grubhub", "postmates",
    "gopuff", "goPuff", "chowbus", "wonder", "wondershake",
    "deliveroo", "just-eat", "swiggy", "zomato",
    "opendoor", "zillow", "redfin", "compass", "better-com",
    "offerpad", "homelight",
    "faire", "faire-wholesale", "thrasio", "perch",
    "rec-room", "roblox", "epic-games", "riot", "unity", "unity3d",
    "chainguard", "anchore", "sysdig", "aquasec", "snyk",
    "wiz-io", "orca-security", "lacework", "bridgecrew",
    # DTC
    "warby-parker", "allbirds", "bombas", "rothys", "glossier",
    "casper", "purple", "leesa", "saatva", "nectar-sleep",
    "harrys", "dollar-shave-club", "billie", "hims", "hers",
    "roman-rory", "ro-co", "forhims", "forhers",
    "stitch-fix", "rent-the-runway", "thredup", "poshmark", "depop",
    "goat", "stockx", "grailed", "the-realreal", "vestiaire",
    "peloton", "tonal", "hydrow", "tempo", "mirror",
    "oura", "ourahealth", "whoop", "fitbit", "garmin",
    "headspace", "calm", "better-help", "talkspace", "cerebral",
    "noom", "weightwatchers", "futurefit", "future-app",
    # Media + social
    "spotify", "pandora", "tidal", "soundcloud",
    "netflix", "hulu", "disney", "disneycareers",
    "discord", "slack", "slack-tech", "telegram", "signal-app",
    "pinterest", "reddit", "twitter", "x-company", "threads-app",
    "substack", "medium", "ghost", "beehiiv", "convertkit",
    "patreon", "onlyfans", "buymeacoffee",

    # ── Healthcare / biotech ────────────────────────────────────
    "flatiron", "flatiron-health", "tempus", "tempus-labs", "tempusai",
    "guardant-health", "grail", "exact-sciences", "myriad-genetics",
    "10x-genomics", "illumina", "twist-bioscience", "ginkgo",
    "ginkgo-bioworks", "zymergen", "berkeley-lights", "nautilus",
    "singular-genomics", "pacific-biosciences", "oxford-nanopore",
    "absci", "relay-therapeutics", "vertex", "vertex-pharmaceuticals",
    "biogen", "moderna", "biontech", "regeneron", "alnylam",
    "bluebird-bio", "crispr-therapeutics", "editas", "intellia",
    "sana-biotech", "beam-therapeutics", "verve-therapeutics",
    "pathai", "paige-ai", "recursion", "insitro", "schrodinger",
    "schrödinger", "atomwise", "benevolentai", "exscientia",
    "isomorphic-labs", "isomorphic", "generate-biomedicines",
    "terray-therapeutics",
    "oscar-health", "oscar", "bright-health", "alignment-healthcare",
    "devoted-health", "clover-health", "cityblock-health",
    "one-medical", "onemedical", "forward-health", "forward",
    "carbon-health", "firefly-health", "fireflyhealth", "ro-health",
    "talkspace-inc", "lyra-health", "spring-health", "modern-health",
    "omada-health", "teladoc", "amwell", "mdlive",
    "zocdoc", "solv-health", "zocdoc-careers",
    "olive", "olive-ai", "augmedix", "notable-health",
    "maven-clinic", "kindbody", "cofertility", "carrot-fertility",
    "progyny",

    # ── Climate / energy / mobility ─────────────────────────────
    "tesla", "rivian", "lucidmotors", "lucid-motors", "polestar",
    "nio", "xpeng", "li-auto",
    "waymo", "cruise", "zoox", "aurora", "motional", "nuro",
    "argo-ai", "embark", "embark-trucks", "kodiak-robotics",
    "torc-robotics", "aurora-innovation", "applied-intuition",
    "redwood-materials", "form-energy", "commonwealth-fusion",
    "helion-energy", "helion", "tae-technologies",
    "fusion-industry", "quaise",
    "climeworks", "carbon-engineering", "charm-industrial",
    "running-tide", "ebb-carbon", "heirloom-carbon",
    "pachama", "sylvera", "patch-io", "watershed", "watershed-tech",
    "persefoni", "normative", "normative-io", "sweep-earth",
    "palmetto", "palmetto-com", "sunrun", "sunnova", "sunpower",
    "tesla-energy",
    "northvolt", "quantum-scape", "solid-power", "sila-nanotech",
    "relativity-space", "spacex", "blue-origin", "planet-labs",
    "astranis", "varda", "varda-space", "vast-space", "stoke-space",
    "impulse-space", "firefly-aerospace", "rocket-lab",

    # ── Security ────────────────────────────────────────────────
    "okta", "auth0", "clerk", "clerk-inc", "workos", "workos-inc",
    "descope", "stytch", "frontegg",
    "1password", "bitwarden", "dashlane", "keepersecurity", "lastpass",
    "duo-security", "duosecurity", "cisco-duo", "yubico", "trezor",
    "tanium", "crowdstrike", "sentinelone", "carbon-black",
    "cybereason", "cylance", "cynet",
    "palo-alto-networks", "paloalto", "fortinet", "checkpoint",
    "zscaler", "netskope", "menlo-security", "island",
    "lookout", "mobile-iron", "jamf", "kandji", "addigy",
    "beyond-trust", "beyondtrust", "cyberark", "delinea",
    "snyk-io", "checkmarx", "veracode", "semgrep", "socket",
    "chainguard-dev", "anchore-io", "aquasecurity",
    "huntress", "huntresslabs", "red-canary", "arctic-wolf",
    "dragos", "claroty", "nozomi-networks",

    # ── Enterprise SaaS / productivity ──────────────────────────
    "workday", "workiva", "anaplan", "blackline", "coupa",
    "freshworks", "freshworks-inc", "zendesk", "helpscout", "intercom",
    "frontapp", "front", "gorgias", "hiver", "missive",
    "calendly", "doodle", "hubspot-calendar", "savvycal",
    "docusign", "dropbox-sign", "hellosign", "adobe-sign", "pandadoc",
    "notion-inc", "coda-io", "craft-docs", "bear-app", "ulysses",
    "miro-inc", "mural", "figjam", "whimsical", "creately",
    "framer", "webflow", "squarespace", "wix", "shopify-inc",
    "contentful", "sanity-io", "sanityio", "strapi", "storyblok",
    "prismic", "hygraph", "payload-cms", "payloadcms",
    "loom", "vidyard", "wistia", "brightcove", "mux",
    "superhuman", "hey-com", "front-inc", "spike-email",
    "clickup-inc", "clickup-app",

    # ── Logistics / operations ──────────────────────────────────
    "flexport", "shippo", "easypost", "shipbob", "shipmonk",
    "convoy", "convoy-inc", "loadsmart", "uber-freight",
    "trackman", "project44", "fourkites",
    "samsara", "samsara-inc", "motive", "motive-com", "keeptruckin",
    "zipline", "skydio", "wingcopter", "matternet",
    "shield-ai", "anduril", "anduril-industries", "saronic",
    "epirus",

    # ── Consulting / services / legal ───────────────────────────
    "mckinsey", "bain", "boston-consulting-group", "bcg",
    "deloitte", "ey", "pwc", "kpmg", "accenture",
    "capgemini", "genpact", "infosys", "wipro", "tata-consultancy",
    "oliver-wyman", "kearney", "lek-consulting", "adlittle",
    "zs-associates", "alvarez-marsal", "fti-consulting",
    "guidepoint", "alphasights", "third-bridge", "glg",
    "clio", "clio-legal", "everlaw", "relativity", "logikcull",
    "lexisnexis", "thomson-reuters", "bloomberg-law",

    # ── Education / edtech ──────────────────────────────────────
    "duolingo", "coursera", "udemy", "skillshare", "masterclass",
    "chegg", "quizlet", "brainly", "socratic",
    "khan-academy", "khanacademy", "outschool", "codecademy",
    "brilliant", "brilliant-org", "outlier-org",
    "turing", "turingcom", "lambda-school", "bloomtech",
    "andela", "toptal-team",
    "nearpod", "clever-inc", "powerschool", "blackboard",
    "canvas-inst", "instructure",
    "prodigy-math", "epic-reading", "ixl-learning", "renaissance",

    # ── Misc high-signal ────────────────────────────────────────
    "handshake", "wellfound", "welcomeplatform", "lever-co",
    "greenhouse-software", "ashby-hq", "ashbyhq",
    "workable", "workableinc",
    "betterup", "sanebox", "airkit", "superhuman-mail",
]
