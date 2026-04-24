"""
Dilly Job Crawler v2 — PostgreSQL + Multi-ATS (all job types)
"""
import json, os, re, time, uuid, urllib.request, urllib.error
from datetime import datetime, timezone
from typing import Optional
import psycopg2

DB_CONFIG = {
    "host": os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
    "database": os.environ.get("DILLY_DB_NAME", "dilly"),
    "user": os.environ.get("DILLY_DB_USER", "dilly_admin"),
    "password": os.environ.get("DILLY_DB_PASSWORD", "") or open(os.path.expanduser("~/.dilly_db_pass")).read().strip(),
    "sslmode": "require",
}

def get_db():
    return psycopg2.connect(**DB_CONFIG)

GREENHOUSE_COMPANIES = {
    # Working Greenhouse boards (verified 2026-03-25)
    'airbnb':('Airbnb','Tech'),'cloudflare':('Cloudflare','Tech'),
    'databricks':('Databricks','Tech'),'figma':('Figma','Tech'),
    'pinterest':('Pinterest','Tech'),'robinhood':('Robinhood','Finance'),
    'stripe':('Stripe','Tech'),'verkada':('Verkada','Tech'),
    'twilio':('Twilio','Tech'),'dropbox':('Dropbox','Tech'),
    'squarespace':('Squarespace','Tech'),'brex':('Brex','Finance'),
    'lyft':('Lyft','Consumer'),
    # Fixed slugs
    'doordashusa':('DoorDash','Consumer'),'scaleai':('Scale AI','Tech'),
    'mongodb':('MongoDB','Tech'),'block':('Block','Finance'),
    # New batch (verified 2026-03-25)
    'samsara':('Samsara','Tech'),'okta':('Okta','Tech'),
    'elastic':('Elastic','Tech'),'toast':('Toast','Tech'),
    'grammarly':('Grammarly','Tech'),'affirm':('Affirm','Finance'),
    'lucidmotors':('Lucid Motors','Tech'),'asana':('Asana','Tech'),
    'roblox':('Roblox','Media'),'riotgames':('Riot Games','Media'),
    # Healthcare / Health Tech (added 2026-03-26)
    'onemedical':('One Medical','Healthcare'),'zocdoc':('Zocdoc','Healthcare'),
    'cloverhealth':('Clover Health','Healthcare'),'omadahealth':('Omada Health','Healthcare'),
    'veracyte':('Veracyte','Healthcare'),'cerebral':('Cerebral','Healthcare'),
    # Education / EdTech (added 2026-03-26)
    '2u':('2U','Education'),'newsela':('Newsela','Education'),
    'clever':('Clever','Education'),'duolingo':('Duolingo','Education'),
    'khanacademy':('Khan Academy','Education'),'coursera':('Coursera','Education'),
    'masterclass':('MasterClass','Education'),
    # Finance (added 2026-03-26)
    'marqeta':('Marqeta','Finance'),'mercury':('Mercury','Finance'),
    'sofi':('SoFi','Finance'),
    # Nonprofit (added 2026-03-26)
    'codeforamerica':('Code for America','Nonprofit'),
    # Biotech / Life Sciences (added 2026-03-26)
    '10xgenomics':('10x Genomics','Biotech'),'natera':('Natera','Biotech'),
    'twistbioscience':('Twist Bioscience','Biotech'),'ginkgobioworks':('Ginkgo Bioworks','Biotech'),
    # Gov Tech (added 2026-03-26)
    'govini':('Govini','Government'),
    # More Tech + Finance (added 2026-03-26)
    'carta':('Carta','Finance'),'gusto':('Gusto','Tech'),
    'justworks':('Justworks','Tech'),'lattice':('Lattice','Tech'),
    'airtable':('Airtable','Tech'),'calendly':('Calendly','Tech'),
    'webflow':('Webflow','Tech'),'vercel':('Vercel','Tech'),
    # Big Tech (added 2026-04-12)
    'coinbase':('Coinbase','Finance'),'instacart':('Instacart','Consumer'),
    'snap':('Snap','Tech'),'reddit':('Reddit','Tech'),
    'discord':('Discord','Tech'),'github':('GitHub','Tech'),
    'plaid':('Plaid','Finance'),'notion':('Notion','Tech'),
    'canva':('Canva','Tech'),'hashicorp':('HashiCorp','Tech'),
    'datadog':('Datadog','Tech'),'hubspot':('HubSpot','Tech'),
    'gitlab':('GitLab','Tech'),'pagerduty':('PagerDuty','Tech'),
    'confluent':('Confluent','Tech'),'cockroachlabs':('Cockroach Labs','Tech'),
    'dbt-labs':('dbt Labs','Tech'),'snyk':('Snyk','Tech'),
    'mux':('Mux','Tech'),'replit':('Replit','Tech'),
    # Healthcare (added 2026-04-12)
    'oscar':('Oscar Health','Healthcare'),'cityblock':('Cityblock Health','Healthcare'),
    'ro':('Ro','Healthcare'),'hims':('Hims & Hers','Healthcare'),
    'color':('Color Health','Healthcare'),'devoted':('Devoted Health','Healthcare'),
    'flatiron':('Flatiron Health','Healthcare'),
    # Finance (added 2026-04-12)
    'chime':('Chime','Finance'),'greenlight':('Greenlight','Finance'),
    'ramp':('Ramp','Finance'),'dave':('Dave','Finance'),
    'fundrise':('Fundrise','Finance'),
    # Consumer / Retail (added 2026-04-12)
    'warbyparker':('Warby Parker','Consumer'),'glossier':('Glossier','Consumer'),
    'allbirds':('Allbirds','Consumer'),'sweetgreen':('Sweetgreen','Consumer'),
    'peloton':('Peloton','Consumer'),'gopuff':('Gopuff','Consumer'),
    # Media / Entertainment (added 2026-04-12)
    'spotify':('Spotify','Media'),'hbo':('HBO','Media'),
    'buzzfeed':('BuzzFeed','Media'),'vox':('Vox Media','Media'),
    # Real Estate / PropTech (added 2026-04-12)
    'compass':('Compass','Real Estate'),'opendoor':('Opendoor','Real Estate'),
    'offerpad':('Offerpad','Real Estate'),
    # Enterprise / B2B (added 2026-04-12)
    'amplitude':('Amplitude','Tech'),'segment':('Segment','Tech'),
    'mixpanel':('Mixpanel','Tech'),'contentful':('Contentful','Tech'),
    'launchdarkly':('LaunchDarkly','Tech'),'rollbar':('Rollbar','Tech'),
    # Consulting / Professional Services (added 2026-04-12)
    'mckinsey':('McKinsey','Consulting'),'bain':('Bain','Consulting'),
    'bcg':('BCG','Consulting'),

    # ── Batch added 2026-04-17: broad expansion for feed diversity ──
    # YC + Series A-C startups that publish to Greenhouse. Many of
    # these slugs may 404 — the scraper logs and skips cleanly.
    'anduril':('Anduril Industries','Tech'),'scale':('Scale','Tech'),
    'weave':('Weave','Tech'),'clickup':('ClickUp','Tech'),
    'monday':('Monday.com','Tech'),'freshworks':('Freshworks','Tech'),
    'zendesk':('Zendesk','Tech'),'zoominfo':('ZoomInfo','Tech'),
    'gong':('Gong','Tech'),'clari':('Clari','Tech'),
    'drift':('Drift','Tech'),'intercom':('Intercom','Tech'),
    'segmentio':('Segment','Tech'),'heap':('Heap','Tech'),
    'fullstory':('FullStory','Tech'),'pendo':('Pendo','Tech'),
    'appcues':('Appcues','Tech'),'braze':('Braze','Tech'),
    # mixpanelinc 404s; canonical slug is 'mixpanel' (already in this map above).
    # 'mixpanelinc':('Mixpanel','Tech'),
    'sendbird':('Sendbird','Tech'),'stream':('Stream','Tech'),
    'pusher':('Pusher','Tech'),'ably':('Ably','Tech'),
    'twilioflex':('Twilio Flex','Tech'),
    # auth0 and oktainc both 404. okta already in this map above as 'okta'.
    # 'auth0':('Auth0','Tech'),'oktainc':('Okta','Tech'),
    'lastpass':('LastPass','Tech'),'onepassword':('1Password','Tech'),
    'bitwarden':('Bitwarden','Tech'),'dashlane':('Dashlane','Tech'),
    'rapid7':('Rapid7','Tech'),'crowdstrike':('CrowdStrike','Tech'),
    'sentinelone':('SentinelOne','Tech'),'paloaltonetworks':('Palo Alto Networks','Tech'),
    'fortinet':('Fortinet','Tech'),'zscaler':('Zscaler','Tech'),
    # cloudflareinc 404s; canonical slug 'cloudflare' is already in this map above.
    # 'cloudflareinc':('Cloudflare','Tech'),
    'vmware':('VMware','Tech'),'citrix':('Citrix','Tech'),
    'servicenow':('ServiceNow','Tech'),'workday':('Workday','Tech'),
    'splunk':('Splunk','Tech'),'tableau':('Tableau','Tech'),
    'looker':('Looker','Tech'),'altair':('Altair','Tech'),
    'cadence':('Cadence','Tech'),'synopsys':('Synopsys','Tech'),
    'ansys':('ANSYS','Tech'),'autodesk':('Autodesk','Tech'),
    'unity':('Unity Technologies','Tech'),'unrealengine':('Epic Games','Media'),
    'rocketcompanies':('Rocket Companies','Finance'),
    'squareupinc':('Square','Finance'),'klarna':('Klarna','Finance'),
    'afterpay':('Afterpay','Finance'),'shopify':('Shopify','Tech'),
    'bigcommerce':('BigCommerce','Tech'),
    'checkout':('Checkout.com','Finance'),'adyen':('Adyen','Finance'),
    'revolut':('Revolut','Finance'),'wise':('Wise','Finance'),
    'nubank':('Nubank','Finance'),'n26':('N26','Finance'),
    'current':('Current','Finance'),'varomoney':('Varo Bank','Finance'),
    'ellevestinc':('Ellevest','Finance'),'wealthfront':('Wealthfront','Finance'),
    'betterment':('Betterment','Finance'),'personalcapital':('Personal Capital','Finance'),
    'acorns':('Acorns','Finance'),'stash':('Stash','Finance'),
    'robinhoodapp':('Robinhood','Finance'),
    # Biotech / Health
    'modernatx':('Moderna','Biotech'),'regeneron':('Regeneron','Biotech'),
    'illumina':('Illumina','Biotech'),'genentech':('Genentech','Biotech'),
    'verily':('Verily','Biotech'),'recursion':('Recursion','Biotech'),
    'beamtx':('Beam Therapeutics','Biotech'),'crispr':('CRISPR Therapeutics','Biotech'),
    'vertex':('Vertex Pharmaceuticals','Biotech'),
    'amgen':('Amgen','Biotech'),'biogen':('Biogen','Biotech'),
    'gilead':('Gilead','Biotech'),
    'teladoc':('Teladoc','Healthcare'),'amwell':('Amwell','Healthcare'),
    'mdlive':('MDLIVE','Healthcare'),'doximity':('Doximity','Healthcare'),
    'headway':('Headway','Healthcare'),'spring':('Spring Health','Healthcare'),
    'ginger':('Ginger','Healthcare'),'talkspace':('Talkspace','Healthcare'),
    # Consumer / Retail / DTC
    'chewy':('Chewy','Consumer'),'wayfair':('Wayfair','Consumer'),
    'etsy':('Etsy','Consumer'),'ebay':('eBay','Consumer'),
    'poshmark':('Poshmark','Consumer'),'therealreal':('The RealReal','Consumer'),
    'stitchfix':('Stitch Fix','Consumer'),'rentrunway':('Rent the Runway','Consumer'),
    'peloton-interactive':('Peloton','Consumer'),
    'nordstrom':('Nordstrom','Consumer'),'targetcorp':('Target','Consumer'),
    'walmartlabs':('Walmart','Consumer'),
    'doordash':('DoorDash','Consumer'),'ubereats':('Uber Eats','Consumer'),
    'grubhub':('GrubHub','Consumer'),
    # Media / Entertainment
    'paramount':('Paramount','Media'),'warner':('Warner Bros Discovery','Media'),
    'hbomax':('HBO Max','Media'),'peacock':('Peacock','Media'),
    'nytimes':('New York Times','Media'),'washingtonpost':('Washington Post','Media'),
    'condenast':('Condé Nast','Media'),'hearst':('Hearst','Media'),
    'bloomberg':('Bloomberg','Media'),'dowjones':('Dow Jones','Media'),
    # Climate / Energy
    'sunrun':('Sunrun','Tech'),'sunpower':('SunPower','Tech'),
    'chargepoint':('ChargePoint','Tech'),'tesla':('Tesla','Tech'),
    'rivian':('Rivian','Tech'),'aurora':('Aurora','Tech'),
    'impossiblefoods':('Impossible Foods','Consumer'),
    'beyondmeat':('Beyond Meat','Consumer'),
    # EdTech / Workforce
    'lambda':('Lambda School','Education'),'generalassembly':('General Assembly','Education'),
    'udemy':('Udemy','Education'),'udacity':('Udacity','Education'),
    'pluralsight':('Pluralsight','Education'),'chegg':('Chegg','Education'),
    # Real estate / PropTech
    'zillow':('Zillow','Real Estate'),'redfin':('Redfin','Real Estate'),
    'realtor':('Realtor.com','Real Estate'),'homepoint':('Home Point','Real Estate'),
    'blend':('Blend','Finance'),
    # Enterprise SaaS / Data
    'alteryx':('Alteryx','Tech'),'palantir':('Palantir','Tech'),
    'c3ai':('C3.ai','Tech'),'unity3d':('Unity','Tech'),
    'dataiku':('Dataiku','Tech'),'starburst':('Starburst','Tech'),
    'fivetran':('Fivetran','Tech'),'airbyte':('Airbyte','Tech'),
    'prefect':('Prefect','Tech'),'dagster':('Dagster','Tech'),
    'airflow':('Astronomer','Tech'),
    # Devtools / Infra
    'buildkite':('Buildkite','Tech'),'circleci':('CircleCI','Tech'),
    'travisci':('Travis CI','Tech'),'jenkinsx':('Jenkins','Tech'),
    'pulumi':('Pulumi','Tech'),'terraform':('HashiCorp','Tech'),
    'docker':('Docker','Tech'),'redhat':('Red Hat','Tech'),
    'canonical':('Canonical','Tech'),
    'mongodbinc':('MongoDB','Tech'),'redis':('Redis','Tech'),
    'scylladb':('ScyllaDB','Tech'),'yugabyte':('Yugabyte','Tech'),
    'cockroachdb':('Cockroach Labs','Tech'),
    # Gaming
    'electronic-arts':('EA','Media'),'activision':('Activision Blizzard','Media'),
    'ubisoft':('Ubisoft','Media'),'valve':('Valve','Media'),
    'epicgamesstore':('Epic Games','Media'),'nintendo':('Nintendo','Media'),
    # Logistics / Supply chain
    'convoy':('Convoy','Consumer'),'uber':('Uber','Consumer'),
    'deliveroo':('Deliveroo','Consumer'),'lalamove':('Lalamove','Consumer'),

    # ── Batch added 2026-04-23: 200k-scale seed expansion ──
    # Target: another ~400 boards across tech, bio, finance, climate, etc.
    # Slugs that 404 are tolerated — the crawler logs + skips cleanly.
    # Tech / infra (broad)
    'palantirtechnologies':('Palantir','Tech'),'servicenow':('ServiceNow','Tech'),
    'workday':('Workday','Tech'),'workiva':('Workiva','Tech'),
    'atlassian':('Atlassian','Tech'),'pagerdutyinc':('PagerDuty','Tech'),
    'sysdig':('Sysdig','Tech'),'aqua-security':('Aqua Security','Tech'),
    'upcloud':('UpCloud','Tech'),'vultr':('Vultr','Tech'),
    'digitalocean':('DigitalOcean','Tech'),'linode':('Linode','Tech'),
    'fastly':('Fastly','Tech'),'fly':('Fly.io','Tech'),
    'ngrok':('ngrok','Tech'),'tailscale':('Tailscale','Tech'),
    'boundary':('HashiCorp Boundary','Tech'),'teleport':('Teleport','Tech'),
    'jumpcloud':('JumpCloud','Tech'),'1password':('1Password','Tech'),
    'lastpass':('LastPass','Tech'),'dashlane':('Dashlane','Tech'),
    'bitwarden':('Bitwarden','Tech'),'nordpass':('NordPass','Tech'),
    # Data / ML / AI-infra
    'weaviate':('Weaviate','Tech'),'qdrant':('Qdrant','Tech'),
    'chromadb':('Chroma','Tech'),'pinecone':('Pinecone','Tech'),
    'milvus':('Milvus','Tech'),'vectara':('Vectara','Tech'),
    'trychroma':('Chroma','Tech'),
    'dagster':('Dagster','Tech'),'prefect':('Prefect','Tech'),
    'orchest':('Orchest','Tech'),'metaflow':('Metaflow','Tech'),
    'kedro':('Kedro','Tech'),'flyte':('Flyte','Tech'),
    'great-expectations':('Great Expectations','Tech'),
    'soda':('Soda','Tech'),'monte-carlo':('Monte Carlo','Tech'),
    'bigeye':('Bigeye','Tech'),'metaplane':('Metaplane','Tech'),
    'anomalo':('Anomalo','Tech'),'datafold':('Datafold','Tech'),
    'acryl-data':('Acryl Data','Tech'),'alation':('Alation','Tech'),
    'collibra':('Collibra','Tech'),'atlan':('Atlan','Tech'),
    'select-star':('Select Star','Tech'),
    # Dev tooling
    'sourcegraph':('Sourcegraph','Tech'),'deepcode':('DeepCode','Tech'),
    'tabnine':('Tabnine','Tech'),'codeium':('Codeium','Tech'),
    'sweep':('Sweep','Tech'),'cody':('Sourcegraph Cody','Tech'),
    'e2b-dev':('E2B','Tech'),
    'continue':('Continue','Tech'),'aider':('Aider','Tech'),
    'devinai':('Devin / Cognition','Tech'),'cognition':('Cognition','Tech'),
    # Observability / security
    'sentryio':('Sentry','Tech'),'rollbarhq':('Rollbar','Tech'),
    'loggly':('Loggly','Tech'),'papertrail':('Papertrail','Tech'),
    'solarwinds':('SolarWinds','Tech'),'dynatraceinc':('Dynatrace','Tech'),
    'paloaltonetworks':('Palo Alto Networks','Tech'),
    'fortinet':('Fortinet','Tech'),'zscaler':('Zscaler','Tech'),
    'crowdstrikeinc':('CrowdStrike','Tech'),'sentinelone':('SentinelOne','Tech'),
    # Fintech / banking
    'creditkarma':('Credit Karma','Finance'),'nerdwallet-inc':('NerdWallet','Finance'),
    'currentrh':('Current','Finance'),'step-mobile':('Step','Finance'),
    'varo':('Varo','Finance'),'aspiration':('Aspiration','Finance'),
    'money-lion':('MoneyLion','Finance'),
    'acorns':('Acorns','Finance'),'stash':('Stash','Finance'),
    'plaidinc':('Plaid','Finance'),'finix':('Finix','Finance'),
    'modern-treasury-inc':('Modern Treasury','Finance'),
    'stripe-inc':('Stripe','Finance'),
    'wise':('Wise','Finance'),'remitly':('Remitly','Finance'),
    'worldremit':('WorldRemit','Finance'),'transferwise':('Wise','Finance'),
    'adyen':('Adyen','Finance'),'checkout':('Checkout.com','Finance'),
    'klarna':('Klarna','Finance'),'afterpay':('Afterpay','Finance'),
    'affirm-holdings':('Affirm','Finance'),
    # Healthcare / biotech / pharma
    'devoted-health':('Devoted Health','Healthcare'),
    'grailinc':('GRAIL','Healthcare'),'tempus-labs':('Tempus','Healthcare'),
    'guardanthealth':('Guardant Health','Healthcare'),
    'myriadgenetics':('Myriad Genetics','Healthcare'),
    'pathai':('PathAI','Healthcare'),'tempusai':('Tempus AI','Healthcare'),
    'recursion':('Recursion','Healthcare'),
    'insitro':('Insitro','Healthcare'),'schrödinger':('Schrödinger','Healthcare'),
    'generate-biomedicines':('Generate Biomedicines','Healthcare'),
    'absci':('Absci','Healthcare'),'atomwise':('Atomwise','Healthcare'),
    'benevolentai':('BenevolentAI','Healthcare'),
    'exscientia':('Exscientia','Healthcare'),
    'isomorphiclabs':('Isomorphic Labs','Healthcare'),
    'xaira':('Xaira','Healthcare'),
    'orchard':('Orchard','Healthcare'),
    'carbon-health':('Carbon Health','Healthcare'),
    'forward':('Forward','Healthcare'),
    'one-medical':('One Medical','Healthcare'),
    # Climate / energy
    'climeworks':('Climeworks','Tech'),'carbonengineering':('Carbon Engineering','Tech'),
    'charm-industrial':('Charm Industrial','Tech'),
    'noya-labs':('Noya','Tech'),'running-tide':('Running Tide','Tech'),
    'pachama':('Pachama','Tech'),'sylvera':('Sylvera','Tech'),
    'patch':('Patch','Tech'),'cloverly':('Cloverly','Tech'),
    'watershed-tech':('Watershed','Tech'),'persefoni':('Persefoni','Tech'),
    'normativeio':('Normative','Tech'),'sweep-earth':('Sweep','Tech'),
    'crusoe':('Crusoe','Tech'),'commonwealth-fusion-systems':('Commonwealth Fusion','Tech'),
    'tae-technologies':('TAE Technologies','Tech'),
    'helion-energy':('Helion Energy','Tech'),
    'formenergy':('Form Energy','Tech'),'ironcladenergy':('Form Energy','Tech'),
    'octopus-energy':('Octopus Energy','Tech'),
    'arcadia':('Arcadia','Tech'),'david-energy':('David Energy','Tech'),
    # Robotics / hardware / aero
    'skydio':('Skydio','Tech'),'zipline':('Zipline','Tech'),
    'wingcopter':('Wingcopter','Tech'),'matternet':('Matternet','Tech'),
    'shield-ai':('Shield AI','Tech'),'saronic':('Saronic','Tech'),
    'blue-origin':('Blue Origin','Tech'),'spacex':('SpaceX','Tech'),
    'planet-labs':('Planet Labs','Tech'),'astranis':('Astranis','Tech'),
    'vast-space':('Vast','Tech'),'varda':('Varda','Tech'),
    'stokespace':('Stoke Space','Tech'),
    'impulsespace':('Impulse Space','Tech'),
    'firefly-aerospace':('Firefly Aerospace','Tech'),
    # Media / streaming / social
    'spotify-inc':('Spotify','Media'),
    'twitch-careers':('Twitch','Media'),
    'youtubeinc':('YouTube','Media'),
    'substack-inc':('Substack','Media'),'ghost':('Ghost','Media'),
    'notable-inc':('Notable','Media'),
    'patreoninc':('Patreon','Media'),'buy-me-a-coffee':('Buy Me a Coffee','Media'),
    'discord-careers':('Discord','Media'),
    # EdTech
    'outschool':('Outschool','Education'),
    'aLeaf':('ALeaf','Education'),
    'labster':('Labster','Education'),'age-of-learning':('Age of Learning','Education'),
    'prodigy':('Prodigy','Education'),'abcmouse':('ABCmouse','Education'),
    'varsitytutors':('Varsity Tutors','Education'),
    'outschool-tutors':('Outschool','Education'),
    # Consulting / prof services
    'mbb-deloitte':('Deloitte','Consulting'),
    'alphasights':('AlphaSights','Consulting'),
    'guidepoint':('Guidepoint','Consulting'),
    'third-bridge':('Third Bridge','Consulting'),
    'gerson-lehrman-group':('GLG','Consulting'),
    # Legal / govtech / civic
    'clearcompany':('ClearCompany','Tech'),
    'relativityhq':('Relativity','Tech'),
    'clio':('Clio','Tech'),
    'rocket-lawyer':('Rocket Lawyer','Tech'),
    'legalzoom':('LegalZoom','Tech'),
    'everlaw':('Everlaw','Tech'),
    'hashiocorp':('HashiCorp','Tech'),
    # Generic "we see them a lot"
    'klaviyo-inc':('Klaviyo','Tech'),'attentive':('Attentive','Tech'),
    'mailmodo':('Mailmodo','Tech'),'sendgrid':('Twilio SendGrid','Tech'),
    'mailchimp':('Mailchimp','Tech'),'activecampaign':('ActiveCampaign','Tech'),
    'klaviyoltd':('Klaviyo','Tech'),
    'iterable-inc':('Iterable','Tech'),'braze-inc':('Braze','Tech'),
    'omnisend':('Omnisend','Tech'),'postmark':('Postmark','Tech'),
    'postscript':('Postscript','Tech'),
    # Gaming (additional)
    'scopely':('Scopely','Media'),'king-digital':('King','Media'),
    'jagex':('Jagex','Media'),'mojang':('Mojang','Media'),
    'miniclip':('Miniclip','Media'),
    'supercell':('Supercell','Media'),'rovio':('Rovio','Media'),
    # Misc tech unicorns
    'canva-inc':('Canva','Tech'),'notion-labs':('Notion','Tech'),
    'miro-inc':('Miro','Tech'),'figma-inc':('Figma','Tech'),
    'monday-com':('Monday.com','Tech'),'asana-inc':('Asana','Tech'),
    'trello-atlassian':('Trello','Tech'),
    'slack-tech':('Slack','Tech'),'discord-inc':('Discord','Tech'),
    'telegram':('Telegram','Tech'),'signal':('Signal','Tech'),
    'element':('Element','Tech'),'matrix-org':('Matrix','Tech'),
    'rocket-chat':('Rocket.Chat','Tech'),'mattermost':('Mattermost','Tech'),

    # ── Batch added 2026-04-23 (round 2): another 150 slugs ──
    # YC batches + well-known startups. 404 slugs silently skip.
    'yc-companies':('Y Combinator','Tech'),
    'discord-app':('Discord','Tech'),'convex-dev':('Convex','Tech'),
    'temporaltech':('Temporal','Tech'),'convexinc':('Convex','Tech'),
    'blend':('Blend','Finance'),'blendlabs':('Blend','Finance'),
    'toastinc':('Toast','Tech'),'lightmatter':('Lightmatter','Tech'),
    'ayar-labs':('Ayar Labs','Tech'),'psiquantum':('PsiQuantum','Tech'),
    'quantinuum':('Quantinuum','Tech'),'ionq':('IonQ','Tech'),
    'rigetti':('Rigetti','Tech'),'atom-computing':('Atom Computing','Tech'),
    'pasqal':('Pasqal','Tech'),
    'sambanova':('SambaNova','Tech'),'graphcore':('Graphcore','Tech'),
    'tenstorrent':('Tenstorrent','Tech'),
    'ambarella':('Ambarella','Tech'),'mobileye':('Mobileye','Tech'),
    'cruise-automation':('Cruise','Tech'),
    'motional':('Motional','Tech'),'aurora':('Aurora','Tech'),
    'argo-ai':('Argo AI','Tech'),'applied-intuition':('Applied Intuition','Tech'),
    'oxbotica':('Oxbotica','Tech'),'kodiak-robotics':('Kodiak Robotics','Tech'),
    'torc-robotics':('Torc Robotics','Tech'),
    'nuro-inc':('Nuro','Tech'),'gatik':('Gatik','Tech'),
    'embark-trucks':('Embark','Tech'),'einride':('Einride','Tech'),
    # Climate/energy
    'sundae':('Sundae','Tech'),'sundaeprotocol':('Sundae','Tech'),
    'arrive-ai':('Arrive AI','Tech'),'ambient-ai':('Ambient','Tech'),
    'cribl':('Cribl','Tech'),'panther-labs':('Panther','Tech'),
    'nucleus-cyber':('Nucleus','Tech'),'endor-labs':('Endor Labs','Tech'),
    'chainguard':('Chainguard','Tech'),'snyk-io':('Snyk','Tech'),
    'huntress':('Huntress','Tech'),'tanium':('Tanium','Tech'),
    'okyo-pharma':('Okyo Pharma','Healthcare'),
    'relay-therapeutics':('Relay Therapeutics','Healthcare'),
    'revolution-medicines':('Revolution Medicines','Healthcare'),
    'denali-therapeutics':('Denali Therapeutics','Healthcare'),
    'vertex-pharma':('Vertex Pharmaceuticals','Healthcare'),
    'biogen':('Biogen','Healthcare'),'regeneron':('Regeneron','Healthcare'),
    'alnylam':('Alnylam','Healthcare'),'moderna':('Moderna','Healthcare'),
    'bluebird-bio':('bluebird bio','Healthcare'),
    'crispr-therapeutics':('CRISPR Therapeutics','Healthcare'),
    'editas':('Editas Medicine','Healthcare'),
    'sana-biotech':('Sana Biotechnology','Healthcare'),
    'beam-therapeutics':('Beam Therapeutics','Healthcare'),
    'verve-therapeutics':('Verve Therapeutics','Healthcare'),
    'sutro-biopharma':('Sutro Biopharma','Healthcare'),
    # Media
    'vox-media':('Vox Media','Media'),'atlantic-media':('The Atlantic','Media'),
    'nyt':('New York Times','Media'),'washingtonpost':('Washington Post','Media'),
    'bloomberg':('Bloomberg','Media'),'reuters':('Reuters','Media'),
    'associated-press':('Associated Press','Media'),
    'bustle':('Bustle','Media'),'refinery29':('Refinery29','Media'),
    # Consumer internet
    'discord-careers':('Discord','Media'),'redditinc':('Reddit','Media'),
    'twitterinc':('Twitter','Media'),'xcompany':('X','Media'),
    'threads':('Threads','Media'),'meta':('Meta','Tech'),
    # Startups with good internship volume
    'openstorage':('OpenStorage','Tech'),
    'coda-io':('Coda','Tech'),'clickupbuild':('ClickUp','Tech'),
    'trello':('Trello','Tech'),
    'zoom-video':('Zoom','Tech'),'webex':('Cisco Webex','Tech'),
    'stickermule':('Sticker Mule','Consumer'),
    'rareform':('Rareform','Consumer'),
    'faire-com':('Faire','Consumer'),
    'thrasio':('Thrasio','Consumer'),
    # Consulting firms
    'guidehouse':('Guidehouse','Consulting'),
    'booz-allen-hamilton':('Booz Allen Hamilton','Consulting'),
    'oliver-wyman':('Oliver Wyman','Consulting'),
    'adlittle':('Arthur D. Little','Consulting'),
    'monitor-deloitte':('Monitor Deloitte','Consulting'),
    'lek-consulting':('L.E.K. Consulting','Consulting'),
    'kearney':('Kearney','Consulting'),
    'roland-berger':('Roland Berger','Consulting'),
    'parthenon':('Parthenon','Consulting'),
    'strategyand':('Strategy&','Consulting'),
    'zs-associates':('ZS Associates','Consulting'),
    # Banks / PE / VC
    'goldman-sachs':('Goldman Sachs','Finance'),
    'morgan-stanley':('Morgan Stanley','Finance'),
    'jpmc':('JPMorgan','Finance'),
    'blackrock':('BlackRock','Finance'),
    'blackstone':('Blackstone','Finance'),
    'kkr':('KKR','Finance'),
    'apollo-global':('Apollo Global','Finance'),
    'carlyle-group':('Carlyle','Finance'),
    'bridgewater':('Bridgewater','Finance'),
    'wellington-management':('Wellington','Finance'),
    't-rowe-price':('T. Rowe Price','Finance'),
    'vanguard':('Vanguard','Finance'),
    'fidelity':('Fidelity','Finance'),
    'state-street':('State Street','Finance'),
    'bny-mellon':('BNY Mellon','Finance'),
    # EdTech + kids
    'kahoot':('Kahoot','Education'),
    'epic-games-store':('Epic Games','Media'),
    'outlier-ai':('Outlier AI','Tech'),
    'turing-com':('Turing','Tech'),'toptalio':('Toptal','Tech'),
    # More YC / Series A
    'default-com':('Default','Tech'),'daylight-com':('Daylight','Tech'),
    'pylon':('Pylon','Tech'),'fillout':('Fillout','Tech'),
    'ramp-hq':('Ramp','Finance'),

    # ── Batch added 2026-04-24: sector expansion (Greenhouse) ──
    # Finance / Banking / Capital Markets
    'citadel':('Citadel','Finance'),'citadel-securities':('Citadel Securities','Finance'),
    'two-sigma':('Two Sigma','Finance'),'de-shaw':('D. E. Shaw','Finance'),
    'renaissance-technologies':('Renaissance Technologies','Finance'),
    'millennium-management':('Millennium','Finance'),
    'point72':('Point72','Finance'),'jane-street':('Jane Street','Finance'),
    'hrt':('Hudson River Trading','Finance'),
    'akuna-capital':('Akuna Capital','Finance'),
    'optiver':('Optiver','Finance'),'imc-trading':('IMC Trading','Finance'),
    'susquehanna':('Susquehanna International Group','Finance'),
    'virtu-financial':('Virtu Financial','Finance'),
    'tower-research':('Tower Research Capital','Finance'),
    'jump-trading':('Jump Trading','Finance'),
    'dv-trading':('DV Trading','Finance'),
    'radix-trading':('Radix Trading','Finance'),
    'chicago-trading':('Chicago Trading Company','Finance'),
    'drw-trading':('DRW','Finance'),
    'five-rings':('Five Rings','Finance'),
    'aqr-capital':('AQR Capital','Finance'),
    'balyasny':('Balyasny Asset Management','Finance'),
    'schonfeld':('Schonfeld','Finance'),
    'coatue':('Coatue Management','Finance'),
    'tiger-global':('Tiger Global','Finance'),
    'andreessen-horowitz':('Andreessen Horowitz','Finance'),
    'sequoia-capital':('Sequoia Capital','Finance'),
    # Big Tech on Greenhouse
    'apple-career':('Apple','Tech'),'microsoft':('Microsoft','Tech'),
    'google':('Google','Tech'),'meta-careers':('Meta','Tech'),
    'amazon-dev':('Amazon','Tech'),'salesforce-jobs':('Salesforce','Tech'),
    'oracle-careers':('Oracle','Tech'),'ibm-careers':('IBM','Tech'),
    'intel-corporation':('Intel','Tech'),'nvidia-corporation':('NVIDIA','Tech'),
    'qualcomm-jobs':('Qualcomm','Tech'),'amd-careers':('AMD','Tech'),
    # Cybersecurity
    'paloaltonetworks-careers':('Palo Alto Networks','Tech'),
    'crowdstrike-careers':('CrowdStrike','Tech'),
    'sentinelone-careers':('SentinelOne','Tech'),
    'darktrace':('Darktrace','Tech'),'vectra-ai':('Vectra AI','Tech'),
    'exabeam':('Exabeam','Tech'),'logrhythm':('LogRhythm','Tech'),
    'secureworks':('SecureWorks','Tech'),'trustwave':('Trustwave','Tech'),
    'proofpoint':('Proofpoint','Tech'),'mimecast':('Mimecast','Tech'),
    'ironnet':('IronNet','Tech'),'dragos':('Dragos','Tech'),
    'claroty':('Claroty','Tech'),'nozomi-networks':('Nozomi Networks','Tech'),
    'ot-security':('Armis','Tech'),'armis-security':('Armis','Tech'),
    'axonius':('Axonius','Tech'),'brinqa':('Brinqa','Tech'),
    # Enterprise SaaS
    'servicenow-careers':('ServiceNow','Tech'),
    'workday-careers':('Workday','Tech'),
    'sap-careers':('SAP','Tech'),'oracle-hcm':('Oracle','Tech'),
    'microsoftalternate':('Microsoft','Tech'),
    'atlassian-careers':('Atlassian','Tech'),
    'zendesk-careers':('Zendesk','Tech'),
    'freshworks-careers':('Freshworks','Tech'),
    # More Biotech / Pharma
    'lilly-careers':('Eli Lilly','Biotech'),
    'abbvie':('AbbVie','Biotech'),'novartis-careers':('Novartis','Biotech'),
    'roche-careers':('Roche','Biotech'),'pfizer-careers':('Pfizer','Biotech'),
    'johnson-johnson':('Johnson & Johnson','Biotech'),
    'merck-careers':('Merck','Biotech'),'bristol-myers':('Bristol Myers Squibb','Biotech'),
    'astrazeneca':('AstraZeneca','Biotech'),'genentech-careers':('Genentech','Biotech'),
    'amgen-careers':('Amgen','Biotech'),'biogen-careers':('Biogen','Biotech'),
    'gilead-careers':('Gilead Sciences','Biotech'),
    'incyte':('Incyte','Biotech'),'alexion':('Alexion','Biotech'),
    'shire':('Shire','Biotech'),'takeda':('Takeda','Biotech'),
    'daiichi-sankyo':('Daiichi Sankyo','Biotech'),
    'otsuka':('Otsuka','Biotech'),'eisai':('Eisai','Biotech'),
    'sumitomo-pharma':('Sumitomo Pharma','Biotech'),
    # Government Tech / Defense
    'palantir-careers':('Palantir','Tech'),
    'anduril-industries':('Anduril','Tech'),
    'shield-ai-careers':('Shield AI','Tech'),
    'rebellion-defense':('Rebellion Defense','Tech'),
    'sievert-stockroom':('Sievert','Tech'),
    'leidos':('Leidos','Government'),'saic':('SAIC','Government'),
    'booz-allen':('Booz Allen Hamilton','Consulting'),
    'csra-inc':('CSRA','Government'),
    'mgi-tech':('MITRE','Government'),'mitre-corporation':('MITRE','Government'),
    'rand-corporation':('RAND','Government'),
    'urban-institute':('Urban Institute','Nonprofit'),
    # Real Estate / Construction Tech
    'procore':('Procore','Tech'),'procore-tech':('Procore','Tech'),
    'autodesk-construction':('Autodesk Construction','Tech'),
    'bnbuilders':('BN Builders','Government'),
    'buildertrend':('Buildertrend','Tech'),
    'fieldwire':('Fieldwire','Tech'),'plangrid':('PlanGrid','Tech'),
    'ryvit':('Ryvit','Tech'),'construction-tech':('Dusty Robotics','Tech'),
    # E-commerce / Retail Tech
    'shopify-careers':('Shopify','Tech'),
    'bigcommerce-careers':('BigCommerce','Tech'),
    'woocommerce':('WooCommerce','Tech'),
    'bolt-checkout':('Bolt','Tech'),'cartpanda':('Cartpanda','Tech'),
    'recharge-payments':('Recharge','Tech'),
    'yotpo':('Yotpo','Tech'),'okendo':('Okendo','Tech'),
    'gorgias-hq':('Gorgias','Tech'),'kustomer-care':('Kustomer','Tech'),
    'gladly':('Gladly','Tech'),'assembled':('Assembled','Tech'),
    'dialpad-careers':('Dialpad','Tech'),
    # Supply Chain / Logistics
    'project44':('project44','Tech'),'flexe':('Flexe','Tech'),
    'stord':('Stord','Tech'),'shipbob':('ShipBob','Tech'),
    'deliverr':('Deliverr','Tech'),'whiplash':('Whiplash','Tech'),
    'shipmonk':('ShipMonk','Tech'),'darkstore':('Darkstore','Tech'),
    'fabric-tech':('Fabric','Tech'),'amware':('Amware','Tech'),
    'loadsmart':('Loadsmart','Tech'),'transplace':('Transplace','Tech'),
    'convoy-transport':('Convoy','Consumer'),
    # Legal Tech
    'clio-legal':('Clio','Tech'),'mycase':('MyCase','Tech'),
    'lawmatics':('Lawmatics','Tech'),'smokeball':('Smokeball','Tech'),
    'practicepanther':('PracticePanther','Tech'),
    'centerbase':('Centerbase','Tech'),'litify':('Litify','Tech'),
    'filevine':('Filevine','Tech'),'needles':('Needles','Tech'),
    'advologix':('Advologix','Tech'),
    # Insurance Tech
    'lemonade-insurance':('Lemonade','Finance'),
    'root-insurance':('Root Insurance','Finance'),
    'metromile':('Metromile','Finance'),'hippo-homes':('Hippo','Finance'),
    'kin-careers':('Kin Insurance','Finance'),
    'branch-careers':('Branch Insurance','Finance'),
    'openly-careers':('Openly','Finance'),
    'sure-insurance':('Sure','Finance'),
    'newfront-insurance':('Newfront Insurance','Finance'),
    'attune-insurance':('Attune','Finance'),
    # Food / Ag Tech
    'apeel':('Apeel Sciences','Tech'),
    'pivot-bio':('Pivot Bio','Tech'),
    'inari-agriculture':('Inari Agriculture','Tech'),
    'bowery-farming':('Bowery Farming','Tech'),
    'plenty-agriculture':('Plenty','Tech'),
    'infarm':('Infarm','Tech'),
    'aerofarms':('AeroFarms','Tech'),
    'gotham-greens':('Gotham Greens','Consumer'),
    'little-leaf-farms':('Little Leaf Farms','Consumer'),
    # Nonprofit / Social Impact
    'code-org':('Code.org','Nonprofit'),
    'kiva':('Kiva','Nonprofit'),
    'charity-water':('charity: water','Nonprofit'),
    'give-directly':('GiveDirectly','Nonprofit'),
    'givewell':('GiveWell','Nonprofit'),
    'open-philanthropy':('Open Philanthropy','Nonprofit'),
    'effective-ventures':('Effective Ventures','Nonprofit'),
    'acumen':('Acumen','Nonprofit'),
    'room-to-read':('Room to Read','Nonprofit'),
    'teach-for-america':('Teach For America','Education'),
    # ── Added 2026-04-24: more tech / VC-backed startups on Greenhouse ──
    'anthropic':('Anthropic','Tech'),
    'openai':('OpenAI','Tech'),
    'mistral':('Mistral AI','Tech'),
    'cohere':('Cohere','Tech'),
    'ai21':('AI21 Labs','Tech'),
    'inflection-ai':('Inflection AI','Tech'),
    'adept-ai':('Adept AI','Tech'),
    'hugging-face':('Hugging Face','Tech'),
    'stability-ai':('Stability AI','Tech'),
    'runway-ml':('Runway ML','Tech'),
    'midjourney':('Midjourney','Tech'),
    'pika-labs':('Pika Labs','Tech'),
    'suno-ai':('Suno AI','Tech'),
    'udio':('Udio','Tech'),
    'eleven-labs':('ElevenLabs','Tech'),
    'luma-ai':('Luma AI','Tech'),
    'heygen':('HeyGen','Tech'),
    'synthesia-io':('Synthesia','Tech'),
    'descript':('Descript','Tech'),
    'cleanvoice':('Cleanvoice','Tech'),
    'jasper-ai':('Jasper AI','Tech'),
    'copy-ai':('Copy.ai','Tech'),
    'writesonic':('Writesonic','Tech'),
    'anyword':('Anyword','Tech'),
    'hypotenuse-ai':('Hypotenuse AI','Tech'),
    'lex-page':('Lex','Tech'),
    'sudowrite':('Sudowrite','Tech'),
    'shortwave':('Shortwave','Tech'),
    'superhuman':('Superhuman','Tech'),
    'hey-email':('Hey Email','Tech'),
    'fastmail':('Fastmail','Tech'),
    'proton-mail':('Proton Mail','Tech'),
    'tutanota':('Tuta Mail','Tech'),
    'skiff':('Skiff','Tech'),
    'coda-hq':('Coda','Tech'),
    'craft-docs':('Craft Docs','Tech'),
    'capacities':('Capacities','Tech'),
    'obsidian':('Obsidian','Tech'),
    'logseq':('Logseq','Tech'),
    'roam-research':('Roam Research','Tech'),
    'mem-ai':('Mem','Tech'),
    'replit-hq':('Replit','Tech'),
    'gitpod':('Gitpod','Tech'),
    'coder-com':('Coder','Tech'),
    'devpod-io':('DevPod','Tech'),
    'railway-app':('Railway','Tech'),
    'render-hq':('Render','Tech'),
    'fly-io':('Fly.io','Tech'),
    'deno-land':('Deno','Tech'),
    'bun-sh':('Bun','Tech'),
    'turso-db':('Turso','Tech'),
    'neon-tech':('Neon','Tech'),
    'planetscale-inc':('PlanetScale','Tech'),
    'cockroach-labs':('CockroachDB','Tech'),
    'singlestore':('SingleStore','Tech'),
    'timescale-io':('Timescale','Tech'),
    'questdb':('QuestDB','Tech'),
    'clickhouse-inc':('ClickHouse','Tech'),
    'tinybird-io':('Tinybird','Tech'),
    'motherduck':('MotherDuck','Tech'),
    'duckdb-labs':('DuckDB','Tech'),
    'starburst-data':('Starburst','Tech'),
    'preset-io':('Preset','Tech'),
    'redash':('Redash','Tech'),
    'metabase-inc':('Metabase','Tech'),
    'grafana-labs':('Grafana Labs','Tech'),
    'datadog-careers':('Datadog','Tech'),
    'honeycomb-io':('Honeycomb','Tech'),
    'lightstep':('Lightstep','Tech'),
    'new-relic':('New Relic','Tech'),
    'dynatrace-jobs':('Dynatrace','Tech'),
    'appdynamics':('AppDynamics','Tech'),
    'splunk-careers':('Splunk','Tech'),
    'elastic-search':('Elastic','Tech'),
    'opensearch-project':('OpenSearch','Tech'),
    'algolia-inc':('Algolia','Tech'),
    'meilisearch':('Meilisearch','Tech'),
    'typesense':('Typesense','Tech'),
    'weaviate':('Weaviate','Tech'),
    'pinecone-io':('Pinecone','Tech'),
    'chroma-db':('Chroma','Tech'),
    'qdrant':('Qdrant','Tech'),
    'lancedb':('LanceDB','Tech'),
    'zilliz-io':('Zilliz','Tech'),
    'vespa-engine':('Vespa','Tech'),
    'marqo-ai':('Marqo','Tech'),
}

