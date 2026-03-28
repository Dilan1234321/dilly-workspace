/**
 * Company → ATS system mapping.
 * Used by the Jobs tab to show ATS badges on job cards without API calls.
 * 
 * Detection methods:
 * 1. Direct company name match (this file)
 * 2. Source field from crawler (Greenhouse listings → Greenhouse ATS)
 * 3. URL pattern detection
 */

export interface ATSInfo {
  system: string;
  strictness: 'lenient' | 'moderate' | 'strict';
  color: string;
  tips: string;
}

const ATS_SYSTEMS: Record<string, ATSInfo> = {
  greenhouse: {
    system: 'Greenhouse',
    strictness: 'lenient',
    color: '#2ECC71',
    tips: 'Modern ATS, handles most formats well. Focus on content quality over formatting.',
  },
  lever: {
    system: 'Lever',
    strictness: 'lenient',
    color: '#F39C12',
    tips: 'Modern ATS, lenient parsing. Standard formatting recommended but not critical.',
  },
  ashby: {
    system: 'Ashby',
    strictness: 'lenient',
    color: '#9B59B6',
    tips: 'Modern ATS, very flexible parsing. Content matters most.',
  },
  workday: {
    system: 'Workday',
    strictness: 'strict',
    color: '#3498DB',
    tips: 'Strict parsing. Avoid columns, tables, text boxes. Use standard section headers. Single-column layout required.',
  },
  taleo: {
    system: 'Taleo',
    strictness: 'strict',
    color: '#E74C3C',
    tips: 'Strict parsing. No custom fonts, no headers/footers for contact info. Standard date format (Month YYYY) required.',
  },
  icims: {
    system: 'iCIMS',
    strictness: 'moderate',
    color: '#9B59B6',
    tips: 'Moderate parsing. Skills should be listed individually, not embedded in paragraphs. Standard date format preferred.',
  },
  successfactors: {
    system: 'SuccessFactors',
    strictness: 'moderate',
    color: '#1ABC9C',
    tips: 'Moderate parsing. Similar to Workday but slightly more lenient on formatting.',
  },
  smartrecruiters: {
    system: 'SmartRecruiters',
    strictness: 'lenient',
    color: '#3498DB',
    tips: 'Modern ATS, flexible parsing. Clean formatting helps but not required.',
  },
  jobvite: {
    system: 'Jobvite',
    strictness: 'moderate',
    color: '#E67E22',
    tips: 'Moderate parsing. Standard section headers and clean formatting recommended.',
  },
};

