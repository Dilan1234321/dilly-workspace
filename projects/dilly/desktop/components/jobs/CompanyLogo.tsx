'use client';
import { useState } from 'react';

const BRAND_COLORS: Record<string, string> = {
  'A': '#FF453A', 'B': '#FF9F0A', 'C': '#34C759', 'D': '#2B3A8E',
  'E': '#5E5CE6', 'F': '#FF375F', 'G': '#30D158', 'H': '#64D2FF',
  'I': '#BF5AF2', 'J': '#FFD60A', 'K': '#FF6482', 'L': '#0A84FF',
  'M': '#FF9500', 'N': '#AF52DE', 'O': '#5AC8FA', 'P': '#FF2D55',
  'Q': '#A2845E', 'R': '#FF3B30', 'S': '#34C759', 'T': '#5856D6',
  'U': '#007AFF', 'V': '#FF9500', 'W': '#4CD964', 'X': '#5856D6',
  'Y': '#FFCC00', 'Z': '#8E8E93',
};

export default function CompanyLogo({ company, size = 40 }: { company: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const domain = guessDomain(company);
  const initial = company.charAt(0).toUpperCase();
  const bgColor = BRAND_COLORS[initial] || '#2B3A8E';

  if (domain && !imgError) {
    return (
      <div className="flex-shrink-0 rounded-xl bg-surface-2 overflow-hidden flex items-center justify-center"
        style={{ width: size, height: size }}>
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt={company}
          width={size - 8} height={size - 8}
          className="object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 rounded-xl flex items-center justify-center"
      style={{ width: size, height: size, backgroundColor: bgColor + '18' }}>
      <span className="font-bold" style={{ fontSize: size * 0.4, color: bgColor }}>{initial}</span>
    </div>
  );
}

function guessDomain(company: string): string | null {
  const map: Record<string, string> = {
    'Cloudflare': 'cloudflare.com', 'Toast': 'toasttab.com', 'Dropbox': 'dropbox.com',
    'Brex': 'brex.com', 'Twilio': 'twilio.com', 'Stripe': 'stripe.com',
    'MongoDB': 'mongodb.com', 'Okta': 'okta.com', 'Coinbase': 'coinbase.com',
    'Scale AI': 'scale.com', 'Webflow': 'webflow.com', 'Vercel': 'vercel.com',
    'Airtable': 'airtable.com', 'Calendly': 'calendly.com', 'Carta': 'carta.com',
    'Gusto': 'gusto.com', 'Justworks': 'justworks.com', 'Lattice': 'lattice.com',
    'Goldman Sachs': 'goldmansachs.com', 'Mayo Clinic': 'mayoclinic.org',
    'Kaiser Permanente': 'kaiserpermanente.org', 'Visa': 'visa.com',
    'HubSpot': 'hubspot.com', 'Figma': 'figma.com', 'Notion': 'notion.so',
    'Datadog': 'datadoghq.com', 'HashiCorp': 'hashicorp.com', 'GitLab': 'gitlab.com',
    'Grafana Labs': 'grafana.com', 'Elastic': 'elastic.co', 'Confluent': 'confluent.io',
    'LaunchDarkly': 'launchdarkly.com', 'Samsara': 'samsara.com',
    'Natera': 'natera.com', '10x Genomics': '10xgenomics.com',
    'Twist Bioscience': 'twistbioscience.com', 'Ginkgo Bioworks': 'ginkgobioworks.com',
  };
  if (map[company]) return map[company];
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  return slug + '.com';
}