LEVER_COMPANIES = {
    "ramp":("Ramp","Finance"),"anduril":("Anduril","Tech"),"Netflix":("Netflix","Media"),
    "watershed":("Watershed","Tech"),"relativityspace":("Relativity Space","Tech"),
    "blueyonder":("Blue Yonder","Tech"),"linear":("Linear","Tech"),"vercel":("Vercel","Tech"),
    "flexport":("Flexport","Consumer"),"nerdwallet":("NerdWallet","Finance"),
    "masterclass":("MasterClass","Media"),"gusto":("Gusto","Tech"),"benchling":("Benchling","Healthcare"),
    "tempus":("Tempus","Healthcare"),"ziprecruiter":("ZipRecruiter","Tech"),"toast":("Toast","Tech"),
    # AI / Tech (added 2026-04-12)
    "loom":("Loom","Tech"),"figma":("Figma","Tech"),
    "anthropic":("Anthropic","Tech"),"openai":("OpenAI","Tech"),
    "perplexity":("Perplexity","Tech"),"mistral":("Mistral","Tech"),
    "cohere":("Cohere","Tech"),"runway":("Runway","Tech"),
    "jasper":("Jasper","Tech"),"snorkel":("Snorkel AI","Tech"),
    # Other industries (added 2026-04-12)
    "alan":("Alan","Healthcare"),"faire":("Faire","Consumer"),
    "pilot":("Pilot","Finance"),"standard":("Standard AI","Tech"),

    # ── Batch added 2026-04-17: Lever expansion ──
    "palantir":("Palantir","Tech"),"brex":("Brex","Finance"),
    "scale-ai":("Scale AI","Tech"),"chime":("Chime","Finance"),
    "squarespace":("Squarespace","Tech"),"verkada":("Verkada","Tech"),
    "plex":("Plex","Media"),"instabase":("Instabase","Tech"),
    "vanta":("Vanta","Tech"),"drata":("Drata","Tech"),
    "secureframe":("Secureframe","Tech"),"tines":("Tines","Tech"),
    "arctic-wolf":("Arctic Wolf","Tech"),"wiz-io":("Wiz","Tech"),
    "lacework":("Lacework","Tech"),"zapier":("Zapier","Tech"),
    "make":("Make","Tech"),"airtable":("Airtable","Tech"),
    "coda":("Coda","Tech"),"miro":("Miro","Tech"),
    "mural":("Mural","Tech"),"whimsical":("Whimsical","Tech"),
    "grafana":("Grafana Labs","Tech"),"elastic":("Elastic","Tech"),
    "sumologic":("Sumo Logic","Tech"),"newrelic":("New Relic","Tech"),
    "appdynamics":("AppDynamics","Tech"),"dynatrace":("Dynatrace","Tech"),
    "honeycomb":("Honeycomb","Tech"),"lightstep":("Lightstep","Tech"),
    "netlify":("Netlify","Tech"),"render":("Render","Tech"),
    "railway":("Railway","Tech"),"planetscale":("PlanetScale","Tech"),
    "neon":("Neon","Tech"),"xata":("Xata","Tech"),
    "supabaseinc":("Supabase","Tech"),
    "postmates":("Postmates","Consumer"),"instacart":("Instacart","Consumer"),
    "allbirds-inc":("Allbirds","Consumer"),"harrys":("Harry's","Consumer"),
    "dollarshaveclub":("Dollar Shave Club","Consumer"),
    "bumble":("Bumble","Consumer"),"hinge":("Hinge","Consumer"),
    "tinder":("Tinder","Consumer"),"match":("Match Group","Consumer"),
    "duolingo-inc":("Duolingo","Education"),
    "codecademy":("Codecademy","Education"),
    "brilliant":("Brilliant","Education"),
    "handshake":("Handshake","Tech"),
    "betterup":("BetterUp","Tech"),"lattice-hq":("Lattice","Tech"),
    "culture-amp":("Culture Amp","Tech"),"15five":("15Five","Tech"),
    "envoy":("Envoy","Tech"),"rippling":("Rippling","Tech"),
    "sequoia":("Sequoia Consulting","Consulting"),
    "deel":("Deel","Tech"),"remote":("Remote","Tech"),
    "papaya":("Papaya Global","Tech"),
    "justin-tv":("Twitch","Media"),"vimeo":("Vimeo","Media"),
    "substack":("Substack","Media"),"medium":("Medium","Media"),
    "quora":("Quora","Media"),"pinterest-eng":("Pinterest","Tech"),

    # ── Batch added 2026-04-23: 200k-scale Lever expansion ──
    "attentive":("Attentive","Tech"),"klaviyo":("Klaviyo","Tech"),
    "tecton":("Tecton","Tech"),"bigid":("BigID","Tech"),
    "immuta":("Immuta","Tech"),"privacera":("Privacera","Tech"),
    "cyera":("Cyera","Tech"),"varonis":("Varonis","Tech"),
    "rubrik":("Rubrik","Tech"),"cohesity":("Cohesity","Tech"),
    "druva":("Druva","Tech"),"veeam":("Veeam","Tech"),
    "wasabi":("Wasabi","Tech"),"backblaze":("Backblaze","Tech"),
    "box-inc":("Box","Tech"),"egnyte":("Egnyte","Tech"),
    "dropboxbusiness":("Dropbox","Tech"),"citrix":("Citrix","Tech"),
    "vmwareinc":("VMware","Tech"),"nutanix":("Nutanix","Tech"),
    "puremstorage":("Pure Storage","Tech"),"netapp":("NetApp","Tech"),
    "juniper":("Juniper Networks","Tech"),"aruba":("Aruba Networks","Tech"),
    "extremenetworks":("Extreme Networks","Tech"),
    "hashicorpio":("HashiCorp","Tech"),"terraformio":("HashiCorp Terraform","Tech"),
    "redisinc":("Redis","Tech"),"confluentinc":("Confluent","Tech"),
    "mongodbinc":("MongoDB","Tech"),
    "clickhouse":("ClickHouse","Tech"),"starburst":("Starburst","Tech"),
    "trino":("Trino","Tech"),"dremio":("Dremio","Tech"),
    "ahana":("Ahana","Tech"),
    "motherduck":("MotherDuck","Tech"),"starrocks":("StarRocks","Tech"),
    "firebolt":("Firebolt","Tech"),"datawarehouse":("Snowflake","Tech"),
    # Consumer apps
    "strava":("Strava","Consumer"),"fitbit":("Fitbit","Consumer"),
    "whoop":("Whoop","Consumer"),"ouraring":("Oura","Consumer"),
    "bumble-inc":("Bumble","Consumer"),"hinge-app":("Hinge","Consumer"),
    "grindr":("Grindr","Consumer"),"meet":("Meet","Consumer"),
    # Travel
    "kayak":("Kayak","Consumer"),"hopper":("Hopper","Consumer"),
    "expedia":("Expedia","Consumer"),"booking":("Booking.com","Consumer"),
    "airbnbhq":("Airbnb","Consumer"),"vrbo":("Vrbo","Consumer"),
    "getyourguide":("GetYourGuide","Consumer"),
    "viator":("Viator","Consumer"),
    # B2B SaaS
    "frontapp":("Front","Tech"),"helpscout":("Help Scout","Tech"),
    "zendesk-inc":("Zendesk","Tech"),"freshdesk":("Freshdesk","Tech"),
    "intercomio":("Intercom","Tech"),
    "kustomer":("Kustomer","Tech"),
    "crayon":("Crayon","Tech"),"gong-io":("Gong","Tech"),
    "outreach-io":("Outreach","Tech"),"salesloft-inc":("Salesloft","Tech"),
    # Fintech
    "pipe-technologies":("Pipe","Finance"),
    "capchase":("Capchase","Finance"),"clearco":("Clearco","Finance"),
    "wayflyer":("Wayflyer","Finance"),
    # Consumer
    "doordashinc":("DoorDash","Consumer"),"ubereats":("Uber Eats","Consumer"),
    "grubhub":("Grubhub","Consumer"),"chowbus":("Chowbus","Consumer"),
    # AI
    "twelve-labs":("Twelve Labs","Tech"),
    "contextual-ai":("Contextual AI","Tech"),
    "augment":("Augment","Tech"),
    "imbue":("Imbue","Tech"),"reka":("Reka","Tech"),
    "writerai":("Writer","Tech"),"typeform":("Typeform","Tech"),

    # ── Batch added 2026-04-24: Lever expansion ──
    # Quantitative / trading
    "citadel-careers":("Citadel","Finance"),
    "jane-street-careers":("Jane Street","Finance"),
    "two-sigma-careers":("Two Sigma","Finance"),
    "deshaw":("D. E. Shaw","Finance"),
    "hrt-careers":("Hudson River Trading","Finance"),
    "akuna":("Akuna Capital","Finance"),
    "optiver-careers":("Optiver","Finance"),
    # Consulting
    "bain-consulting":("Bain & Company","Consulting"),
    "bcg-consulting":("BCG","Consulting"),
    "mckinsey-co":("McKinsey","Consulting"),
    "ey-parthenon":("EY-Parthenon","Consulting"),
    "alixpartners":("AlixPartners","Consulting"),
    "huron-consulting":("Huron Consulting","Consulting"),
    "crosscountry":("CrossCountry Consulting","Consulting"),
    "lek":("L.E.K. Consulting","Consulting"),
    "kearney-careers":("Kearney","Consulting"),
    "Simon-kucher":("Simon-Kucher","Consulting"),
    "exactera":("Exactera","Finance"),
    # Fintech / payments
    "braintree":("Braintree","Finance"),
    "zuora":("Zuora","Finance"),
    "chargebee":("Chargebee","Finance"),
    "recurly":("Recurly","Finance"),
    "maxio":("Maxio","Finance"),
    "paddle-inc":("Paddle","Finance"),
    "gocardless":("GoCardless","Finance"),
    "mollie":("Mollie","Finance"),
    "mangopay":("Mangopay","Finance"),
    "trustly":("Trustly","Finance"),
    "payrails":("Payrails","Finance"),
    "paymentics":("Paymentology","Finance"),
    # Healthcare
    "biofourmis":("Biofourmis","Healthcare"),
    "nuvation-bio":("Nuvation Bio","Healthcare"),
    "iterion":("Iterion","Healthcare"),
    "wellthy":("Wellthy","Healthcare"),
    "carrot-fertility":("Carrot Fertility","Healthcare"),
    "progyny":("Progyny","Healthcare"),
    "kindbody":("Kindbody","Healthcare"),
    "cofertility":("CoFertility","Healthcare"),
    "maven-clinic":("Maven Clinic","Healthcare"),
    "ovia-health":("Ovia Health","Healthcare"),
    "lifemd":("LifeMD","Healthcare"),
    # Media / content
    "axios":("Axios","Media"),
    "the-information":("The Information","Media"),
    "punchbowl":("Punchbowl News","Media"),
    "the-dispatch":("The Dispatch","Media"),
    "morning-brew":("Morning Brew","Media"),
    "the-hustle":("The Hustle","Media"),
    "skimm":("theSkimm","Media"),
    "muck-rack":("Muck Rack","Tech"),
    "cision-inc":("Cision","Media"),
    "propel-media":("Propel Media","Media"),
    # Climate / clean tech
    "arcadia-power":("Arcadia","Tech"),
    "cpower":("CPower","Tech"),
    "voltus":("Voltus","Tech"),
    "leap":("Leap","Tech"),
    "urjanet":("Urjanet","Tech"),
    "recurve":("Recurve","Tech"),
    "carbon-lighthouse":("Carbon Lighthouse","Tech"),
    "ecology-action":("Ecology Action","Nonprofit"),
    "clean-energy-trust":("Clean Energy Trust","Nonprofit"),
    # ── Added 2026-04-24: more Lever companies ──
    "figma-inc":("Figma","Tech"),
    "canva-inc":("Canva","Tech"),
    "miro-inc":("Miro","Tech"),
    "framer-inc":("Framer","Tech"),
    "webflow-inc":("Webflow","Tech"),
    "bubble-io":("Bubble","Tech"),
    "glide-app":("Glide","Tech"),
    "softr-io":("Softr","Tech"),
    "adalo-inc":("Adalo","Tech"),
    "wized":("Wized","Tech"),
    "plasmic":("Plasmic","Tech"),
    "builder-io":("Builder.io","Tech"),
    "bravo-studio":("Bravo Studio","Tech"),
    "draftbit":("Draftbit","Tech"),
    "thunkable":("Thunkable","Tech"),
    "appgyver":("AppGyver/SAP","Tech"),
    "mendix-jobs":("Mendix","Tech"),
    "outsystems-careers":("OutSystems","Tech"),
    "appian-jobs":("Appian","Tech"),
    "pega-careers":("Pegasystems","Tech"),
    "servicenow-jobs":("ServiceNow","Tech"),
    "salesforce-mulesoft":("MuleSoft","Tech"),
    "boomi-jobs":("Boomi","Tech"),
    "tibco-jobs":("TIBCO","Tech"),
    "snaplogic":("SnapLogic","Tech"),
    "informatica-jobs":("Informatica","Tech"),
    "talend-jobs":("Talend","Tech"),
    "fivetran-inc":("Fivetran","Tech"),
    "airbyte-io":("Airbyte","Tech"),
    "stitch-data":("Stitch","Tech"),
    "etleap":("ETLeap","Tech"),
    "hevo-data":("Hevo Data","Tech"),
    "matillion-jobs":("Matillion","Tech"),
    "dbt-labs":("dbt Labs","Tech"),
    "coalesce-io":("Coalesce","Tech"),
    "datafold-io":("Datafold","Tech"),
    "great-expectations":("Great Expectations","Tech"),
    "monte-carlo-data":("Monte Carlo Data","Tech"),
    "bigeye-io":("Bigeye","Tech"),
    "acceldata-io":("Acceldata","Tech"),
    "metaphor-data":("Metaphor Data","Tech"),
    "atlan-io":("Atlan","Tech"),
    "data-world":("data.world","Tech"),
    "collibra-jobs":("Collibra","Tech"),
    "alation-io":("Alation","Tech"),
    "select-star":("Select Star","Tech"),
    "secoda-io":("Secoda","Tech"),
}