// Company name → ATS key mapping (case-insensitive lookup)
const COMPANY_ATS_MAP: Record<string, string> = {
  // Greenhouse companies
  'airbnb': 'greenhouse', 'stripe': 'greenhouse', 'coinbase': 'greenhouse',
  'cloudflare': 'greenhouse', 'databricks': 'greenhouse', 'figma': 'greenhouse',
  'pinterest': 'greenhouse', 'robinhood': 'greenhouse', 'verkada': 'greenhouse',
  'discord': 'greenhouse', 'instacart': 'greenhouse', 'reddit': 'greenhouse',
  'twitch': 'greenhouse', 'airtable': 'greenhouse', 'notion': 'greenhouse',
  'palantir': 'greenhouse', 'plaid': 'greenhouse', 'scale ai': 'greenhouse',
  'snowflake': 'greenhouse', 'hubspot': 'greenhouse', 'doordash': 'greenhouse',
  'lyft': 'greenhouse', 'snap': 'greenhouse', 'snapchat': 'greenhouse',
  'spotify': 'greenhouse', 'square': 'greenhouse', 'block': 'greenhouse',
  'dropbox': 'greenhouse', 'elastic': 'greenhouse', 'gitlab': 'greenhouse',
  'grammarly': 'greenhouse', 'okta': 'greenhouse', 'pagerduty': 'greenhouse',
  'roblox': 'greenhouse', 'splunk': 'greenhouse', 'tableau': 'greenhouse',
  'twilio': 'greenhouse', 'zendesk': 'greenhouse', 'zoom': 'greenhouse',

  // Lever companies
  'netflix': 'lever', 'shopify': 'lever', 'anduril': 'lever',

  // Ashby companies
  'anthropic': 'ashby', 'openai': 'ashby', 'ramp': 'ashby',

  // Workday companies
  'amazon': 'workday', 'amazon web services': 'workday', 'aws': 'workday',
  'google': 'workday', 'alphabet': 'workday', 'meta': 'workday', 'facebook': 'workday',
  'apple': 'workday', 'microsoft': 'workday', 'salesforce': 'workday',
  'adobe': 'workday', 'intuit': 'workday', 'nvidia': 'workday',
  'intel': 'workday', 'qualcomm': 'workday', 'ibm': 'workday',
  'dell': 'workday', 'hp': 'workday', 'cisco': 'workday',
  'vmware': 'workday', 'paypal': 'workday', 'visa': 'workday',
  'mastercard': 'workday', 'american express': 'workday', 'amex': 'workday',
  'disney': 'workday', 'walt disney': 'workday',
  'procter & gamble': 'workday', 'p&g': 'workday',
  'johnson & johnson': 'workday', 'j&j': 'workday',
  'pfizer': 'workday', 'merck': 'workday', 'abbott': 'workday',
  'lockheed martin': 'workday', 'northrop grumman': 'workday',
  'raytheon': 'workday', 'boeing': 'workday',
  'general motors': 'workday', 'gm': 'workday', 'ford': 'workday',
  'toyota': 'workday', 'tesla': 'workday',

  // Taleo / Oracle companies
  'jpmorgan': 'taleo', 'jp morgan': 'taleo', 'jpmorgan chase': 'taleo',
  'goldman sachs': 'taleo', 'morgan stanley': 'taleo',
  'bank of america': 'taleo', 'bofa': 'taleo',
  'citigroup': 'taleo', 'citi': 'taleo', 'citibank': 'taleo',
  'wells fargo': 'taleo', 'barclays': 'taleo', 'hsbc': 'taleo',
  'oracle': 'taleo', 'fedex': 'taleo', 'ups': 'taleo',
  'starbucks': 'taleo', 'walmart': 'taleo',
  'exxonmobil': 'taleo', 'chevron': 'taleo', 'shell': 'taleo',

  // iCIMS companies
  'nike': 'icims', 'target': 'icims', 'costco': 'icims',
  'unitedhealth': 'icims', 'unitedhealth group': 'icims',
  'anthem': 'icims', 'humana': 'icims',
  'comcast': 'icims', 'verizon': 'icims', 'at&t': 'icims',
  't-mobile': 'icims',

  // SuccessFactors (SAP) companies
  'deloitte': 'successfactors', 'pwc': 'successfactors',
  'pricewaterhousecoopers': 'successfactors',
  'ey': 'successfactors', 'ernst & young': 'successfactors',
  'kpmg': 'successfactors', 'accenture': 'successfactors',
  'mckinsey': 'successfactors', 'mckinsey & company': 'successfactors',
  'bain': 'successfactors', 'bain & company': 'successfactors',
  'bcg': 'successfactors', 'boston consulting group': 'successfactors',
  'siemens': 'successfactors', 'bosch': 'successfactors', 'sap': 'successfactors',

  // SmartRecruiters
  'linkedin': 'smartrecruiters', 'booking.com': 'smartrecruiters',
  'visa inc': 'smartrecruiters',

  // Jobvite
  'zillow': 'jobvite', 'indeed': 'jobvite',
};

/**
 * Look up the ATS system for a company.
 * Tries: direct name match → source field from crawler → null
 */
export function lookupCompanyATS(companyName: string, sourceField?: string): ATSInfo | null {
  // Direct name match
  const key = COMPANY_ATS_MAP[companyName.toLowerCase().trim()];
  if (key && ATS_SYSTEMS[key]) return ATS_SYSTEMS[key];

  // Partial match (e.g., "Goldman Sachs & Co" matches "goldman sachs")
  const lower = companyName.toLowerCase().trim();
  for (const [company, atsKey] of Object.entries(COMPANY_ATS_MAP)) {
    if (lower.includes(company) || company.includes(lower)) {
      if (ATS_SYSTEMS[atsKey]) return ATS_SYSTEMS[atsKey];
    }
  }

  // Infer from crawler source field
  if (sourceField) {
    const src = sourceField.toLowerCase();
    if (src === 'greenhouse') return ATS_SYSTEMS.greenhouse;
    if (src === 'lever') return ATS_SYSTEMS.lever;
    if (src === 'ashby') return ATS_SYSTEMS.ashby;
  }

  return null;
}

/**
 * Estimate ATS compatibility score based on system strictness.
 * This is a rough estimate — real scores come from the backend /ats-vendor-sim endpoint.
 * Used for instant display before the full scan runs.
 */
export function estimateATSScore(strictness: 'lenient' | 'moderate' | 'strict'): { min: number; max: number; label: string } {
  switch (strictness) {
    case 'lenient': return { min: 85, max: 98, label: 'Usually compatible' };
    case 'moderate': return { min: 70, max: 90, label: 'Check formatting' };
    case 'strict': return { min: 55, max: 80, label: 'Formatting matters' };
  }
}