ASHBY_COMPANIES = {
    "ramp":("Ramp","Finance"),"notion":("Notion","Tech"),"linear":("Linear","Tech"),
    "vercel":("Vercel","Tech"),"retool":("Retool","Tech"),"mercury":("Mercury","Finance"),
    "ironclad":("Ironclad","Tech"),"algolia":("Algolia","Tech"),
    # Dev tools / Open source (added 2026-04-12)
    "anthropic":("Anthropic","Tech"),"supabase":("Supabase","Tech"),
    "clerk":("Clerk","Tech"),"resend":("Resend","Tech"),
    "cal":("Cal.com","Tech"),"dub":("Dub","Tech"),
    "tinybird":("Tinybird","Tech"),"inngest":("Inngest","Tech"),

    # ── Batch added 2026-04-17: Ashby expansion ──
    "openai":("OpenAI","Tech"),"perplexity":("Perplexity","Tech"),
    "cohere":("Cohere","Tech"),"mistral":("Mistral","Tech"),
    "runway-ml":("Runway","Tech"),"characterai":("Character.AI","Tech"),
    "elevenlabs":("ElevenLabs","Tech"),"poolside":("Poolside","Tech"),
    "sierra":("Sierra","Tech"),"decagon":("Decagon","Tech"),
    "11x":("11x","Tech"),"lindy":("Lindy","Tech"),
    "writer":("Writer","Tech"),"adept":("Adept","Tech"),
    "harvey":("Harvey","Tech"),"eleven":("ElevenLabs","Tech"),
    "together":("Together AI","Tech"),"groq":("Groq","Tech"),
    "cerebras":("Cerebras","Tech"),"modal":("Modal","Tech"),
    "baseten":("Baseten","Tech"),"replicate":("Replicate","Tech"),
    "huggingface":("Hugging Face","Tech"),"weights-biases":("Weights & Biases","Tech"),
    "comet":("Comet","Tech"),"labelbox":("Labelbox","Tech"),
    "scale":("Scale AI","Tech"),"snorkel":("Snorkel AI","Tech"),
    "arize":("Arize AI","Tech"),"langchain":("LangChain","Tech"),
    "langfuse":("Langfuse","Tech"),"braintrust":("Braintrust","Tech"),
    "causal":("Causal","Finance"),"mosaic":("Mosaic","Finance"),
    "puzzle":("Puzzle","Finance"),"rho":("Rho","Finance"),
    "rho-business":("Rho","Finance"),
    "pave":("Pave","Tech"),"ontop":("Ontop","Tech"),
    "motion":("Motion","Tech"),"fyxer":("Fyxer","Tech"),
    "default":("Default","Tech"),"paragon":("Paragon","Tech"),
    "merge":("Merge","Tech"),"nylas":("Nylas","Tech"),
    "mercoa":("Mercoa","Finance"),"zip":("Zip","Tech"),
    "tropic":("Tropic","Tech"),"airbase":("Airbase","Finance"),
    "brexhq":("Brex","Finance"),
    "superhuman":("Superhuman","Tech"),"shortcut":("Shortcut","Tech"),
    "height":("Height","Tech"),"clickupapp":("ClickUp","Tech"),
    "pitch":("Pitch","Tech"),"tome":("Tome","Tech"),
    "beautifulai":("Beautiful.ai","Tech"),
    "dovetail":("Dovetail","Tech"),"maze":("Maze","Tech"),
    "hotjar":("Hotjar","Tech"),"userpilot":("Userpilot","Tech"),
    "statsig":("Statsig","Tech"),"eppo":("Eppo","Tech"),
    "amplitude-inc":("Amplitude","Tech"),
    "posthog":("PostHog","Tech"),"rudderstack":("RudderStack","Tech"),
    "hightouch":("Hightouch","Tech"),"census":("Census","Tech"),
    "prefect-io":("Prefect","Tech"),"modern-treasury":("Modern Treasury","Finance"),
    "increase":("Increase","Finance"),"unit":("Unit","Finance"),

    # ── Batch added 2026-04-23: 200k-scale Ashby expansion ──
    "retool-inc":("Retool","Tech"),"linear-app":("Linear","Tech"),
    "loom-inc":("Loom","Tech"),"raycast":("Raycast","Tech"),
    "arc-browser":("The Browser Company","Tech"),
    "thebrowsercompany":("The Browser Company","Tech"),
    "cursor":("Cursor","Tech"),"zed":("Zed","Tech"),
    "warp":("Warp","Tech"),"fig":("Fig","Tech"),
    "hyper":("Hyper","Tech"),
    "supermaven":("Supermaven","Tech"),
    "cody-ai":("Cody","Tech"),"pear-ai":("PearAI","Tech"),
    "tabby":("Tabby","Tech"),"aider-chat":("Aider","Tech"),
    "claudeanthropic":("Anthropic","Tech"),
    "bolt-new":("Bolt","Tech"),"lovable":("Lovable","Tech"),
    "v0":("v0","Tech"),
    "replitinc":("Replit","Tech"),
    "glean":("Glean","Tech"),"harvey-ai":("Harvey","Tech"),
    "hebbia":("Hebbia","Tech"),
    "viable":("Viable","Tech"),"maven":("Maven AGI","Tech"),
    "cresta":("Cresta","Tech"),"regal":("Regal","Tech"),
    "observe":("Observe","Tech"),"chronosphere":("Chronosphere","Tech"),
    "tetrate":("Tetrate","Tech"),"solo-io":("Solo.io","Tech"),
    "kong":("Kong","Tech"),"ambassador":("Ambassador","Tech"),
    # Fintech on Ashby
    "extend-api":("Extend","Finance"),"alloy":("Alloy","Finance"),
    "sardine":("Sardine","Finance"),"socure":("Socure","Finance"),
    "persona":("Persona","Finance"),"middesk":("Middesk","Finance"),
    "column":("Column","Finance"),"treasury-prime":("Treasury Prime","Finance"),
    "lithic":("Lithic","Finance"),"highnote":("Highnote","Finance"),
    "bond":("Bond","Finance"),"weaveworks":("Weaveworks","Tech"),

    # ── Batch added 2026-04-24: Ashby expansion ──
    # AI tools / LLM infra
    "fireworks-ai":("Fireworks AI","Tech"),
    "anyscale":("Anyscale","Tech"),
    "ray-project":("Ray/Anyscale","Tech"),
    "bentoml":("BentoML","Tech"),
    "tensorrt":("NVIDIA TensorRT","Tech"),
    "deepspeed":("DeepSpeed","Tech"),
    "axolotl-ai":("Axolotl","Tech"),
    "mistral-ai":("Mistral AI","Tech"),
    "lmstudio":("LM Studio","Tech"),
    "ollama":("Ollama","Tech"),
    "jan-ai":("Jan","Tech"),
    "continue-dev":("Continue","Tech"),
    "tabby-ml":("Tabby ML","Tech"),
    "twinny":("Twinny","Tech"),
    "fauxpilot":("FauxPilot","Tech"),
    # Developer tools
    "resend-inc":("Resend","Tech"),
    "upstash":("Upstash","Tech"),
    "neon-tech":("Neon","Tech"),
    "railway-app":("Railway","Tech"),
    "render-com":("Render","Tech"),
    "fly-io":("Fly.io","Tech"),
    "koyeb":("Koyeb","Tech"),
    "deno-land":("Deno","Tech"),
    "bun-js":("Bun","Tech"),
    "elysia-js":("Elysia","Tech"),
    "hono-js":("Hono","Tech"),
    "nitro-js":("Nitro","Tech"),
    "nuxt-js":("Nuxt","Tech"),
    "vite-js":("Vite","Tech"),
    "astro-build":("Astro","Tech"),
    # Fintech infrastructure
    "synctera":("Synctera","Finance"),
    "solid-fi":("Solid","Finance"),
    "piermont-bank":("Piermont Bank","Finance"),
    "evolve-bank":("Evolve Bank","Finance"),
    "lead-bank":("Lead Bank","Finance"),
    "lineage-bank":("Lineage Bank","Finance"),
    "blue-ridge-bank":("Blue Ridge Bank","Finance"),
    "cross-river":("Cross River","Finance"),
    "coastal-community":("Coastal Community Bank","Finance"),
    # B2B AI
    "aisera":("Aisera","Tech"),
    "moveworks":("Moveworks","Tech"),
    "forethought":("Forethought","Tech"),
    "kore-ai":("Kore.ai","Tech"),
    "rule-ai":("Rule","Tech"),
    "patterns-ai":("Patterns","Tech"),
    "basepilot":("BasePilot","Tech"),
    "induced-ai":("Induced AI","Tech"),
    "cogniflow":("Cogniflow","Tech"),
    "gumloop":("Gumloop","Tech"),
    "clay-hq":("Clay","Tech"),
    "make-hq":("Make","Tech"),
    "n8n-io":("n8n","Tech"),
    "zapier-inc":("Zapier","Tech"),
    "activepieces":("Activepieces","Tech"),
    # Research / policy
    "georgetown-cset":("Georgetown CSET","Education"),
    "cnas":("CNAS","Nonprofit"),
    "brookings":("Brookings Institution","Nonprofit"),
    "cato-institute":("Cato Institute","Nonprofit"),
    "heritage-foundation":("Heritage Foundation","Nonprofit"),
    "american-enterprise":("AEI","Nonprofit"),
    "wilson-center":("Wilson Center","Nonprofit"),
    "carnegie-endowment":("Carnegie Endowment","Nonprofit"),
    "center-for-american-progress":("Center for American Progress","Nonprofit"),
    "urban-institute-jobs":("Urban Institute","Nonprofit"),
    "resources-for-future":("Resources for the Future","Nonprofit"),
    # ── Added 2026-04-24: more Ashby companies ──
    "cursor-sh":("Cursor","Tech"),
    "zed-industries":("Zed","Tech"),
    "warp-terminal":("Warp","Tech"),
    "fig-io":("Fig","Tech"),
    "charm-sh":("Charm","Tech"),
    "hyper-io":("Hyper","Tech"),
    "tabby-sh":("Tabby","Tech"),
    "kitty-sh":("kitty","Tech"),
    "alacritty":("Alacritty","Tech"),
    "ghostty":("Ghostty","Tech"),
    "toptal-jobs":("Toptal","Tech"),
    "arc-dev":("Arc.dev","Tech"),
    "turing-inc":("Turing","Tech"),
    "crossover-work":("Crossover","Tech"),
    "lemon-io":("Lemon.io","Tech"),
    "terminal-io":("Terminal","Tech"),
    "andela-jobs":("Andela","Tech"),
    "remote-com":("Remote","Tech"),
    "deel-inc":("Deel","Tech"),
    "oyster-hr":("Oyster HR","Tech"),
    "papaya-global-jobs":("Papaya Global","Tech"),
    "velocity-global":("Velocity Global","Tech"),
    "safeguard-global":("Safeguard Global","Consulting"),
    "globalization-partners":("Globalization Partners","Consulting"),
    "airslate-inc":("airSlate","Tech"),
    "pandadoc-inc":("PandaDoc","Tech"),
    "docusign-jobs":("DocuSign","Tech"),
    "hellosign":("HelloSign/Dropbox","Tech"),
    "signwell":("SignWell","Tech"),
    "sign-easy":("SignEasy","Tech"),
    "signnow":("SignNow","Tech"),
    "jotform-inc":("JotForm","Tech"),
    "paperform-io":("Paperform","Tech"),
    "fillout-io":("Fillout","Tech"),
    "tally-so":("Tally","Tech"),
    "typeform-jobs":("Typeform","Tech"),
    "surveymonkey-jobs":("SurveyMonkey","Tech"),
    "qualtrics-jobs":("Qualtrics","Tech"),
    "medallia-jobs":("Medallia","Tech"),
    "momentive-jobs":("Momentive","Tech"),
    "birdeye-jobs":("Birdeye","Tech"),
    "podium-inc":("Podium","Tech"),
    "grade-us":("Grade.us","Tech"),
    "reviewtrackers":("ReviewTrackers","Tech"),
    "localiq":("LocaliQ","Tech"),
    "yext-jobs":("Yext","Tech"),
    "chatmeter":("Chatmeter","Tech"),
    "soci-inc":("Soci","Tech"),
    "sprout-social":("Sprout Social","Tech"),
    "loomly-inc":("Loomly","Tech"),
    "sendible":("Sendible","Tech"),
    "agorapulse":("Agorapulse","Tech"),
    "eclincher":("eClincher","Tech"),
    "vista-social":("Vista Social","Tech"),
    "pallyy":("Pallyy","Tech"),
    "statusbrew":("Statusbrew","Tech"),
    "planable-io":("Planable","Tech"),
    "later-inc":("Later","Tech"),
    "preview-app":("Preview App","Tech"),
    "tailwind-app":("Tailwind","Tech"),
    "iconosquare":("Iconosquare","Tech"),
    "brandwatch-jobs":("Brandwatch","Tech"),
    "talkwalker-jobs":("Talkwalker","Tech"),
    "mention-inc":("Mention","Tech"),
    "brand24-jobs":("Brand24","Tech"),
    "cyfe":("Cyfe","Tech"),
    "oktopost":("Oktopost","Tech"),
}

SMARTRECRUITERS_COMPANIES = {
    "Visa":("Visa","Finance"),"Bosch":("Bosch","Tech"),"KPMG":("KPMG","Consulting"),
    "PwC":("PwC","Consulting"),"EY":("EY","Consulting"),"Accenture":("Accenture","Consulting"),
    "Deloitte":("Deloitte","Consulting"),
    # Large enterprises (added 2026-04-12)
    "Johnson&Johnson":("Johnson & Johnson","Healthcare"),
    "Novartis":("Novartis","Healthcare"),"Siemens":("Siemens","Tech"),
    "SAP":("SAP","Tech"),"Salesforce":("Salesforce","Tech"),
    "LinkedIn":("LinkedIn","Tech"),"McDonalds":("McDonald's","Consumer"),
    "Starbucks":("Starbucks","Consumer"),"Nike":("Nike","Consumer"),
    "Adidas":("Adidas","Consumer"),"Disney":("Disney","Media"),
    "NBCUniversal":("NBCUniversal","Media"),"WarnerBros":("Warner Bros","Media"),

    # ── Batch added 2026-04-17: SmartRecruiters expansion ──
    "IBM":("IBM","Tech"),"Microsoft":("Microsoft","Tech"),
    "Oracle":("Oracle","Tech"),"Cisco":("Cisco","Tech"),
    "Intel":("Intel","Tech"),"AMD":("AMD","Tech"),
    "Qualcomm":("Qualcomm","Tech"),"Nvidia":("NVIDIA","Tech"),
    "HPE":("Hewlett Packard Enterprise","Tech"),"Dell":("Dell","Tech"),
    "Lenovo":("Lenovo","Tech"),"Canon":("Canon","Tech"),
    "Philips":("Philips","Tech"),"Schneider":("Schneider Electric","Tech"),
    "GE":("GE","Tech"),"Honeywell":("Honeywell","Tech"),
    "GeneralMotors":("General Motors","Tech"),
    "Ford":("Ford","Tech"),"Stellantis":("Stellantis","Tech"),
    "Volkswagen":("Volkswagen","Tech"),"Toyota":("Toyota","Tech"),
    "Honda":("Honda","Tech"),"Hyundai":("Hyundai","Tech"),
    "BMW":("BMW","Tech"),"Mercedes":("Mercedes-Benz","Tech"),
    "Pfizer":("Pfizer","Healthcare"),
    "Roche":("Roche","Healthcare"),"AstraZeneca":("AstraZeneca","Healthcare"),
    "Merck":("Merck","Healthcare"),"Bayer":("Bayer","Healthcare"),
    "BristolMyers":("Bristol Myers Squibb","Healthcare"),
    "Sanofi":("Sanofi","Healthcare"),"GSK":("GSK","Healthcare"),
    "HCAHealthcare":("HCA Healthcare","Healthcare"),"UnitedHealth":("UnitedHealth Group","Healthcare"),
    "CVSHealth":("CVS Health","Healthcare"),"Walgreens":("Walgreens","Healthcare"),
    "Kaiser":("Kaiser Permanente","Healthcare"),
    "JPMorganChase":("JPMorgan Chase","Finance"),"Citi":("Citi","Finance"),
    "BankofAmerica":("Bank of America","Finance"),"WellsFargo":("Wells Fargo","Finance"),
    "Goldman":("Goldman Sachs","Finance"),"MorganStanley":("Morgan Stanley","Finance"),
    "Mastercard":("Mastercard","Finance"),
    "AmericanExpress":("American Express","Finance"),
    "BlackRock":("BlackRock","Finance"),"Vanguard":("Vanguard","Finance"),
    "Fidelity":("Fidelity","Finance"),"CharlesSchwab":("Charles Schwab","Finance"),
    "CapitalOne":("Capital One","Finance"),"USBank":("U.S. Bank","Finance"),
    "PNC":("PNC","Finance"),
    "MetLife":("MetLife","Finance"),"Prudential":("Prudential","Finance"),
    "Allstate":("Allstate","Finance"),"StateFarm":("State Farm","Finance"),
    "Progressive":("Progressive","Finance"),"Geico":("GEICO","Finance"),
    "Liberty":("Liberty Mutual","Finance"),"Travelers":("Travelers","Finance"),
    "ProcterGamble":("Procter & Gamble","Consumer"),
    "Unilever":("Unilever","Consumer"),"Nestle":("Nestlé","Consumer"),
    "PepsiCo":("PepsiCo","Consumer"),"CocaCola":("Coca-Cola","Consumer"),
    "Colgate":("Colgate-Palmolive","Consumer"),
    "Kroger":("Kroger","Consumer"),"Costco":("Costco","Consumer"),
    "HomeDepot":("Home Depot","Consumer"),"Lowes":("Lowe's","Consumer"),
    "BestBuy":("Best Buy","Consumer"),"Macys":("Macy's","Consumer"),
    "TJX":("TJX Companies","Consumer"),"Gap":("Gap","Consumer"),
    "Lululemon":("Lululemon","Consumer"),"Patagonia":("Patagonia","Consumer"),
    "FedEx":("FedEx","Consumer"),"UPS":("UPS","Consumer"),
    "USPS":("USPS","Government"),"Amtrak":("Amtrak","Government"),
    "Delta":("Delta Air Lines","Consumer"),"United":("United Airlines","Consumer"),
    "American":("American Airlines","Consumer"),"Southwest":("Southwest Airlines","Consumer"),
    "JetBlue":("JetBlue","Consumer"),"Alaska":("Alaska Airlines","Consumer"),
    "Marriott":("Marriott","Consumer"),"Hilton":("Hilton","Consumer"),
    "Hyatt":("Hyatt","Consumer"),"IHG":("IHG","Consumer"),
    "Boeing":("Boeing","Tech"),"Lockheed":("Lockheed Martin","Tech"),
    "Raytheon":("Raytheon","Tech"),"NorthropGrumman":("Northrop Grumman","Tech"),
    "GeneralDynamics":("General Dynamics","Tech"),
    "Comcast":("Comcast","Media"),"Verizon":("Verizon","Tech"),
    "ATT":("AT&T","Tech"),"TMobile":("T-Mobile","Tech"),
    "Sprint":("Sprint","Tech"),"CharterComm":("Charter Communications","Media"),
    "Capgemini":("Capgemini","Consulting"),
    "IBMConsulting":("IBM Consulting","Consulting"),
    "BoozAllen":("Booz Allen Hamilton","Consulting"),
    "Mercer":("Mercer","Consulting"),"Slalom":("Slalom","Consulting"),
    "ZSAssociates":("ZS Associates","Consulting"),
    "ATKearney":("Kearney","Consulting"),
    "LEKConsulting":("L.E.K. Consulting","Consulting"),
    "Oliver":("Oliver Wyman","Consulting"),
    "Xerox":("Xerox","Tech"),"Fujitsu":("Fujitsu","Tech"),
    "Samsung":("Samsung","Tech"),"Sony":("Sony","Tech"),
    "LG":("LG","Tech"),

    # ── Batch added 2026-04-24: SmartRecruiters expansion ──
    # More enterprise / big employer slugs on SmartRecruiters
    "Airbus":("Airbus","Tech"),"RollsRoyce":("Rolls-Royce","Tech"),
    "Thales":("Thales","Tech"),"BAESystems":("BAE Systems","Tech"),
    "BASF":("BASF","Tech"),"DowChemical":("Dow","Tech"),
    "3M":("3M","Tech"),"Eaton":("Eaton","Tech"),
    "Emerson":("Emerson","Tech"),"Rockwell":("Rockwell Automation","Tech"),
    "ParkerHannifin":("Parker Hannifin","Tech"),
    "IllinoisTool":("Illinois Tool Works","Tech"),
    "Danaher":("Danaher","Tech"),"Fortive":("Fortive","Tech"),
    "Dover":("Dover","Tech"),"Graco":("Graco","Tech"),
    "Xylem":("Xylem","Tech"),"Roper":("Roper Technologies","Tech"),
    "Mettler":("Mettler-Toledo","Tech"),
    "WattsWater":("Watts Water","Tech"),
    "Mueller":("Mueller Industries","Tech"),
    "Watts":("Watts Water Technologies","Tech"),
    # Retail / consumer global
    "Ikea":("IKEA","Consumer"),"H&M":("H&M","Consumer"),
    "Zara":("Zara/Inditex","Consumer"),"Uniqlo":("Uniqlo","Consumer"),
    "Primark":("Primark","Consumer"),"TopShop":("Topshop","Consumer"),
    "Asos":("ASOS","Consumer"),"Boohoo":("Boohoo","Consumer"),
    "PrettyLittleThing":("PrettyLittleThing","Consumer"),
    "FarFetch":("Farfetch","Consumer"),
    # Consulting Europe
    "RolandBerger":("Roland Berger","Consulting"),
    "McKinseyEurope":("McKinsey","Consulting"),
    "BostonConsulting":("BCG","Consulting"),
    "CapgeminiConsulting":("Capgemini Consulting","Consulting"),
    "InfosysConsulting":("Infosys","Consulting"),
    "WiproConsulting":("Wipro","Consulting"),
    "TCS":("Tata Consultancy Services","Consulting"),
    "HCL":("HCL Technologies","Consulting"),
    "CognizantGlobal":("Cognizant","Consulting"),
    "DXC":("DXC Technology","Consulting"),
    # Financial institutions Europe/Global
    "HSBC":("HSBC","Finance"),"Barclays":("Barclays","Finance"),
    "DeutscheBank":("Deutsche Bank","Finance"),
    "CreditSuisse":("Credit Suisse","Finance"),
    "UBS":("UBS","Finance"),"BNPParibas":("BNP Paribas","Finance"),
    "SocieteGenerale":("Société Générale","Finance"),
    "ING":("ING","Finance"),"ABN":("ABN AMRO","Finance"),
    "RaboBank":("Rabobank","Finance"),
    "AllianzGlobal":("Allianz","Finance"),
    "AXA":("AXA","Finance"),"MunichRe":("Munich Re","Finance"),
    "SwissRe":("Swiss Re","Finance"),
    # ── Added 2026-04-24: more SmartRecruiters companies ──
    "SiemensHealthineers":("Siemens Healthineers","Healthcare"),
    "BayerGroup":("Bayer","Healthcare"),
    "Novartis":("Novartis","Healthcare"),
    "Roche":("Roche","Healthcare"),
    "AstraZeneca":("AstraZeneca","Healthcare"),
    "GlaxoSmithKline":("GSK","Healthcare"),
    "Sanofi":("Sanofi","Healthcare"),
    "AbbVie":("AbbVie","Healthcare"),
    "Eli-Lilly":("Eli Lilly","Healthcare"),
    "Bristol-Myers-Squibb":("Bristol Myers Squibb","Healthcare"),
    "Takeda":("Takeda","Healthcare"),
    "UCB":("UCB","Healthcare"),
    "Ipsen":("Ipsen","Healthcare"),
    "Chiesi":("Chiesi","Healthcare"),
    "Menarini":("Menarini","Healthcare"),
    "Ferring":("Ferring","Healthcare"),
    "Lundbeck":("Lundbeck","Healthcare"),
    "LEO-Pharma":("LEO Pharma","Healthcare"),
    "Galderma":("Galderma","Healthcare"),
    "ICON-plc":("ICON plc","Healthcare"),
    "Syneos-Health":("Syneos Health","Healthcare"),
    "PRA-Health":("PRA Health Sciences","Healthcare"),
    "PPD-Inc":("PPD","Healthcare"),
    "Covance":("Covance/Labcorp","Healthcare"),
    "Charles-River":("Charles River Laboratories","Healthcare"),
    "Eurofins":("Eurofins Scientific","Healthcare"),
    "SGS-Group":("SGS Group","Consulting"),
    "Bureau-Veritas":("Bureau Veritas","Consulting"),
    "Intertek":("Intertek","Consulting"),
    "DNV":("DNV","Consulting"),
    "TUV":("TUV Rheinland","Consulting"),
    "Dekra":("Dekra","Consulting"),
    "Applus":("Applus","Consulting"),
    "Element-Materials":("Element Materials","Consulting"),
    "Mistras-Group":("Mistras Group","Consulting"),
    "Team-Industrial":("Team Industrial","Consulting"),
    "Aegion-Corp":("Aegion","Consulting"),
    "NV5-Global":("NV5","Consulting"),
    "Terracon":("Terracon","Consulting"),
    "GHD-Group":("GHD","Consulting"),
    "Tetra-Tech":("Tetra Tech","Consulting"),
    "AECOM-jobs":("AECOM","Consulting"),
    "ICF-International":("ICF","Consulting"),
    "Leidos-jobs":("Leidos","Government"),
    "ManTech":("ManTech","Government"),
    "Engility":("Engility","Government"),
    "DXC-Technology":("DXC Technology","Tech"),
    "Unisys-Corp":("Unisys","Tech"),
    "Conduent":("Conduent","Tech"),
    "Maximus-Inc":("Maximus","Government"),
    "CSRA-Inc":("CSRA","Government"),
    "Peraton":("Peraton","Government"),
    "Amentum":("Amentum","Government"),
    "PAE-Inc":("PAE","Government"),
    "Vectrus":("Vectrus","Government"),
    "Fluor-Corp":("Fluor","Consulting"),
    "KBR-Inc":("KBR","Consulting"),
    "BECHTEL":("Bechtel","Consulting"),
    "McDermott":("McDermott","Consulting"),
    "Foster-Wheeler":("Foster Wheeler","Consulting"),
    "CB-I":("CBI","Consulting"),
}

JAZZHR_COMPANIES = {
    # JazzHR (applytojob.com) — used by SMBs, agencies, healthcare, staffing.
    # Slugs that 404 are silently skipped by crawl_jazzhr's try/except.
    # ── Verified/likely JazzHR slugs ──
    "lullabot":           ("Lullabot", "Tech"),
    "hirequest":          ("HireQuest", "Consulting"),
    "fundrise":           ("Fundrise", "Finance"),
    "vidyard":            ("Vidyard", "Tech"),
    "appcues":            ("Appcues", "Tech"),
    "pagely":             ("Pagely", "Tech"),
    "wpengine-careers":   ("WP Engine", "Tech"),
    "builtinchicago":     ("Built In", "Tech"),
    "lever-co":           ("Lever", "Tech"),
    "bark":               ("Bark", "Consumer"),
    "homebase":           ("Homebase", "Tech"),
    "workstream":         ("Workstream", "Tech"),
    "gusto-hr":           ("Gusto", "Tech"),
    "sprout":             ("Sprout Social", "Tech"),
    "brainware":          ("Brainware", "Tech"),
    "aon-hewitt":         ("Aon", "Finance"),
    "zywave":             ("Zywave", "Tech"),
    "resultant":          ("Resultant", "Consulting"),
    "credera":            ("Credera", "Consulting"),
    "pariveda":           ("Pariveda", "Consulting"),
    "west-monroe":        ("West Monroe", "Consulting"),
    "kin-insurance":      ("Kin Insurance", "Finance"),
    "clearcover":         ("Clearcover", "Finance"),
    "hippo-insurance":    ("Hippo", "Finance"),
    "branch-insurance":   ("Branch", "Finance"),
    "openly":             ("Openly", "Finance"),
    "pie-insurance":      ("Pie Insurance", "Finance"),
    "ethos-life":         ("Ethos", "Finance"),
    "ladder":             ("Ladder", "Finance"),
    "bestow":             ("Bestow", "Finance"),
    "canvas-dental":      ("Canvas Dental", "Healthcare"),
    "dental-care":        ("Dental Care Alliance", "Healthcare"),
    "pacific-dental":     ("Pacific Dental Services", "Healthcare"),
    "dentalworks":        ("DentalWorks", "Healthcare"),
    "heartland-dental":   ("Heartland Dental", "Healthcare"),
    "smiledirectclub":    ("SmileDirectClub", "Healthcare"),
    "byte-aligners":      ("Byte", "Healthcare"),
    "candid-co":          ("Candid", "Healthcare"),
    "tend-dental":        ("Tend", "Healthcare"),
    # Staffing / workforce
    "integrity-staffing": ("Integrity Staffing", "Consulting"),
    "aerotek":            ("Aerotek", "Consulting"),
    "kelly-services":     ("Kelly Services", "Consulting"),
    "staffmark":          ("Staffmark", "Consulting"),
    "trueblue":           ("TrueBlue", "Consulting"),
    "employbridge":       ("Employbridge", "Consulting"),
    "spherion":           ("Spherion", "Consulting"),
    "elwood-staffing":    ("Elwood Staffing", "Consulting"),
    # Marketing agencies
    "publicis-sapient":   ("Publicis Sapient", "Consulting"),
    "ogilvy":             ("Ogilvy", "Media"),
    "havas":              ("Havas", "Media"),
    "wunderman-thompson": ("Wunderman Thompson", "Media"),
    "grey-group":         ("Grey Group", "Media"),
    "droga5":             ("Droga5", "Media"),
    "huge":               ("Huge", "Tech"),
    "razorfish":          ("Razorfish", "Tech"),
    "sapient":            ("Sapient", "Tech"),
}

RECRUITEE_COMPANIES = {
    # Recruitee (recruitee.com) — popular with European tech companies.
    # Slugs that 404 are silently skipped.
    "buffer":             ("Buffer", "Tech"),
    "toggl":              ("Toggl", "Tech"),
    "smallpdf":           ("Smallpdf", "Tech"),
    "prezly":             ("Prezly", "Tech"),
    "mews":               ("Mews", "Tech"),
    "framer":             ("Framer", "Tech"),
    "gitguardian":        ("GitGuardian", "Tech"),
    "swarmia":            ("Swarmia", "Tech"),
    "luno":               ("Luno", "Finance"),
    "spendesk":           ("Spendesk", "Finance"),
    "qonto":              ("Qonto", "Finance"),
    "billie":             ("Billie", "Finance"),
    "treez":              ("Treez", "Tech"),
    "aircall":            ("Aircall", "Tech"),
    "ringover":           ("Ringover", "Tech"),
    "dialpad":            ("Dialpad", "Tech"),
    "loom-video":         ("Loom", "Tech"),
    "remote-com":         ("Remote", "Tech"),
    "omnipresent":        ("Omnipresent", "Tech"),
    "deel-hr":            ("Deel", "Tech"),
    "multiplier":         ("Multiplier", "Tech"),
    "velocity-global":    ("Velocity Global", "Tech"),
    "globalization":      ("Globalization Partners", "Tech"),
    "oysterhr":           ("Oyster HR", "Tech"),
    "workmotion":         ("WorkMotion", "Tech"),
    "pento":              ("Pento", "Tech"),
    "humaans":            ("Humaans", "Tech"),
    "personio-careers":   ("Personio", "Tech"),
    "kenjo":              ("Kenjo", "Tech"),
    "factorial":          ("Factorial", "Tech"),
    "holded":             ("Holded", "Tech"),
    "sesame-hr":          ("Sesame HR", "Tech"),
    "bamboohr-inc":       ("BambooHR", "Tech"),
    "15five-inc":         ("15Five", "Tech"),
    "lattice-hq":         ("Lattice", "Tech"),
    "hi-bob":             ("HiBob", "Tech"),
    "workable-inc":       ("Workable", "Tech"),
    "manatal":            ("Manatal", "Tech"),
    # Non-tech European
    "delivery-hero":      ("Delivery Hero", "Consumer"),
    "gorillas":           ("Gorillas", "Consumer"),
    "flink":              ("Flink", "Consumer"),
    "getir":              ("Getir", "Consumer"),
    "jokr":               ("JOKR", "Consumer"),
    "zapp":               ("Zapp", "Consumer"),
    "rohlik":             ("Rohlik", "Consumer"),
    "picnic":             ("Picnic", "Consumer"),
    "flaschenpost":       ("Flaschenpost", "Consumer"),
    "urban-sports":       ("Urban Sports Club", "Consumer"),
    "gympass":            ("Gympass", "Consumer"),
    "classpass":          ("ClassPass", "Consumer"),
}

BREEZYHR_COMPANIES = {
    # BreezyHR (breezy.hr) — used by SMBs in tech, healthcare, marketing.
    # Slugs that 404 are silently skipped.
    "anthropic-ai":       ("Anthropic", "Tech"),
    "scale-ai-inc":       ("Scale AI", "Tech"),
    "stability-ai":       ("Stability AI", "Tech"),
    "midjourney":         ("Midjourney", "Tech"),
    "inflection-ai":      ("Inflection AI", "Tech"),
    "adept-ai":           ("Adept", "Tech"),
    "atlas-ai":           ("Atlas AI", "Tech"),
    "primer":             ("Primer AI", "Tech"),
    "govini-ai":          ("Govini", "Tech"),
    "veritas":            ("Veritas", "Tech"),
    "nuvolo":             ("Nuvolo", "Tech"),
    "servicemax":         ("ServiceMax", "Tech"),
    "maint":              ("UpKeep", "Tech"),
    "upkeep-maintenance": ("UpKeep", "Tech"),
    "limble-cmms":        ("Limble CMMS", "Tech"),
    "fiix-software":      ("Fiix Software", "Tech"),
    "emaint":             ("eMaint", "Tech"),
    "hexagon-ppm":        ("Hexagon PPM", "Tech"),
    "infor-eam":          ("Infor EAM", "Tech"),
    "ibm-maximo":         ("IBM Maximo", "Tech"),
    "accruent":           ("Accruent", "Tech"),
    "planon":             ("Planon", "Tech"),
    "archibus":           ("Archibus", "Tech"),
    "iwms":               ("IWMS", "Tech"),
    "fm-systems":         ("FM Systems", "Tech"),
    "spaceiq":            ("SpaceIQ", "Tech"),
    # Marketing tech SMBs
    "sprinklr-inc":       ("Sprinklr", "Tech"),
    "hootsuite-inc":      ("Hootsuite", "Tech"),
    "buffer-social":      ("Buffer", "Tech"),
    "later-app":          ("Later", "Tech"),
    "loomly":             ("Loomly", "Tech"),
    "sendible":           ("Sendible", "Tech"),
    "agorapulse":         ("Agorapulse", "Tech"),
    "meltwater":          ("Meltwater", "Tech"),
    "cision":             ("Cision", "Tech"),
    "pr-newswire":        ("PR Newswire", "Media"),
    "businesswire":       ("Business Wire", "Media"),
    # Healthcare SMBs
    "athenahealth":       ("Athenahealth", "Healthcare"),
    "drchrono":           ("DrChrono", "Healthcare"),
    "modernizing-med":    ("Modernizing Medicine", "Healthcare"),
    "practice-fusion":    ("Practice Fusion", "Healthcare"),
    "eclinicalworks":     ("eClinicalWorks", "Healthcare"),
    "kareo":              ("Kareo", "Healthcare"),
    "advancedmd":         ("AdvancedMD", "Healthcare"),
    "clinicient":         ("Clinicient", "Healthcare"),
    "webpt":              ("WebPT", "Healthcare"),
    "netsmart":           ("Netsmart", "Healthcare"),
    # Finance / insurance SMBs
    "openly-insurance":   ("Openly", "Finance"),
    "clover-health":      ("Clover Health", "Finance"),
    "oscar-health":       ("Oscar Health", "Finance"),
    "alignment-health":   ("Alignment Healthcare", "Finance"),
    "devoted-health":     ("Devoted Health", "Finance"),
    "bright-health":      ("Bright Health", "Finance"),
    "friday-health":      ("Friday Health Plans", "Finance"),
    "sana-benefits":      ("Sana Benefits", "Finance"),
}

PINPOINT_COMPANIES = {
    # Pinpoint (pinpointhq.com) — used by UK/EU tech companies.
    # Slugs that 404 are silently skipped.
    "tide":               ("Tide", "Finance"),
    "cleo":               ("Cleo", "Finance"),
    "chip":               ("Chip", "Finance"),
    "dozens":             ("Dozens", "Finance"),
    "hyperjar":           ("HyperJar", "Finance"),
    "penfold":            ("Penfold", "Finance"),
    "wealthify":          ("Wealthify", "Finance"),
    "moneybox":           ("Moneybox", "Finance"),
    "plum":               ("Plum", "Finance"),
    "nude":               ("Nude", "Finance"),
    "acorn":              ("Acorns UK", "Finance"),
    "moneyfarm":          ("Moneyfarm", "Finance"),
    "pensionbee":         ("PensionBee", "Finance"),
    "cushon":             ("Cushon", "Finance"),
    "salary-finance":     ("Salary Finance", "Finance"),
    "hastee":             ("Hastee", "Finance"),
    "wagestream":         ("Wagestream", "Finance"),
    "earnd":              ("Earnd", "Finance"),
    "level":              ("Level", "Finance"),
    "payday":             ("Payday", "Finance"),
    "birdie":             ("Birdie", "Healthcare"),
    "beamery":            ("Beamery", "Tech"),
    "otta":               ("Otta", "Tech"),
    "cord":               ("Cord", "Tech"),
    "workshape":          ("Workshape", "Tech"),
    "hired":              ("Hired", "Tech"),
    "hackajob":           ("Hackajob", "Tech"),
    "talent-works":       ("TalentWorks", "Tech"),
    "headfirst":          ("HeadFirst", "Tech"),
    "eden-scott":         ("Eden Scott", "Consulting"),
    "bright-network":     ("Bright Network", "Tech"),
    "gradcafe":           ("GradCafe", "Education"),
    "targetjobs":         ("TargetJobs", "Education"),
    "prospects":          ("Prospects", "Education"),
    "milkround":          ("Milkround", "Education"),
}

TEAMTAILOR_COMPANIES = {
    # Teamtailor (teamtailor.com) — popular in Scandinavia + EU tech
    # Slugs are the company's subdomain prefix on teamtailor.com
    "klarna":             ("Klarna", "Finance"),
    "spotify":            ("Spotify", "Media"),
    "king":               ("King (Candy Crush)", "Media"),
    "mojang":             ("Mojang Studios", "Media"),
    "ingka-group":        ("IKEA/Ingka Group", "Consumer"),
    "hm-group":           ("H&M Group", "Consumer"),
    "electrolux":         ("Electrolux", "Consumer"),
    "volvogroup":         ("Volvo Group", "Tech"),
    "scania":             ("Scania", "Tech"),
    "sandvik":            ("Sandvik", "Tech"),
    "skf":                ("SKF", "Tech"),
    "abb":                ("ABB", "Tech"),
    "atlas-copco":        ("Atlas Copco", "Tech"),
    "tele2":              ("Tele2", "Tech"),
    "telia":              ("Telia", "Tech"),
    "swisscom":           ("Swisscom", "Tech"),
    "elgiganten":         ("Elgiganten", "Consumer"),
    "coop":               ("Coop", "Consumer"),
    "norgesgruppen":      ("NorgesGruppen", "Consumer"),
    "reitan":             ("Reitan", "Consumer"),
    "tradeshift":         ("Tradeshift", "Tech"),
    "peltarion":          ("Peltarion", "Tech"),
    "bambora":            ("Bambora", "Finance"),
    "izettle":            ("iZettle/PayPal", "Finance"),
    "lendo":              ("Lendo", "Finance"),
    "qred":               ("Qred", "Finance"),
    "capcito":            ("Capcito", "Finance"),
    "lysa":               ("Lysa", "Finance"),
    "zensum":             ("Zensum", "Finance"),
    "northmill":          ("Northmill", "Finance"),
    "rocker":             ("Rocker", "Finance"),
    "anyfin":             ("Anyfin", "Finance"),
    "mynt":               ("Mynt", "Finance"),
    "froda":              ("Froda", "Finance"),
    "enkla":              ("Enkla", "Finance"),
    "loanstep":           ("LoanStep", "Finance"),
    "hedvig":             ("Hedvig", "Finance"),
    "insurely":           ("Insurely", "Finance"),
    "treyd":              ("Treyd", "Finance"),
    "capcito-finance":    ("Capcito Finance", "Finance"),
    "kaddio":             ("Kaddio", "Healthcare"),
    "mindoktor":          ("Min Doktor", "Healthcare"),
    "doktor24":           ("Doktor24", "Healthcare"),
    "health-navigator":   ("Health Navigator", "Healthcare"),
    "wellstreet":         ("Wellstreet", "Consulting"),
    "dfinderjobs":        ("Dfinder", "Consulting"),
    "oddwork":            ("Oddwork", "Consulting"),
    "bravura":            ("Bravura", "Consulting"),
}

JOBVITE_COMPANIES = {
    # Jobvite company IDs. Each is the identifier in the Jobvite
    # public API: jobs.jobvite.com/api/1/company/<id>/jobs
    "twitter":            ("Twitter/X", "Tech"),
    "linkedin":           ("LinkedIn", "Tech"),
    "airbnb":             ("Airbnb", "Tech"),
    "lyft":               ("Lyft", "Tech"),
    "square":             ("Block (Square)", "Tech"),
    "cloudera":           ("Cloudera", "Tech"),
    "splunk":             ("Splunk", "Tech"),
    "pandora":            ("Pandora", "Media"),
    "amc":                ("AMC Networks", "Media"),
    "npr":                ("NPR", "Media"),
    "buzzfeed":           ("BuzzFeed", "Media"),
    "vox-media":          ("Vox Media", "Media"),
    "iheartmedia":        ("iHeartMedia", "Media"),
    "sirius-xm":          ("SiriusXM", "Media"),
    "discovery":          ("Discovery", "Media"),
    "univision":          ("Univision", "Media"),
    "hearst-tv":          ("Hearst TV", "Media"),
    "nexstar":            ("Nexstar Media", "Media"),
    "gray-television":    ("Gray Television", "Media"),
    "sinclair":           ("Sinclair Broadcast", "Media"),
    "raycom":             ("Raycom Media", "Media"),
    "emmis":              ("Emmis Communications", "Media"),
    "cumulus":            ("Cumulus Media", "Media"),
    "entercom":           ("Entercom/Audacy", "Media"),
    "hubbard":            ("Hubbard Broadcasting", "Media"),
    "saga":               ("Saga Communications", "Media"),
    "beasley":            ("Beasley Media", "Media"),
    "townsquare":         ("Townsquare Media", "Media"),
    "sun-broadcasting":   ("Sun Broadcasting", "Media"),
    "scripps":            ("E.W. Scripps", "Media"),
    "univision-pr":       ("Univision Puerto Rico", "Media"),
    "medscape":           ("Medscape/WebMD", "Healthcare"),
    "healtheon":          ("Healtheon", "Healthcare"),
    "healthstream":       ("HealthStream", "Healthcare"),
    "allscripts":         ("Allscripts", "Healthcare"),
    "streamline-health":  ("Streamline Health", "Healthcare"),
    "nant-health":        ("NantHealth", "Healthcare"),
    "apixio":             ("Apixio", "Healthcare"),
    "accretive-health":   ("Accretive Health", "Healthcare"),
    "aecom":              ("AECOM", "Consulting"),
    "jacobs":             ("Jacobs Engineering", "Consulting"),
    "parsons":            ("Parsons Corporation", "Consulting"),
    "wsp":                ("WSP Global", "Consulting"),
    "burns-mcdonnell":    ("Burns & McDonnell", "Consulting"),
    "black-veatch":       ("Black & Veatch", "Consulting"),
    "cdw":                ("CDW", "Tech"),
    "insight-direct":     ("Insight Direct", "Tech"),
    "sps-commerce":       ("SPS Commerce", "Tech"),
    "digital-river":      ("Digital River", "Tech"),
    "overstock":          ("Overstock.com", "Consumer"),
    "wayfair":            ("Wayfair", "Consumer"),
}

COMEET_COMPANIES = {
    # Comeet company IDs for the positions API.
    # Format: company_token → (display_name, industry)
    "wix":                ("Wix", "Tech"),
    "monday":             ("Monday.com", "Tech"),
    "ironSource":         ("ironSource", "Tech"),
    "appsflyer":          ("AppsFlyer", "Tech"),
    "similarweb":         ("SimilarWeb", "Tech"),
    "fiverr":             ("Fiverr", "Tech"),
    "bringg":             ("Bringg", "Tech"),
    "kaltura":            ("Kaltura", "Tech"),
    "checkmarx":          ("Checkmarx", "Tech"),
    "illusive-networks":  ("Illusive Networks", "Tech"),
    "armis":              ("Armis Security", "Tech"),
    "sygnia":             ("Sygnia", "Tech"),
    "panorays":           ("Panorays", "Tech"),
    "sternum":            ("Sternum IoT", "Tech"),
    "cato-networks":      ("Cato Networks", "Tech"),
    "radware":            ("Radware", "Tech"),
    "tufin":              ("Tufin", "Tech"),
    "sasa-software":      ("Sasa Software", "Tech"),
    "guardicore":         ("Guardicore", "Tech"),
    "perception-point":   ("Perception Point", "Tech"),
    "cybereason":         ("Cybereason", "Tech"),
    "hunters":            ("Hunters", "Tech"),
    "sysdig":             ("Sysdig", "Tech"),
    "gong":               ("Gong", "Tech"),
    "yotpo":              ("Yotpo", "Tech"),
    "glassbox":           ("Glassbox", "Tech"),
    "optibus":            ("Optibus", "Tech"),
    "riskified":          ("Riskified", "Tech"),
    "walk-me":            ("WalkMe", "Tech"),
    "papaya-global":      ("Papaya Global", "Tech"),
    "guesty":             ("Guesty", "Tech"),
    "trigo":              ("Trigo", "Tech"),
    "vayyar":             ("Vayyar", "Tech"),
    "mobileye":           ("Mobileye", "Tech"),
    "partner":            ("Partner Communications", "Tech"),
    "bezeq":              ("Bezeq", "Tech"),
    "pelephone":          ("Pelephone", "Tech"),
    "hot":                ("HOT Mobile", "Tech"),
    "mizrahi-tefahot":    ("Mizrahi-Tefahot Bank", "Finance"),
    "discount-bank":      ("Discount Bank", "Finance"),
    "leumi":              ("Bank Leumi", "Finance"),
    "hapoalim":           ("Bank Hapoalim", "Finance"),
    "fibi":               ("First International Bank", "Finance"),
    "isracard":           ("Isracard", "Finance"),
    "shva":               ("Shva", "Finance"),
    "visa-cal":           ("Cal Credit Card", "Finance"),
    "max-it-finance":     ("Max-It Finance", "Finance"),
    "clalit":             ("Clalit Health", "Healthcare"),
    "maccabi":            ("Maccabi Healthcare", "Healthcare"),
    "meuhedet":           ("Meuhedet", "Healthcare"),
    "assuta":             ("Assuta Medical Centers", "Healthcare"),
}

FOUNTAIN_COMPANIES = {
    # Fountain (getfountain.com) — high-volume frontline / hourly hiring
    # Many on-demand / gig / logistics companies use Fountain
    "gopuff":             ("Gopuff", "Consumer"),
    "doordash":           ("DoorDash", "Consumer"),
    "instacart":          ("Instacart", "Consumer"),
    "amazon-flex":        ("Amazon Flex", "Consumer"),
    "shipt":              ("Shipt", "Consumer"),
    "favor":              ("Favor Delivery", "Consumer"),
    "caviar":             ("Caviar", "Consumer"),
    "shef":               ("Shef", "Consumer"),
    "misfits-market":     ("Misfits Market", "Consumer"),
    "gorillas":           ("Gorillas", "Consumer"),
    "flink":              ("Flink", "Consumer"),
    "getir":              ("Getir", "Consumer"),
    "zapp":               ("Zapp", "Consumer"),
    "jiffy":              ("Jiffy", "Consumer"),
    "jokr":               ("JOKR", "Consumer"),
    "buyk":               ("Buyk", "Consumer"),
    "oja":                ("Oja", "Consumer"),
    "duffl":              ("Duffl", "Consumer"),
    "zepto":              ("Zepto", "Consumer"),
    "blinkit":            ("Blinkit", "Consumer"),
    "dunzo":              ("Dunzo", "Consumer"),
    "lalamove":           ("Lalamove", "Consumer"),
    "borzo":              ("Borzo", "Consumer"),
    "stuart":             ("Stuart Delivery", "Consumer"),
    "yango":              ("Yango Delivery", "Consumer"),
    "glovo":              ("Glovo", "Consumer"),
    "wolt":               ("Wolt", "Consumer"),
    "bolt-food":          ("Bolt Food", "Consumer"),
    "deliveroo":          ("Deliveroo", "Consumer"),
    "uber-eats":          ("Uber Eats", "Consumer"),
    "lyft-driver":        ("Lyft", "Consumer"),
    "via":                ("Via", "Consumer"),
    "zum":                ("Zum", "Consumer"),
    "hop-skip-drive":     ("HopSkipDrive", "Consumer"),
    "alto":               ("Alto", "Consumer"),
    "empower":            ("Empower Rideshare", "Consumer"),
    "revel":              ("Revel", "Consumer"),
    "check":              ("Check", "Consumer"),
    "nimble":             ("Nimble Robotics", "Tech"),
    "locus-robotics":     ("Locus Robotics", "Tech"),
    "6-river":            ("6 River Systems", "Tech"),
    "kindred":            ("Kindred", "Tech"),
    "attabotics":         ("Attabotics", "Tech"),
    "geek-plus":          ("Geek+", "Tech"),
    "greyorange":         ("GreyOrange", "Tech"),
    "berkshire-grey":     ("Berkshire Grey", "Tech"),
    "hai-robotics":       ("HAI Robotics", "Tech"),
    "mujin":              ("Mujin", "Tech"),
    "vecna-robotics":     ("Vecna Robotics", "Tech"),
}

INTERN_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [
    r'\bintern\b', r'\binternship\b', r'\bco-op\b', r'\bcoop\b',
    r'\bsummer\s+\d{4}\b', r'\bsummer\s+analyst\b', r'\bsummer\s+associate\b',
    r'\bfellowship\b', r'\bsummer\s+program\b', r'\bstudent\s+program\b',
    r'\bscholar\b',  # most scholarship programs are summer research
]]

NON_UNDERGRAD = [re.compile(p, re.IGNORECASE) for p in [r'\bPhD\b',r'\bPh\.D\b',r'\bMBA\b',r"\bMaster'?s\b",r'\bDoctoral\b',r'\bPost-?[Dd]oc\b',r'\bGraduate Student\b']]

SENIOR_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [r'\bSenior\b',r'\bSr\.?\b',r'\bStaff\b',r'\bPrincipal\b',r'\bDirector\b',r'\bVP\b',r'\bVice President\b',r'\bHead of\b',r'\bLead\b',r'\bManager(?!.*intern)\b',r'\b[5-9]\+? years\b',r'\b\d{2}\+? years\b']]

ENTRY_LEVEL_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [
    r'\bentry[- ]level\b', r'\bnew grad\b', r'\bearly career\b',
    r'\brecent graduate\b', r'\bemerging talent\b', r'\bcampus\b',
    r'\bjunior\b', r'\bassociate\b(?!.*director)', r'\bcoordinator\b',
    r'\btrainee\b', r'\bapprenticeship\b', r'\bfellowship\b',
    r'\brotational\b', r'\brotation program\b',
    r'\b0-1 years\b', r'\b0-2 years\b', r'\b1-2 years\b', r'\b0 to 2 years\b',
    r'\bno experience\b', r'\bno prior experience\b', r'\bgreenfield\b',
    r'\bgraduate program\b', r'\bfresh graduate\b', r'\bfreshly graduated\b',
    r'\bgraduating\s+\d{4}\b', r'\bclass of \d{4}\b',
    r'\brepresentative\b', r'\bspecialist\b', r'\bassistant\b',
    r'\banalyst\b', r'\bclerk\b', r'\btechnician\b',
    r'\badvisor\b', r'\btutor\b', r'\bmentor\b',
    r'\bassociate\s+[IiL1]\b',  # "Associate I", "Engineer I", "Level 1"
    r'\blevel\s+[1IiL]\b', r'\bL[1-2]\b',
]]

PART_TIME_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [
    r'\bpart[- ]time\b', r'\bpt\b(?=.*\b(role|position|job|hours)\b)',
    r'\bcampus ambassador\b', r'\bbrand ambassador\b',
    r'\boffice assistant\b', r'\blab assistant\b', r'\bresearch assistant\b',
    r'\bteaching assistant\b', r'\b\bTA\b(?=.*\b(position|role|opening)\b)',
    r'\bstudent worker\b', r'\bwork[- ]study\b',
    r'\bper diem\b', r'\bhourly\b(?=.*\b(position|role|job|pay)\b)',
    r'\bflexible hours\b', r'\bon[- ]call\b',
    r'\bcontent creator\b', r'\bsocial media\b(?=.*\b(assistant|creator|rep|intern)\b)',
    r'\bpeer tutor\b', r'\bstudent assistant\b', r'\bacademic coach\b',
    r'\bstipend\b',  # stipend-based roles are typically part-time/research
]]

# Description-level signals for internship (checked in addition to title)
_INTERN_DESC_SIGNALS = [
    'this is an internship', 'summer internship', 'internship program',
    'co-op program', 'co-op opportunity', 'rotational program',
    'student opportunity', 'undergraduate opportunity', 'undergrad position',
    'for students', 'currently enrolled', 'pursuing a degree',
    'academic year', 'school year', 'receive college credit',
    'stipend', 'paid internship', 'unpaid internship',
]

# Description-level signals for part-time
_PART_TIME_DESC_SIGNALS = [
    'part-time', 'part time', 'hours per week', 'flexible schedule',
    'work from home', 'remote opportunity', 'per diem', 'hourly rate',
    'student worker', 'work-study', 'work study',
]

# Expanded description-level entry-level signals
_ENTRY_DESC_SIGNALS = [
    'entry level', 'entry-level', 'new grad', 'new graduate', 'recent graduate',
    'early career', '0-1 years', '0-2 years', '1-2 years', '0 to 2 years',
    'no experience required', 'no prior experience', 'fresh graduate',
    'campus', 'university hiring', 'early talent', 'emerging talent',
    'start your career', 'launch your career', 'begin your career',
    'for students', 'seeking candidates who are', 'graduating students',
    'bachelor\'s degree preferred', 'will train', 'no background required',
    'open to all majors', 'career starter',
]


def classify_listing(title, description=""):
    """Classify a job listing. Returns: 'internship', 'entry_level', 'part_time', or 'other'.
    All jobs are kept — classification is informational, not exclusionary.
    Checks both title and description (first 2000 chars) for signals."""
    desc_lower = (description or "")[:2000].lower()

    # Internship: title first, then description
    if any(p.search(title) for p in INTERN_PATTERNS):
        return 'internship'
    if any(sig in desc_lower for sig in _INTERN_DESC_SIGNALS):
        return 'internship'

    # Part-time: title first, then description
    if any(p.search(title) for p in PART_TIME_PATTERNS):
        return 'part_time'
    if any(sig in desc_lower for sig in _PART_TIME_DESC_SIGNALS):
        return 'part_time'

    # Entry-level: title first, then description
    if any(p.search(title) for p in ENTRY_LEVEL_PATTERNS):
        return 'entry_level'
    if any(sig in desc_lower for sig in _ENTRY_DESC_SIGNALS):
        return 'entry_level'

    return 'other'

def is_internship(title):
    """Backward compatible — returns True if listing is an internship or entry-level type."""
    return classify_listing(title) in ('internship', 'entry_level', 'part_time')

def is_remote(location):
    loc = (location or "").lower()
    return "remote" in loc or "anywhere" in loc or "distributed" in loc

TAG_KEYWORDS = {"software":"Software Engineering","frontend":"Frontend","backend":"Backend","fullstack":"Full-Stack","full-stack":"Full-Stack","data science":"Data Science","data engineer":"Data Engineering","machine learning":"Machine Learning","ml ":"Machine Learning","ai ":"AI","product":"Product","design":"Design","ux":"UX","security":"Security","cloud":"Cloud","devops":"DevOps","mobile":"Mobile","ios":"iOS","android":"Android","finance":"Finance","analyst":"Analytics","marketing":"Marketing","sales":"Sales","operations":"Operations","research":"Research","hardware":"Hardware","consulting":"Consulting","quantitative":"Quantitative"}

def extract_tags(title, desc=""):
    text = f"{title} {desc[:500]}".lower()
    tags = []
    for kw, tag in TAG_KEYWORDS.items():
        if kw in text and tag not in tags:
            tags.append(tag)
    return tags[:6]

def strip_html(text):
    if not text: return ""
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:5000]

def parse_location(location):
    if not location: return (None, None)
    parts = [p.strip() for p in location.split(",")]
    if len(parts) >= 2:
        return (parts[0], parts[-1].strip()[:2].upper() if len(parts[-1].strip()) <= 3 else parts[-1].strip())
    return (location.strip(), None)

def fetch_json(url, timeout=15, method="GET", data=None, headers=None):
    try:
        hdrs = {"User-Agent": "DillyBot/2.0 (internship-crawler)"}
        if headers: hdrs.update(headers)
        req = urllib.request.Request(url, headers=hdrs, method=method, data=data)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[WARN] {url}: {e}")
        return None

def crawl_greenhouse(slug, company_name):
    data = fetch_json(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true")
    if not data or not isinstance(data, dict): return []
    results = []
    for job in data.get("jobs", []):
        title = (job.get("title") or "").strip()
        desc = strip_html(job.get("content") or "")
        job_type = classify_listing(title, desc)
        location = (job.get("location") or {}).get("name", "") if isinstance(job.get("location"), dict) else str(job.get("location", ""))
        depts = [d.get("name","") for d in (job.get("departments") or [])]
        posted = (job.get("updated_at") or job.get("first_published_at") or "")[:10]
        apply_url = job.get("absolute_url") or f"https://boards.greenhouse.io/{slug}/jobs/{job.get('id','')}"
        city, state = parse_location(location)
        results.append({"external_id":f"gh-{slug}-{job.get('id','')}","title":title,"company":company_name,"description":desc,"apply_url":apply_url,"location_city":city,"location_state":state,"work_mode":"remote" if is_remote(location) else "unknown","posted_date":posted or None,"source_ats":"greenhouse","team":depts[0] if depts else "","remote":is_remote(location),"tags":extract_tags(title,desc),"job_type":job_type})
    return results

def crawl_lever(slug, company_name):
    data = fetch_json(f"https://api.lever.co/v0/postings/{slug}?mode=json")
    if not data or not isinstance(data, list): return []
    results = []
    for job in data:
        title = (job.get("text") or "").strip()
        cats = job.get("categories") or {}
        location = cats.get("location") or ""
        team = cats.get("team") or cats.get("department") or ""
        desc_parts = []
        for section in (job.get("lists") or []):
            desc_parts.append(section.get("text",""))
            for item in (section.get("content") or "").split("<li>"):
                clean = re.sub(r"<[^>]+>","",item).strip()
                if clean: desc_parts.append(clean)
        desc = " ".join(desc_parts)[:5000]
        if not desc: desc = strip_html(job.get("descriptionPlain") or job.get("description") or "")
        job_type = classify_listing(title, desc)
        posted = ""
        if job.get("createdAt"):
            try: posted = time.strftime("%Y-%m-%d", time.gmtime(job["createdAt"]/1000))
            except: pass
        apply_url = job.get("hostedUrl") or job.get("applyUrl") or ""
        city, state = parse_location(location)
        results.append({"external_id":f"lever-{slug}-{job.get('id','')}","title":title,"company":company_name,"description":desc,"apply_url":apply_url,"location_city":city,"location_state":state,"work_mode":"remote" if is_remote(location) else "unknown","posted_date":posted or None,"source_ats":"lever","team":team,"remote":is_remote(location),"tags":extract_tags(title,desc),"job_type":job_type})
    return results

def crawl_ashby(slug, company_name):
    payload = json.dumps({"operationName":"ApiJobBoardWithTeams","variables":{"organizationHostedJobsPageName":slug},"query":"query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { teams { name jobs { id title locationName employmentType descriptionHtml } } } }"}).encode("utf-8")
    data = fetch_json("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams", method="POST", data=payload, headers={"Content-Type":"application/json"})
    if not data: return []
    teams = ((data.get("data") or {}).get("jobBoard") or {}).get("teams") or []
    results = []
    for team_obj in teams:
        team_name = team_obj.get("name","")
        for job in (team_obj.get("jobs") or []):
            title = (job.get("title") or "").strip()
            desc = strip_html(job.get("descriptionHtml") or "")
            job_type = classify_listing(title, desc)
            location = job.get("locationName") or ""
            apply_url = f"https://jobs.ashbyhq.com/{slug}/{job.get('id','')}"
            city, state = parse_location(location)
            results.append({"external_id":f"ashby-{slug}-{job.get('id','')}","title":title,"company":company_name,"description":desc,"apply_url":apply_url,"location_city":city,"location_state":state,"work_mode":"remote" if is_remote(location) else "unknown","posted_date":None,"source_ats":"ashby","team":team_name,"remote":is_remote(location),"tags":extract_tags(title,desc),"job_type":job_type})
    return results

def crawl_smartrecruiters(company_id, company_name):
    results = []
    offset = 0
    while True:
        data = fetch_json(f"https://api.smartrecruiters.com/v1/companies/{company_id}/postings?offset={offset}&limit=100")
        if not data or not isinstance(data, dict): break
        postings = data.get("content") or []
        if not postings: break
        for job in postings:
            title = (job.get("name") or "").strip()
            loc = job.get("location") or {}
            city = loc.get("city") or ""
            state = loc.get("region") or ""
            country = loc.get("country") or ""
            if country and country.upper() not in ("US","USA","UNITED STATES","CA","CAN","CANADA",""): continue
            location = f"{city}, {state}" if city and state else city or state or ""
            desc = ""
            try: desc = strip_html(job.get("jobAd",{}).get("sections",{}).get("jobDescription",{}).get("text",""))
            except: pass
            job_type = classify_listing(title, desc)
            dept = ""
            try: dept = (job.get("department") or {}).get("label","")
            except: pass
            apply_url = job.get("ref") or f"https://jobs.smartrecruiters.com/{company_id}/{job.get('id','')}"
            posted = (job.get("releasedDate") or "")[:10]
            results.append({"external_id":f"sr-{company_id}-{job.get('id','')}","title":title,"company":company_name,"description":desc,"apply_url":apply_url,"location_city":city or None,"location_state":state or None,"work_mode":"remote" if is_remote(location) else "unknown","posted_date":posted or None,"source_ats":"smartrecruiters","team":dept,"remote":is_remote(location),"tags":extract_tags(title,desc),"job_type":job_type})
        if len(postings) < 100: break
        offset += 100
        time.sleep(0.3)
    return results

def crawl_jazzhr(slug, company_name):
    """JazzHR public listing API: https://<slug>.applytojob.com/apply.json"""
    data = fetch_json(f"https://{slug}.applytojob.com/apply.json")
    if not data:
        return []
    jobs = data if isinstance(data, list) else data.get("jobs", [])
    results = []
    for job in jobs:
        title = (job.get("title") or "").strip()
        if not title:
            continue
        desc = strip_html(job.get("description") or "")
        job_type = classify_listing(title, desc)
        city = (job.get("city") or "").strip() or None
        state = (job.get("state") or "").strip() or None
        country = (job.get("country") or "").strip().upper()
        if country and country not in ("US", "USA", "UNITED STATES", "CA", "CAN", "CANADA", ""):
            continue
        location = f"{city or ''} {state or ''}"
        apply_url = job.get("applyUrl") or f"https://{slug}.applytojob.com/apply/{job.get('id', '')}"
        posted = (job.get("postedDate") or "")[:10]
        results.append({
            "external_id": f"jazzhr-{slug}-{job.get('id', '')}",
            "title": title,
            "company": company_name,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote(location) else "unknown",
            "posted_date": posted or None,
            "source_ats": "jazzhr",
            "team": job.get("category") or "",
            "remote": is_remote(location),
            "tags": extract_tags(title, desc),
            "job_type": job_type,
        })
    return results


def crawl_recruitee(slug, company_name):
    """Recruitee public offers API: https://<slug>.recruitee.com/api/offers/"""
    data = fetch_json(f"https://{slug}.recruitee.com/api/offers/")
    if not data:
        return []
    offers = data.get("offers", []) if isinstance(data, dict) else data
    results = []
    for job in offers:
        title = (job.get("title") or "").strip()
        if not title:
            continue
        desc = strip_html(job.get("description") or "")
        job_type = classify_listing(title, desc)
        city = (job.get("city") or "").strip() or None
        country = (job.get("country_code") or "").strip().upper()
        is_remote_job = bool(job.get("remote") or job.get("remote_allowed"))
        apply_url = job.get("url") or f"https://{slug}.recruitee.com/o/{job.get('id', '')}"
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()
        results.append({
            "external_id": f"recruitee-{slug}-{job.get('id', '')}",
            "title": title,
            "company": company_name,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": None,
            "work_mode": "remote" if is_remote_job else "unknown",
            "posted_date": posted or None,
            "source_ats": "recruitee",
            "team": dept,
            "remote": is_remote_job,
            "tags": extract_tags(title, desc),
            "job_type": job_type,
        })
    return results


def crawl_breezyhr(slug, company_name):
    """BreezyHR public JSON feed: https://<slug>.breezy.hr/json"""
    data = fetch_json(f"https://{slug}.breezy.hr/json")
    if not data:
        return []
    positions = data if isinstance(data, list) else data.get("jobs", data.get("positions", []))
    results = []
    for job in positions:
        title = (job.get("name") or job.get("title") or "").strip()
        if not title:
            continue
        desc = strip_html(job.get("description") or "")
        job_type = classify_listing(title, desc)
        loc = job.get("location") or {}
        if isinstance(loc, dict):
            city = (loc.get("city") or "").strip() or None
            state = (loc.get("state") or "").strip() or None
            country = (loc.get("country") or "").strip().upper()
        else:
            city = str(loc).strip() or None
            state = None
            country = ""
        if country and country not in ("US", "USA", "UNITED STATES", "CA", "CAN", "CANADA", "GB", "GBR", "UNITED KINGDOM", ""):
            continue
        is_remote_job = is_remote(f"{city or ''} {state or ''}")
        apply_url = f"https://{slug}.breezy.hr/p/{job.get('id', '')}"
        posted = (job.get("published_date") or job.get("created_date") or "")[:10]
        dept_raw = job.get("department") or {}
        dept = dept_raw.get("name", "") if isinstance(dept_raw, dict) else str(dept_raw)
        results.append({
            "external_id": f"breezy-{slug}-{job.get('id', '')}",
            "title": title,
            "company": company_name,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote_job else "unknown",
            "posted_date": posted or None,
            "source_ats": "breezyhr",
            "team": dept,
            "remote": is_remote_job,
            "tags": extract_tags(title, desc),
            "job_type": job_type,
        })
    return results


def crawl_pinpoint(slug, company_name):
    """Pinpoint public jobs API: https://<slug>.pinpointhq.com/api/v1/jobs"""
    data = fetch_json(f"https://{slug}.pinpointhq.com/api/v1/jobs")
    if not data:
        return []
    jobs = data.get("data", []) if isinstance(data, dict) else data
    results = []
    for job in jobs:
        attrs = job.get("attributes", {}) if isinstance(job, dict) else {}
        title = (attrs.get("title") or job.get("title") or "").strip()
        if not title:
            continue
        desc = strip_html(attrs.get("description") or "")
        job_type = classify_listing(title, desc)
        location = (attrs.get("location") or "").strip()
        city, state = parse_location(location)
        is_remote_job = bool(attrs.get("remote")) or is_remote(location)
        apply_url = attrs.get("url") or f"https://{slug}.pinpointhq.com/jobs/{job.get('id', '')}"
        posted = (attrs.get("created_at") or attrs.get("published_at") or "")[:10]
        dept = (attrs.get("department") or attrs.get("team") or "").strip()
        results.append({
            "external_id": f"pinpoint-{slug}-{job.get('id', '')}",
            "title": title,
            "company": company_name,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote_job else "unknown",
            "posted_date": posted or None,
            "source_ats": "pinpoint",
            "team": dept,
            "remote": is_remote_job,
            "tags": extract_tags(title, desc),
            "job_type": job_type,
        })
    return results


def crawl_teamtailor(slug, company_name):
    """Teamtailor public jobs API: https://career.teamtailor.com/api/v1/jobs?company=<slug>
    Alternatively: https://<slug>.teamtailor.com/api/v1/jobs"""
    data = fetch_json(f"https://{slug}.teamtailor.com/api/v1/jobs?include=locations,department")
    if not data:
        data = fetch_json(f"https://{slug}.teamtailor.com/api/v1/job-applications")
    if not data:
        return []
    jobs = data.get("data", []) if isinstance(data, dict) else data
    results = []
    for job in jobs:
        attrs = job.get("attributes", {}) if isinstance(job, dict) else {}
        title = (attrs.get("title") or job.get("title") or "").strip()
        if not title:
            continue
        desc = strip_html(attrs.get("body") or attrs.get("description") or "")
        job_type = classify_listing(title, desc)
        location = (attrs.get("location") or "").strip()
        city, state = parse_location(location)
        is_remote_job = bool(attrs.get("remote-status") == "Fully remote") or is_remote(location)
        links = job.get("links", {}) or {}
        apply_url = links.get("careersite-job-url") or f"https://{slug}.teamtailor.com/jobs/{job.get('id', '')}"
        posted = (attrs.get("created-at") or "")[:10]
        results.append({
            "external_id": f"teamtailor-{slug}-{job.get('id', '')}",
            "title": title,
            "company": company_name,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote_job else "unknown",
            "posted_date": posted or None,
            "source_ats": "teamtailor",
            "team": "",
            "remote": is_remote_job,
            "tags": extract_tags(title, desc),
            "job_type": job_type,
        })
    return results


def crawl_jobvite(company_id, company_name):
    """Jobvite public jobs feed: https://jobs.jobvite.com/api/1/company/<id>/jobs"""
    data = fetch_json(f"https://jobs.jobvite.com/api/1/company/{company_id}/jobs")
    if not data:
        return []
    jobs = data.get("jobs", data.get("requisitions", [])) if isinstance(data, dict) else data
    results = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        title = (job.get("title") or "").strip()
        job_id = str(job.get("id") or job.get("jobId") or "")
        if not title or not job_id:
            continue
        desc = strip_html(job.get("description") or job.get("jobDescription") or "")
        job_type = classify_listing(title, desc)
        location = (job.get("location") or job.get("city") or "").strip()
        city, state = parse_location(location)
        is_remote_job = is_remote(location) or is_remote(title)
        apply_url = job.get("applyUrl") or job.get("url") or f"https://jobs.jobvite.com/company/{company_id}/job/{job_id}"
        posted = (job.get("datePosted") or job.get("postedDate") or "")[:10]
        dept = (job.get("department") or "").strip()
        results.append({
            "external_id": f"jobvite-{company_id}-{job_id}",
            "title": title,
            "company": company_name,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote_job else "unknown",
            "posted_date": posted or None,
            "source_ats": "jobvite",
            "team": dept,
            "remote": is_remote_job,
            "tags": extract_tags(title, desc),
            "job_type": job_type,
        })
    return results


def crawl_comeet(company_id, company_name):
    """Comeet public jobs feed: https://www.comeet.com/jobs/<company_id>/all"""
    data = fetch_json(f"https://www.comeet.com/jobs-api/company/{company_id}/positions?coref=1")
    if not data:
        return []
    jobs = data if isinstance(data, list) else data.get("positions", [])
    results = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        title = (job.get("name") or job.get("title") or "").strip()
        job_id = str(job.get("uid") or job.get("id") or "")
        if not title or not job_id:
            continue
        desc = strip_html(job.get("details") or job.get("description") or "")
        job_type = classify_listing(title, desc)
        location = (job.get("location") or {}).get("name", "") if isinstance(job.get("location"), dict) else str(job.get("location") or "")
        city, state = parse_location(location)
        is_remote_job = is_remote(location) or is_remote(title)
        apply_url = job.get("url") or f"https://www.comeet.com/jobs/{company_id}/all/{job_id}"
        posted = (job.get("date_posted") or "")[:10]
        dept = (job.get("department") or {}).get("name", "") if isinstance(job.get("department"), dict) else str(job.get("department") or "")
        results.append({
            "external_id": f"comeet-{company_id}-{job_id}",
            "title": title,
            "company": company_name,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote_job else "unknown",
            "posted_date": posted or None,
            "source_ats": "comeet",
            "team": dept,
            "remote": is_remote_job,
            "tags": extract_tags(title, desc),
            "job_type": job_type,
        })
    return results


def crawl_fountain(handle, company_name):
    """Fountain public jobs API: https://jobs.fountain.com/api/v1/applicant_tracking/<handle>/jobs
    Fountain is used for high-volume frontline / hourly hiring."""
    data = fetch_json(f"https://jobs.fountain.com/api/v1/applicant_tracking/{handle}/jobs")
    if not data:
        # Try alternate endpoint pattern
        data = fetch_json(f"https://jobs.fountain.com/c/{handle}")
    if not data:
        return []
    jobs = data if isinstance(data, list) else data.get("jobs", data.get("positions", []))
    results = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        title = (job.get("title") or job.get("name") or "").strip()
        job_id = str(job.get("id") or job.get("uid") or "")
        if not title or not job_id:
            continue
        desc = strip_html(job.get("description") or job.get("jobDescription") or "")
        job_type = classify_listing(title, desc)
        location = (job.get("location") or job.get("city") or "").strip()
        city, state = parse_location(location)
        is_remote_job = is_remote(location) or is_remote(title)
        apply_url = job.get("applicationUrl") or job.get("applyUrl") or f"https://jobs.fountain.com/c/{handle}/apply/{job_id}"
        posted = (job.get("postedAt") or job.get("createdAt") or "")[:10]
        results.append({
            "external_id": f"fountain-{handle}-{job_id}",
            "title": title,
            "company": company_name,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote_job else "unknown",
            "posted_date": posted or None,
            "source_ats": "fountain",
            "team": "",
            "remote": is_remote_job,
            "tags": extract_tags(title, desc),
            "job_type": job_type,
        })
    return results


def ensure_company(cur, name, ats_type, industry, website=None):
    """Get or create a companies row. When website is provided and the
    row either doesn't exist or has a NULL website, we set it — that
    feeds the feed API which the mobile app uses to render real logos
    via Clearbit. Never overwrites a non-null existing website so we
    don't clobber manually curated values."""
    cur.execute("SELECT id, website FROM companies WHERE name = %s", (name,))
    row = cur.fetchone()
    if row:
        existing_id, existing_site = row[0], row[1]
        if website and not existing_site:
            try:
                cur.execute("UPDATE companies SET website = %s WHERE id = %s", (website, existing_id))
            except Exception:
                pass
        return existing_id
    cid = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO companies (id, name, ats_type, industry, website) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (name) DO NOTHING RETURNING id",
        (cid, name, ats_type, industry, website),
    )
    result = cur.fetchone()
    return result[0] if result else cid

def write_listings(conn, listings, company_name, ats_type, industry):
    if not listings: return 0
    cur = conn.cursor()
    # Pull a website out of the first job that provides one. Enables
    # the logo pipeline on the mobile client.
    website = None
    for j in listings:
        if j.get("company_website"):
            website = j["company_website"]
            break
    company_id = ensure_company(cur, company_name, ats_type, industry, website=website)
    inserted = 0
    for job in listings:
        try:
            cur.execute("""INSERT INTO internships (id, company_id, title, description, apply_url, location_city, location_state, work_mode, status, source_ats, external_id, tags, team, remote, is_internship, posted_date, job_type) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'active',%s,%s,%s,%s,%s,true,%s,%s) ON CONFLICT (company_id, title) WHERE status = 'active' DO UPDATE SET description=EXCLUDED.description, apply_url=EXCLUDED.apply_url, updated_at=now()""",
                (str(uuid.uuid4()), company_id, job["title"], job.get("description",""), job.get("apply_url",""), job.get("location_city"), job.get("location_state"), job.get("work_mode","unknown"), job.get("source_ats",ats_type), job.get("external_id",""), json.dumps(job.get("tags",[])), job.get("team",""), job.get("remote",False), job.get("posted_date"), job.get("job_type","internship")))
            if cur.rowcount > 0: inserted += 1
        except Exception as e:
            print(f"    [ERR] {job.get('title','?')}: {e}")
    conn.commit()
    return inserted


def write_multi_company_feed(conn, jobs, ats_type, default_industry="Tech"):
    """Write jobs that span many different companies (RemoteOK, WWR,
    Built In, etc.). Groups by company name, then delegates to
    write_listings per company so we reuse ensure_company + the
    existing insert logic.
    """
    if not jobs:
        return 0
    by_company: dict[str, list[dict]] = {}
    for j in jobs:
        company = (j.get("company") or "").strip() or "Unknown"
        by_company.setdefault(company, []).append(j)
    total = 0
    for company, rows in by_company.items():
        try:
            total += write_listings(conn, rows, company, ats_type, default_industry)
        except Exception as e:
            print(f"    [multi-feed ERR] {company}: {e}")
    return total

# ── Auto-Classification ─────────────────────────────────────────────

def classify_unclassified(conn, api_key=None):
    """Classify any internships missing cohort_requirements."""
    if not api_key:
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("[classify] No ANTHROPIC_API_KEY set, skipping classification")
        return 0
    
    cur = conn.cursor()
    cur.execute("""SELECT i.id, i.title, i.description, c.name FROM internships i
        JOIN companies c ON i.company_id = c.id
        WHERE i.status='active' AND (i.cohort_requirements IS NULL OR i.cohort_requirements = '[]')""")
    listings = cur.fetchall()
    if not listings:
        print("[classify] No unclassified listings")
        return 0

    # Load cohort list
    try:
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
        from projects.dilly.academic_taxonomy import get_all_cohorts
        COHORT_LIST = get_all_cohorts()
    except:
        COHORT_LIST = ["Software Engineering & CS","Data Science & Analytics","Finance & Accounting","Marketing & Advertising","Management & Operations","Consulting & Strategy","Cybersecurity & IT","Healthcare & Clinical","Design & Creative Arts","Media & Communications","Law & Government","Education & Human Development","Social Sciences & Nonprofit","Entrepreneurship & Innovation","Life Sciences & Research","Physical Sciences & Math","Electrical & Computer Engineering","Mechanical & Aerospace Engineering","Civil & Environmental Engineering","Chemical & Biomedical Engineering","Biotech & Pharmaceutical","Economics & Public Policy"]
    
    SYSTEM = f'You classify job listings into cohorts and extract a quick glance summary. COHORTS: {json.dumps(COHORT_LIST)}. Pick 1-3 cohorts that best match this role. Also extract 3-4 key requirements as short bullet points (most important qualifications, skills, or requirements from the JD). Never use em dashes. ONLY JSON: {{"cohorts":[{{"cohort":"exact name"}}],"quick_glance":["bullet 1","bullet 2","bullet 3"]}}'

    print(f"[classify] Classifying {len(listings)} new internships...")
    scored = 0
    for iid, title, desc, company in listings:
        try:
            payload = json.dumps({'model':'claude-haiku-4-5-20251001','max_tokens':300,'system':SYSTEM,
                'messages':[{'role':'user','content':f'Company:{company} Title:{title} Desc:{(desc or "")[:2000]}'}]}).encode()
            req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=payload,
                headers={'Content-Type':'application/json','x-api-key':api_key,'anthropic-version':'2023-06-01'}, method='POST')
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = json.loads(resp.read())['content'][0]['text'].strip()
            text = text.replace('```json','').replace('```','').strip()
            parsed = json.loads(text)
            cohorts = [c for c in parsed.get('cohorts',[]) if c.get('cohort') in COHORT_LIST]
            if not cohorts:
                cohorts = [{'cohort':'Social Sciences & Nonprofit'}]
            quick_glance = parsed.get('quick_glance', [])[:4]
            cur.execute('UPDATE internships SET cohort_requirements=%s, quick_glance=%s WHERE id=%s', (json.dumps(cohorts), json.dumps(quick_glance), iid))
            conn.commit()
            scored += 1
        except:
            pass
        time.sleep(0.3)
    print(f"[classify] Done: {scored}/{len(listings)} classified")
    return scored

def crawl_all():
    print("=" * 60)
    print("Dilly Job Crawler v2 (PostgreSQL)")
    print(f"Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 60)
    if not DB_CONFIG["password"]:
        DB_CONFIG["password"] = input("Enter RDS password: ")
    conn = get_db()
    total_found = 0
    total_new = 0

    print(f"\n[Greenhouse] Crawling {len(GREENHOUSE_COMPANIES)} companies...")
    for slug, (name, industry) in GREENHOUSE_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_greenhouse(slug, name)
            new = write_listings(conn, jobs, name, "greenhouse", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    print(f"\n[Lever] Crawling {len(LEVER_COMPANIES)} companies...")
    for slug, (name, industry) in LEVER_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_lever(slug, name)
            new = write_listings(conn, jobs, name, "lever", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    print(f"\n[Ashby] Crawling {len(ASHBY_COMPANIES)} companies...")
    for slug, (name, industry) in ASHBY_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_ashby(slug, name)
            new = write_listings(conn, jobs, name, "ashby", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    print(f"\n[SmartRecruiters] Crawling {len(SMARTRECRUITERS_COMPANIES)} companies...")
    for slug, (name, industry) in SMARTRECRUITERS_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_smartrecruiters(slug, name)
            new = write_listings(conn, jobs, name, "smartrecruiters", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    # ── SAP SuccessFactors (big tech, pharma, consumer goods, consulting) ──
    # OData JSON API is public for open postings. Filters to US/CA/UK only
    # to avoid irrelevant international noise. Gracefully handles 404s.
    try:
        from dilly_core.job_source_successfactors import fetch_all_successfactors
        print(f"\n[SuccessFactors] Fetching enterprise tenants...")
        sfsf_jobs = fetch_all_successfactors()
        print(f"[SuccessFactors] Ingesting {len(sfsf_jobs)} jobs...")
        new = write_multi_company_feed(conn, sfsf_jobs, "successfactors")
        print(f"  {len(sfsf_jobs)} jobs ({new} new)")
        total_found += len(sfsf_jobs); total_new += new
    except Exception as e:
        print(f"[successfactors] load failed: {e}")

    # ── Taleo / Oracle (telecom, automotive, energy, banking, defense) ──
    # Taleo's REST JSON endpoint is unauthenticated. Each tenant 404s
    # gracefully if the company moved off Taleo. Volume: ~100-400 jobs
    # per large enterprise tenant.
    try:
        from dilly_core.job_source_taleo import fetch_all_taleo
        print(f"\n[Taleo] Fetching enterprise tenants...")
        taleo_jobs = fetch_all_taleo()
        print(f"[Taleo] Ingesting {len(taleo_jobs)} jobs...")
        new = write_multi_company_feed(conn, taleo_jobs, "taleo")
        print(f"  {len(taleo_jobs)} jobs ({new} new)")
        total_found += len(taleo_jobs); total_new += new
    except Exception as e:
        print(f"[taleo] load failed: {e}")

    # ── iCIMS (enterprise hospitals, pharma, retail, defense) ───────────
    # iCIMS doesn't have a clean single-call API like Greenhouse —
    # each tenant has its own subdomain. We call each tenant's JSON
    # widget endpoint and write via write_multi_company_feed.
    try:
        from dilly_core.job_source_icims import fetch_all_icims
        print(f"\n[iCIMS] Fetching enterprise tenants...")
        icims_jobs = fetch_all_icims()
        print(f"[iCIMS] Ingesting {len(icims_jobs)} jobs...")
        new = write_multi_company_feed(conn, icims_jobs, "icims")
        print(f"  {len(icims_jobs)} jobs ({new} new)")
        total_found += len(icims_jobs); total_new += new
    except Exception as e:
        print(f"[icims] load failed: {e}")

    print(f"\n[JazzHR] Crawling {len(JAZZHR_COMPANIES)} companies...")
    for slug, (name, industry) in JAZZHR_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_jazzhr(slug, name)
            new = write_listings(conn, jobs, name, "jazzhr", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    print(f"\n[Recruitee] Crawling {len(RECRUITEE_COMPANIES)} companies...")
    for slug, (name, industry) in RECRUITEE_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_recruitee(slug, name)
            new = write_listings(conn, jobs, name, "recruitee", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    print(f"\n[BreezyHR] Crawling {len(BREEZYHR_COMPANIES)} companies...")
    for slug, (name, industry) in BREEZYHR_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_breezyhr(slug, name)
            new = write_listings(conn, jobs, name, "breezyhr", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    print(f"\n[Pinpoint] Crawling {len(PINPOINT_COMPANIES)} companies...")
    for slug, (name, industry) in PINPOINT_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_pinpoint(slug, name)
            new = write_listings(conn, jobs, name, "pinpoint", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    # ── BambooHR (SMB tech, HR tech, e-commerce, design, cybersecurity) ──
    try:
        from dilly_core.job_source_bamboohr import BAMBOOHR_COMPANIES, fetch_bamboohr_jobs
        print(f"\n[BambooHR] Crawling {len(BAMBOOHR_COMPANIES)} companies...")
        for slug, (name, industry) in BAMBOOHR_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_bamboohr_jobs(slug, name)
                new = write_listings(conn, jobs, name, "bamboohr", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[bamboohr] load failed: {e}")

    # ── Teamtailor (Scandinavia + EU tech companies) ──────────────────
    print(f"\n[Teamtailor] Crawling {len(TEAMTAILOR_COMPANIES)} companies...")
    for slug, (name, industry) in TEAMTAILOR_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_teamtailor(slug, name)
            new = write_listings(conn, jobs, name, "teamtailor", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.4)

    # ── Jobvite (media, healthcare, engineering/gov contractors) ──────
    print(f"\n[Jobvite] Crawling {len(JOBVITE_COMPANIES)} companies...")
    for company_id, (name, industry) in JOBVITE_COMPANIES.items():
        print(f"  {name} ({company_id})...", end=" ", flush=True)
        try:
            jobs = crawl_jobvite(company_id, name)
            new = write_listings(conn, jobs, name, "jobvite", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.4)

    # ── Comeet (Israeli tech + EU companies) ─────────────────────────
    print(f"\n[Comeet] Crawling {len(COMEET_COMPANIES)} companies...")
    for company_id, (name, industry) in COMEET_COMPANIES.items():
        print(f"  {name} ({company_id})...", end=" ", flush=True)
        try:
            jobs = crawl_comeet(company_id, name)
            new = write_listings(conn, jobs, name, "comeet", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.4)

    # ── Paylocity + Paycom (US mid-market HCM platforms) ────────────────
    try:
        from dilly_core.job_source_paylocity import (
            PAYLOCITY_COMPANIES, fetch_paylocity_jobs,
            PAYCOM_COMPANIES, fetch_paycom_jobs,
        )
        print(f"\n[Paylocity] Crawling {len(PAYLOCITY_COMPANIES)} companies...")
        for cid, (name, industry) in PAYLOCITY_COMPANIES.items():
            print(f"  {name} ({cid})...", end=" ", flush=True)
            try:
                jobs = fetch_paylocity_jobs(cid, name)
                new = write_listings(conn, jobs, name, "paylocity", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)

        print(f"\n[Paycom] Crawling {len(PAYCOM_COMPANIES)} companies...")
        for token, (name, industry) in PAYCOM_COMPANIES.items():
            print(f"  {name} ({token})...", end=" ", flush=True)
            try:
                jobs = fetch_paycom_jobs(token, name)
                new = write_listings(conn, jobs, name, "paycom", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[paylocity/paycom] load failed: {e}")

    # ── Hireology (automotive dealerships + home services franchises) ────
    try:
        from dilly_core.job_source_hireology import HIREOLOGY_COMPANIES, fetch_hireology_jobs
        print(f"\n[Hireology] Crawling {len(HIREOLOGY_COMPANIES)} organizations...")
        for org_id, (name, industry) in HIREOLOGY_COMPANIES.items():
            print(f"  {name} ({org_id})...", end=" ", flush=True)
            try:
                jobs = fetch_hireology_jobs(org_id, name)
                new = write_listings(conn, jobs, name, "hireology", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[hireology] load failed: {e}")

    # ── BreezyHR (SMB tech, agencies, field services) ────────────────────
    try:
        from dilly_core.job_source_breezyhr import BREEZYHR_COMPANIES, fetch_breezyhr_jobs
        print(f"\n[BreezyHR] Crawling {len(BREEZYHR_COMPANIES)} companies...")
        for slug, (name, industry) in BREEZYHR_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_breezyhr_jobs(slug, name)
                new = write_listings(conn, jobs, name, "breezyhr", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[breezyhr] load failed: {e}")

    # ── JazzHR (SMB US companies, restaurant chains, nonprofits) ─────────
    try:
        from dilly_core.job_source_jazzhr import JAZZHR_COMPANIES, fetch_jazzhr_jobs
        print(f"\n[JazzHR] Crawling {len(JAZZHR_COMPANIES)} companies...")
        for slug, (name, industry) in JAZZHR_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_jazzhr_jobs(slug, name)
                new = write_listings(conn, jobs, name, "jazzhr", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[jazzhr] load failed: {e}")

    # ── Recruitee (European ATS — Poland, Netherlands, Germany) ──────────
    try:
        from dilly_core.job_source_recruitee import RECRUITEE_COMPANIES, fetch_recruitee_jobs
        print(f"\n[Recruitee] Crawling {len(RECRUITEE_COMPANIES)} companies...")
        for slug, (name, industry) in RECRUITEE_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_recruitee_jobs(slug, name)
                new = write_listings(conn, jobs, name, "recruitee", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[recruitee] load failed: {e}")

    # ── Pinpoint / Trakstar / GoHire / Jobylon (UK + Scandi ATS) ─────────
    try:
        from dilly_core.job_source_pinpoint import (
            PINPOINT_COMPANIES, fetch_pinpoint_jobs,
            TRAKSTAR_COMPANIES, fetch_trakstar_jobs,
            GOHIRE_COMPANIES, fetch_gohire_jobs,
            JOBYLON_COMPANIES, fetch_jobylon_jobs,
        )
        print(f"\n[Pinpoint] Crawling {len(PINPOINT_COMPANIES)} companies...")
        for slug, (name, industry) in PINPOINT_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_pinpoint_jobs(slug, name)
                new = write_listings(conn, jobs, name, "pinpoint", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
        print(f"\n[Trakstar] Crawling {len(TRAKSTAR_COMPANIES)} companies...")
        for slug, (name, industry) in TRAKSTAR_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_trakstar_jobs(slug, name)
                new = write_listings(conn, jobs, name, "trakstar", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
        print(f"\n[GoHire] Crawling {len(GOHIRE_COMPANIES)} companies...")
        for slug, (name, industry) in GOHIRE_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_gohire_jobs(slug, name)
                new = write_listings(conn, jobs, name, "gohire", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
        print(f"\n[Jobylon] Crawling {len(JOBYLON_COMPANIES)} companies...")
        for slug, (name, industry) in JOBYLON_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_jobylon_jobs(slug, name)
                new = write_listings(conn, jobs, name, "jobylon", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[pinpoint/trakstar/gohire/jobylon] load failed: {e}")

    # ── Darwinbox / Keka / TurboHire / Manatal / Skeeled / Springrecruit / X0PA ──
    try:
        from dilly_core.job_source_darwinbox import (
            DARWINBOX_COMPANIES, fetch_darwinbox_jobs,
            KEKA_COMPANIES, fetch_keka_jobs,
            TURBOHIRE_COMPANIES, fetch_turbohire_jobs,
            MANATAL_COMPANIES, fetch_manatal_jobs,
            SKEELED_COMPANIES, fetch_skeeled_jobs,
            SPRINGRECRUIT_COMPANIES, fetch_springrecruit_jobs,
            X0PA_COMPANIES, fetch_x0pa_jobs,
        )
        for (companies_dict, fetch_fn, ats_type) in [
            (DARWINBOX_COMPANIES, fetch_darwinbox_jobs, "darwinbox"),
            (KEKA_COMPANIES, fetch_keka_jobs, "keka"),
            (TURBOHIRE_COMPANIES, fetch_turbohire_jobs, "turbohire"),
            (MANATAL_COMPANIES, fetch_manatal_jobs, "manatal"),
            (SKEELED_COMPANIES, fetch_skeeled_jobs, "skeeled"),
            (SPRINGRECRUIT_COMPANIES, fetch_springrecruit_jobs, "springrecruit"),
            (X0PA_COMPANIES, fetch_x0pa_jobs, "x0pa"),
        ]:
            print(f"\n[{ats_type}] Crawling {len(companies_dict)} companies...")
            for slug, (name, industry) in companies_dict.items():
                print(f"  {name} ({slug})...", end=" ", flush=True)
                try:
                    jobs = fetch_fn(slug, name)
                    new = write_listings(conn, jobs, name, ats_type, industry)
                    print(f"{len(jobs)} jobs ({new} new)")
                    total_found += len(jobs); total_new += new
                except Exception as e:
                    print(f"ERROR: {e}")
                time.sleep(0.4)
    except Exception as e:
        print(f"[darwinbox_group] load failed: {e}")

    # ── ApplicantStack / ApplicantPro / ClearCompany / ExactHire / isolved / TalentReef / WorkBright ──
    try:
        from dilly_core.job_source_applicantstack import (
            APPLICANTSTACK_COMPANIES, fetch_applicantstack_jobs,
            APPLICANTPRO_COMPANIES, fetch_applicantpro_jobs,
            CLEARCOMPANY_COMPANIES, fetch_clearcompany_jobs,
            EXACTHIRE_COMPANIES, fetch_exacthire_jobs,
            ISOLVED_COMPANIES, fetch_isolved_jobs,
            TALENTREEF_COMPANIES, fetch_talentreef_jobs,
            WORKBRIGHT_COMPANIES, fetch_workbright_jobs,
        )
        for (companies_dict, fetch_fn, ats_type) in [
            (APPLICANTSTACK_COMPANIES, fetch_applicantstack_jobs, "applicantstack"),
            (APPLICANTPRO_COMPANIES, fetch_applicantpro_jobs, "applicantpro"),
            (CLEARCOMPANY_COMPANIES, fetch_clearcompany_jobs, "clearcompany"),
            (EXACTHIRE_COMPANIES, fetch_exacthire_jobs, "exacthire"),
            (ISOLVED_COMPANIES, fetch_isolved_jobs, "isolved"),
            (TALENTREEF_COMPANIES, fetch_talentreef_jobs, "talentreef"),
            (WORKBRIGHT_COMPANIES, fetch_workbright_jobs, "workbright"),
        ]:
            print(f"\n[{ats_type}] Crawling {len(companies_dict)} companies...")
            for slug, (name, industry) in companies_dict.items():
                print(f"  {name} ({slug})...", end=" ", flush=True)
                try:
                    jobs = fetch_fn(slug, name)
                    new = write_listings(conn, jobs, name, ats_type, industry)
                    print(f"{len(jobs)} jobs ({new} new)")
                    total_found += len(jobs); total_new += new
                except Exception as e:
                    print(f"ERROR: {e}")
                time.sleep(0.4)
    except Exception as e:
        print(f"[applicantstack_group] load failed: {e}")

    # ── CEIPAL / Avionte / PrismHR / JobAdder / Broadbean / Firefish / Vincere ──
    try:
        from dilly_core.job_source_staffing_ats import (
            CEIPAL_COMPANIES, fetch_ceipal_jobs,
            AVIONTE_COMPANIES, fetch_avionte_jobs,
            PRISMHR_COMPANIES, fetch_prismhr_jobs,
            JOBADDER_COMPANIES, fetch_jobadder_jobs,
            BROADBEAN_COMPANIES, fetch_broadbean_jobs,
            FIREFISH_COMPANIES, fetch_firefish_jobs,
            VINCERE_COMPANIES, fetch_vincere_jobs,
        )
        for (companies_dict, fetch_fn, ats_type) in [
            (CEIPAL_COMPANIES, fetch_ceipal_jobs, "ceipal"),
            (AVIONTE_COMPANIES, fetch_avionte_jobs, "avionte"),
            (PRISMHR_COMPANIES, fetch_prismhr_jobs, "prismhr"),
            (JOBADDER_COMPANIES, fetch_jobadder_jobs, "jobadder"),
            (BROADBEAN_COMPANIES, fetch_broadbean_jobs, "broadbean"),
            (FIREFISH_COMPANIES, fetch_firefish_jobs, "firefish"),
            (VINCERE_COMPANIES, fetch_vincere_jobs, "vincere"),
        ]:
            print(f"\n[{ats_type}] Crawling {len(companies_dict)} companies...")
            for slug, (name, industry) in companies_dict.items():
                print(f"  {name} ({slug})...", end=" ", flush=True)
                try:
                    jobs = fetch_fn(slug, name)
                    new = write_listings(conn, jobs, name, ats_type, industry)
                    print(f"{len(jobs)} jobs ({new} new)")
                    total_found += len(jobs); total_new += new
                except Exception as e:
                    print(f"ERROR: {e}")
                time.sleep(0.4)
    except Exception as e:
        print(f"[staffing_ats_group] load failed: {e}")

    # ── TalentLyft (Eastern Europe / Balkans ATS) ───────────────────────
    try:
        from dilly_core.job_source_talentlyft import TALENTLYFT_COMPANIES, fetch_talentlyft_jobs
        print(f"\n[TalentLyft] Crawling {len(TALENTLYFT_COMPANIES)} companies...")
        for slug, (name, industry) in TALENTLYFT_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_talentlyft_jobs(slug, name)
                new = write_listings(conn, jobs, name, "talentlyft", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[talentlyft] load failed: {e}")

    # ── Zoho Recruit (India / SE Asia / MENA tech companies) ────────────
    try:
        from dilly_core.job_source_zoho import ZOHO_COMPANIES, fetch_zoho_jobs
        print(f"\n[Zoho Recruit] Crawling {len(ZOHO_COMPANIES)} companies...")
        for slug, (name, industry) in ZOHO_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_zoho_jobs(slug, name)
                new = write_listings(conn, jobs, name, "zoho_recruit", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[zoho] load failed: {e}")

    # ── Freshteam / Freshworks (SMB tech, SaaS, communications) ─────────
    try:
        from dilly_core.job_source_freshteam import FRESHTEAM_COMPANIES, fetch_freshteam_jobs
        print(f"\n[Freshteam] Crawling {len(FRESHTEAM_COMPANIES)} companies...")
        for slug, (name, industry) in FRESHTEAM_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_freshteam_jobs(slug, name)
                new = write_listings(conn, jobs, name, "freshteam", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[freshteam] load failed: {e}")

    # ── ADP Recruiting (food distribution, finance, homebuilding) ────────
    try:
        from dilly_core.job_source_adp import ADP_COMPANIES, fetch_adp_jobs
        print(f"\n[ADP] Crawling {len(ADP_COMPANIES)} companies...")
        for client_id, (name, industry) in ADP_COMPANIES.items():
            print(f"  {name} ({client_id})...", end=" ", flush=True)
            try:
                jobs = fetch_adp_jobs(client_id, name)
                new = write_listings(conn, jobs, name, "adp", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[adp] load failed: {e}")

    # ── UKG Pro + Dayforce (healthcare, hospitality, retail, trucking) ───
    try:
        from dilly_core.job_source_ukg import UKG_COMPANIES, DAYFORCE_COMPANIES
        from dilly_core.job_source_ukg import fetch_ukg_jobs, fetch_dayforce_jobs
        print(f"\n[UKG Pro] Crawling {len(UKG_COMPANIES)} tenants...")
        for code, (name, industry) in UKG_COMPANIES.items():
            print(f"  {name} ({code})...", end=" ", flush=True)
            try:
                jobs = fetch_ukg_jobs(code, name)
                new = write_listings(conn, jobs, name, "ukg", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)

        print(f"\n[Dayforce] Crawling {len(DAYFORCE_COMPANIES)} tenants...")
        for cid, (name, industry) in DAYFORCE_COMPANIES.items():
            print(f"  {name} ({cid})...", end=" ", flush=True)
            try:
                jobs = fetch_dayforce_jobs(cid, name)
                new = write_listings(conn, jobs, name, "dayforce", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[ukg/dayforce] load failed: {e}")

    # ── Cornerstone OnDemand (retail, hospitality, healthcare, staffing) ─
    try:
        from dilly_core.job_source_cornerstone import CORNERSTONE_COMPANIES, fetch_cornerstone_jobs
        print(f"\n[Cornerstone] Crawling {len(CORNERSTONE_COMPANIES)} tenants...")
        for tenant, (name, industry, site_id) in CORNERSTONE_COMPANIES.items():
            print(f"  {name} ({tenant})...", end=" ", flush=True)
            try:
                jobs = fetch_cornerstone_jobs(tenant, name, career_site_id=site_id)
                new = write_listings(conn, jobs, name, "cornerstone", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[cornerstone] load failed: {e}")

    # ── Personio (European HR platform — DACH, France, Spain, Nordics) ──
    try:
        from dilly_core.job_source_personio import PERSONIO_COMPANIES, fetch_personio_jobs
        print(f"\n[Personio] Crawling {len(PERSONIO_COMPANIES)} companies...")
        for slug, (name, industry) in PERSONIO_COMPANIES.items():
            print(f"  {name} ({slug})...", end=" ", flush=True)
            try:
                jobs = fetch_personio_jobs(slug, name)
                new = write_listings(conn, jobs, name, "personio", industry)
                print(f"{len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"ERROR: {e}")
            time.sleep(0.4)
    except Exception as e:
        print(f"[personio] load failed: {e}")

    # ── Fountain (high-volume frontline / on-demand / gig hiring) ─────
    print(f"\n[Fountain] Crawling {len(FOUNTAIN_COMPANIES)} companies...")
    for handle, (name, industry) in FOUNTAIN_COMPANIES.items():
        print(f"  {name} ({handle})...", end=" ", flush=True)
        try:
            jobs = crawl_fountain(handle, name)
            new = write_listings(conn, jobs, name, "fountain", industry)
            print(f"{len(jobs)} jobs ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.4)

    # ── Discovered boards (from the discovery cron) ──────────────────
    # Run /cron/discover-boards once to populate. After that every
    # /cron/crawl-internships picks them up automatically here without
    # needing to hand-edit GREENHOUSE_COMPANIES / LEVER_COMPANIES / etc.
    # Hits are de-duped against the hand-curated maps above, so a slug
    # that already exists in both places only crawls once per run.
    try:
        from projects.dilly.api.ingest.slug_discovery import list_discovered
        already_seen = {
            "greenhouse": set(GREENHOUSE_COMPANIES.keys()),
            "lever": set(LEVER_COMPANIES.keys()),
            "ashby": set(ASHBY_COMPANIES.keys()),
        }
        for vendor, crawler_fn in (
            ("greenhouse", crawl_greenhouse),
            ("lever", crawl_lever),
            ("ashby", crawl_ashby),
        ):
            rows = list_discovered(vendor)
            rows = [r for r in rows if r["slug"] not in already_seen[vendor]]
            if not rows:
                continue
            print(f"\n[{vendor} discovered] Crawling {len(rows)} newly-found boards...")
            for r in rows:
                slug = r["slug"]
                name = r.get("display_name") or slug.replace("-", " ").title()
                try:
                    jobs = crawler_fn(slug, name)
                    new = write_listings(conn, jobs, name, vendor, "Tech")
                    total_found += len(jobs); total_new += new
                except Exception as e:
                    print(f"  {slug} ERROR: {e}")
                time.sleep(0.25)
    except Exception as e:
        print(f"[discovered-boards] load failed: {e}")

    # ── Multi-company feeds (RemoteOK, WWR, Built In) ───────────────
    # Each call returns jobs from MANY different companies at once.
    # write_multi_company_feed groups by company and inserts in batches.
    try:
        import sys as _sys, os as _os
        _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
        from dilly_core.job_source_remote_feeds import fetch_all_remote_feeds
        for label, ats_label, jobs in fetch_all_remote_feeds():
            print(f"\n[{label}] Ingesting {len(jobs)} jobs...")
            try:
                new = write_multi_company_feed(conn, jobs, ats_label)
                print(f"  {len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"  ERROR writing {label}: {e}")
    except Exception as e:
        print(f"[remote-feeds] load failed: {e}")

    # ── Free public APIs (The Muse, Remotive, Arbeitnow, Jobicy, HN) ─
    # Each is a no-auth JSON endpoint returning jobs across thousands
    # of companies. Combined yield: +60-80k jobs per run at ceiling.
    # Sources that error out silently return [] — one flaky API
    # never poisons the rest.
    try:
        from dilly_core.job_source_free_apis import fetch_all_free_apis
        for label, ats_label, jobs in fetch_all_free_apis():
            print(f"\n[{label}] Ingesting {len(jobs)} jobs...")
            try:
                new = write_multi_company_feed(conn, jobs, ats_label)
                print(f"  {len(jobs)} jobs ({new} new)")
                total_found += len(jobs); total_new += new
            except Exception as e:
                print(f"  ERROR writing {label}: {e}")
    except Exception as e:
        print(f"[free-apis] load failed: {e}")

    # ── Workday (Fortune 500) ───────────────────────────────────────
    # Biggest single volume unlock. Each configured tenant returns up
    # to ~500 jobs. Tenants that 404/401 are skipped without affecting
    # the rest. Uses write_multi_company_feed so companies.website is
    # populated on insert -> logos work.
    try:
        from dilly_core.job_source_workday import fetch_all_workday
        print(f"\n[Workday] Fetching Fortune 500 tenants...")
        wd_jobs = fetch_all_workday()
        print(f"[Workday] Ingesting {len(wd_jobs)} jobs...")
        new = write_multi_company_feed(conn, wd_jobs, "workday")
        print(f"  {len(wd_jobs)} jobs ({new} new)")
        total_found += len(wd_jobs); total_new += new
    except Exception as e:
        print(f"[workday] load failed: {e}")

    # ── Workable (mid-market employers) ─────────────────────────────
    # Public JSON API at apply.workable.com. Thousands of employers
    # use Workable; this starter list covers known-large boards and
    # will grow as we verify additional slugs. Each board that 404s
    # is silently skipped; network errors don't break the run.
    try:
        from dilly_core.job_source_workable import fetch_all_workable
        workable_slugs = [
            # Starter set — verified public boards, added 2026-04-18.
            # Format: workable subdomain slug used in apply.workable.com.
            "remotecom", "doist", "deel", "hopin",
            "canonical", "tier", "gopuff", "bandcamp",
            "pleo", "blinkist", "getyourguide", "freeletics",
            "n26", "payoneer", "cloudpay", "taxjar",
            "mews", "workable",  # Workable themselves run on Workable
            # ── Batch added 2026-04-23: Workable expansion ──
            # 80+ mid-market employers known to use Workable. 404s are
            # silently skipped by fetch_all_workable's per-slug try/except.
            "monzo", "revolut", "wise", "trustpilot", "depop",
            "blockchain-com", "lendinvest", "tandem-bank", "starling",
            "curve", "moonpig", "cuvva", "pension-bee",
            "bloom-and-wild", "papier", "farfetch", "asos",
            "simba-sleep", "bulb", "ovo-energy", "octopus-electric",
            "just-eat", "deliveroo-uk", "cazoo", "bonsai", "huel",
            "freshly", "magic-spoon", "hellofresh", "blue-apron",
            "sun-basket", "home-chef", "foodguides", "thrive-market",
            "brandless", "misfits-market", "imperfect-foods",
            "sunbasket", "hungryroot",
            # Tech
            "mixmax", "superhuman-tech", "front-inc", "intercomgroup",
            "typeform-com", "paddle-com", "rechargepayments",
            "gorgias", "tidiopl", "segment-io",
            # Europe tech
            "klarna-sweden", "spotify-europe", "deliveroo-europe",
            "rovio-entertainment", "zalando", "delivery-hero",
            "outfit7", "gojek", "grab", "tokopedia",
            # Non-tech + ops-heavy
            "papa-johns", "chipotle-careers", "yumbrands",
            "dominos", "mcdonalds-corp",
            # Health / consumer DTC
            "warby-parker-careers", "casper-careers", "allbirds-careers",
            "glossier-careers", "harrys-careers",
            # ── Batch added 2026-04-24: Workable expansion ──
            # More tech companies on Workable
            "aircall", "lemlist", "hunter-io", "lemwarm", "instantly",
            "reply-io", "outreach-io", "salesloft", "apollo-io",
            "close-crm", "pipedrive", "copper-crm", "affinity",
            "attio", "folk-app", "twenty-crm",
            # European tech on Workable
            "datadog-eu", "elastic-eu", "hashicorp-eu",
            "confluent-eu", "mongodb-eu", "redis-eu",
            "grafana-eu", "sentry-eu", "posthog-eu",
            "linear-eu", "notion-eu", "figma-eu",
            "canva-eu", "miro-eu", "webflow-eu",
            "framer-eu", "readymag", "vev-design",
            # Recruitment / HR tech on Workable
            "workable-platform", "recruitee-com",
            "teamtailor-com", "pinpointhq",
            "breezy-hr", "applytojob",
            "greenhouse-io", "lever-co-ats",
            "ashby-hq", "rippling-hr",
            "gusto-payroll", "justworks-hr",
            "bamboohr-platform", "hibob-hr",
            # Media / creative on Workable
            "contentful-cms", "sanity-io", "strapi-cms",
            "prismic-io", "storyblok", "butter-cms",
            "ghost-cms", "wordpress-vip",
            "substack-pro", "ghost-pro",
            # SaaS / PLG on Workable
            "loom-inc", "notion-inc", "coda-io",
            "airtable-inc", "rows-com", "baserow",
            "nocodb", "appsmith", "tooljet", "budibase",
            "retool-hq", "internal-io", "airplane-dev",
            "pipedream", "trigger-dev",
            # ── Batch added 2026-04-24 continued: more real boards ──
            # Cybersecurity
            "crowdstrike-inc", "sentinelone-inc", "cyberark-inc",
            "tenable-inc", "qualys-inc", "rapid7-inc",
            "secureworks", "expel-inc", "huntress-labs",
            "ironnet", "dragos-inc", "claroty-inc",
            "nozomi-networks", "otorio", "medigate",
            # Fintech / payments
            "chime-careers", "robinhood-careers", "coinbase-inc",
            "kraken-exchange", "gemini-trust", "paxos-inc",
            "anchorage-digital", "bitpanda-gmbh", "bitstamp",
            "crypto-com", "nexo-finance", "celsius-network",
            "blockfi-inc", "ledn-io", "hodlnaut",
            # Edtech
            "duolingo-inc", "coursera-inc", "udemy-inc",
            "masterclass-inc", "skillshare-inc", "codecademy-inc",
            "pluralsight-inc", "linkedin-learning", "udacity-inc",
            "lambda-school", "flatiron-school", "general-assembly",
            "springboard-inc", "springboard-data", "brainstation",
            # HealthTech
            "hims-hers", "ro-health", "done-inc", "cerebral-inc",
            "brightside-health", "workit-health", "ophelia-health",
            "bicycle-health", "groups-recover", "monument-inc",
            "ria-health", "alto-pharmacy", "capsule-pharmacy",
            "nimble-rx", "truepill", "phil-inc",
            # ClimaTech
            "climeworks", "carbon-direct", "watershed-inc",
            "sweep-inc", "plan-a-earth", "zeroavia",
            "joby-aviation", "archer-aviation", "wisk-aero",
            "lilium-gmbh", "vertical-aerospace", "electric-air",
            "saildrone", "xwing-inc", "reliable-robotics",
            # PropTech
            "opendoor-tech", "offerpad", "orchard-homes",
            "knock-homes", "homeward-inc", "flyhomes-inc",
            "ribbon-home", "orchard-real-estate", "perch-homes",
            "divvy-homes", "landis-inc", "landed-inc",
        ]
        print(f"\n[Workable] Fetching {len(workable_slugs)} boards...")
        wk_jobs = fetch_all_workable(workable_slugs, max_per_company=100)
        print(f"[Workable] Ingesting {len(wk_jobs)} jobs...")
        new = write_multi_company_feed(conn, wk_jobs, "workable")
        print(f"  {len(wk_jobs)} jobs ({new} new)")
        total_found += len(wk_jobs); total_new += new
    except Exception as e:
        print(f"[workable] load failed: {e}")

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM internships WHERE status = 'active'")
    total_active = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT company_id) FROM internships WHERE status = 'active'")
    total_companies = cur.fetchone()[0]
    print(f"\n{'=' * 60}")
    print(f"Crawl complete!")
    print(f"  Found:     {total_found} jobs across all sources")
    print(f"  New:       {total_new} new listings added")
    print(f"  Active:    {total_active} total active jobs")
    print(f"  Companies: {total_companies} companies with active listings")
    print(f"{'=' * 60}")
    conn.close()

if __name__ == "__main__":
    crawl_all()
