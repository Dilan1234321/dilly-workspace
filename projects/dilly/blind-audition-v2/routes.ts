import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import fs from 'fs';
import path from 'path';

// Load seed candidates from JSON
const CANDIDATES_PATH = path.resolve(process.cwd(), 'server/candidates_seed.json');
let ALL_CANDIDATES: any[] = [];
try {
  ALL_CANDIDATES = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf-8'));
} catch (e) {
  console.error('Could not load candidates_seed.json:', e);
}

// Role keyword mappings for simple semantic matching
const ROLE_KEYWORDS: Record<string, string[]> = {
  'backend': ['backend', 'server', 'api', 'infrastructure', 'platform', 'systems', 'distributed', 'microservices', 'python', 'java', 'go', 'node'],
  'frontend': ['frontend', 'ui', 'ux', 'react', 'css', 'design', 'web', 'typescript', 'javascript', 'interface', 'consumer'],
  'fullstack': ['fullstack', 'full stack', 'full-stack', 'web developer', 'generalist'],
  'ml': ['machine learning', 'ml', 'ai', 'deep learning', 'model', 'pytorch', 'tensorflow', 'nlp', 'data science', 'neural'],
  'data': ['data engineer', 'data pipeline', 'etl', 'dbt', 'airflow', 'snowflake', 'analytics', 'warehouse', 'spark'],
  'devops': ['devops', 'platform', 'sre', 'infrastructure', 'kubernetes', 'terraform', 'ci/cd', 'cloud', 'aws', 'gcp'],
  'mobile': ['ios', 'android', 'mobile', 'swift', 'swiftui', 'react native', 'flutter'],
  'security': ['security', 'appsec', 'penetration', 'vulnerability', 'soc', 'compliance', 'owasp'],
  'pm': ['product manager', 'product management', 'pm ', ' pm,', 'roadmap', 'user research', 'product owner', 'growth'],
};

function scoreCandidateForRole(candidate: any, roleText: string): number {
  const lower = roleText.toLowerCase();
  let score = 0;
  const targetRoles: string[] = JSON.parse(candidate.target_roles || '[]');
  const skills: string[] = JSON.parse(candidate.skills || '[]');
  const headline: string = candidate.headline || '';
  const summary: string = candidate.profile_summary || '';
  const fitLabel: string = candidate.fit_label || '';

  // Base fit score
  if (fitLabel === 'Strong Match') score += 30;
  else if (fitLabel === 'Partial Match') score += 15;
  else if (fitLabel === 'Weak Match') score += 5;

  // Role keyword matching
  for (const [_domain, keywords] of Object.entries(ROLE_KEYWORDS)) {
    const domainHits = keywords.filter(kw => lower.includes(kw)).length;
    if (domainHits > 0) {
      // Check if this candidate's roles match this domain
      const candidateRoleText = targetRoles.join(' ').toLowerCase();
      const candidateSkillText = skills.join(' ').toLowerCase();
      const matchHits = keywords.filter(kw =>
        candidateRoleText.includes(kw) ||
        candidateSkillText.includes(kw) ||
        headline.toLowerCase().includes(kw) ||
        summary.toLowerCase().includes(kw)
      ).length;
      score += matchHits * domainHits * 3;
    }
  }

  // Direct skill matches
  for (const skill of skills) {
    if (lower.includes(skill.toLowerCase())) score += 8;
  }

  // Role title matches
  for (const role of targetRoles) {
    const roleWords = role.toLowerCase().split(/\s+/);
    const hits = roleWords.filter(w => w.length > 3 && lower.includes(w)).length;
    score += hits * 5;
  }

  return score;
}

// Pick 3 candidates for a blind audition:
// 1 Strong Match (will be the "surprise" candidate from a non-target school)
// 1 Strong/Partial Match (the middle)
// 1 Partial/Weak (the overconfident-on-paper one)
function selectTrioForRole(roleText: string): any[] {
  const scored = ALL_CANDIDATES
    .map(c => ({ candidate: c, score: scoreCandidateForRole(c, roleText) }))
    .sort((a, b) => b.score - a.score);

  // Try to construct a meaningful trio
  const strongMatches = scored.filter(x => x.candidate.fit_label === 'Strong Match');
  const partialMatches = scored.filter(x => x.candidate.fit_label === 'Partial Match');
  const weakMatches = scored.filter(x => x.candidate.fit_label === 'Weak Match');

  let trio: any[] = [];

  // Get the top-scoring Strong Match (this will be the "surprise" reveal)
  if (strongMatches.length >= 1) trio.push(strongMatches[0].candidate);

  // Add the second best (partial or another strong)
  const remaining = scored.filter(x => !trio.find(t => t.id === x.candidate.id));
  if (remaining.length >= 1) trio.push(remaining[0].candidate);

  // Add a third — prefer partial or weak for contrast
  const remaining2 = scored.filter(x => !trio.find(t => t.id === x.candidate.id));
  if (remaining2.length >= 1) trio.push(remaining2[0].candidate);

  return trio;
}

// Transform SQLite candidate to Blind Audition format
function transformCandidate(c: any, isFilteredOut: boolean): any {
  const topEvidence: any[] = JSON.parse(c.top_evidence_json || '[]');
  const evidenceMap: any[] = JSON.parse(c.evidence_map_json || '[]');
  const gaps: any[] = JSON.parse(c.gaps_json || '[]');
  const skills: string[] = JSON.parse(c.skills || '[]');
  const targetRoles: string[] = JSON.parse(c.target_roles || '[]');

  // Build whyFit from top evidence
  const whyFit = topEvidence.slice(0, 4).map((e: any) => e.label);

  // Build profileFacts from profile_depth_note and fit narrative
  const profileFacts = [
    c.profile_depth_note,
    c.readiness_explanation,
    c.top_gap ? `Gap to note: ${c.top_gap}` : null,
    c.fit_narrative ? c.fit_narrative.slice(0, 200) + '...' : null,
  ].filter(Boolean);

  // Build jdEvidence from evidence map dimensions
  const jdEvidence = evidenceMap.slice(0, 5).map((dim: any) => ({
    req: dim.dimension,
    status: dim.dimensionFitColor === 'green' ? 'green' : dim.dimensionFitColor === 'yellow' ? 'yellow' : 'red',
    evidence: (dim.evidence || []).slice(0, 1).map((e: any) => e.label).join('. ') || dim.dimensionSummary,
  }));

  // Build experience from headline + summary (we don't have actual job history in SQLite)
  const experience = [
    {
      company: 'Current Role',
      role: targetRoles[0] || 'Engineer',
      date: `${parseInt(c.graduation_year || '2020') + 1}–present`,
      bullets: [c.headline, ...(whyFit.slice(0, 2))].filter(Boolean),
    }
  ];

  // Fit level mapping
  const fitLevel = c.fit_label === 'Strong Match' ? 'Standout'
    : c.fit_label === 'Partial Match' ? 'Strong fit'
    : 'Moderate fit';

  // Determine school prestige for reveal line
  const targetSchools = ['MIT', 'Stanford University', 'Carnegie Mellon University', 'Harvard', 'Yale', 'Princeton'];
  const isPrestige = targetSchools.some(s => c.school.includes(s.split(' ')[0]));

  let revealLine = '';
  if (isFilteredOut && !isPrestige) {
    revealLine = `${c.school}. In a traditional ATS filtered to target schools, this profile never reaches a recruiter.`;
  } else if (isPrestige) {
    revealLine = `${c.school}. The resume that gets through every filter — but ranked below candidates from schools most ATS systems would have eliminated.`;
  } else {
    revealLine = `${c.school}. ${c.location}.`;
  }

  return {
    id: c.id,
    name: c.display_name,
    school: c.school,
    location: c.location,
    firstGen: false,
    filteredOut: isFilteredOut,
    revealLine,
    fitLevel,
    dillyTake: c.dilly_take,
    whyFit,
    profileFacts,
    jdEvidence,
    experience,
    askAI: {
      'What makes them stand out?': c.fit_summary,
      'What is the biggest gap?': gaps.slice(0, 2).map((g: any) => g.description + ': ' + g.riskNote).join(' '),
      'Should I move them forward?': c.readiness_explanation,
    },
    // Rich data for Living Profile view
    _rich: {
      headline: c.headline,
      profileSummary: c.profile_summary,
      fitNarrative: c.fit_narrative,
      topGap: c.top_gap,
      evidenceMap,
      gaps,
      readinessLevel: c.readiness_level,
      readinessLabel: c.readiness_label,
      readinessExplanation: c.readiness_explanation,
      profileCompleteness: c.profile_completeness,
      profileDepthNote: c.profile_depth_note,
      profileFactCount: c.profile_fact_count,
      skills,
      targetRoles,
      graduationYear: c.graduation_year,
      fitColor: c.fit_color,
      fitLabel: c.fit_label,
    }
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // GET /api/health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, candidates: ALL_CANDIDATES.length });
  });

  // POST /api/blind-audition/search
  // Body: { role_description: string }
  // Returns 3 candidates matched to the role, in blind format
  app.post('/api/blind-audition/search', (req, res) => {
    const roleDescription = (req.body?.role_description || '').trim();

    let trio: any[];
    if (roleDescription.length < 10) {
      // Default: use the demo trio (Maya, James, Tyler-equivalent)
      trio = ALL_CANDIDATES.slice(0, 3);
    } else {
      trio = selectTrioForRole(roleDescription);
    }

    // Determine which ones would be "filtered out" by ATS
    // The non-target schools get filtered. Prestige schools don't.
    const targetSchools = ['MIT', 'Stanford', 'Carnegie Mellon', 'Harvard', 'Yale', 'Princeton', 'Cornell', 'Columbia'];
    const transformed = trio.map((c) => {
      const isPrestige = targetSchools.some(s => c.school.includes(s));
      // Candidates from non-prestige schools that are strong fits = filtered out by ATS
      const wouldBeFiltered = !isPrestige && (c.fit_label === 'Strong Match' || c.fit_label === 'Partial Match');
      return transformCandidate(c, wouldBeFiltered);
    });

    res.json({
      role_description: roleDescription,
      candidates: transformed,
    });
  });

  // GET /api/blind-audition/candidate/:id
  // Returns full living profile for a candidate
  app.get('/api/blind-audition/candidate/:id', (req, res) => {
    const candidate = ALL_CANDIDATES.find(c => c.id === req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    const targetSchools = ['MIT', 'Stanford', 'Carnegie Mellon', 'Harvard', 'Yale', 'Princeton'];
    const isPrestige = targetSchools.some(s => candidate.school.includes(s));
    const transformed = transformCandidate(candidate, !isPrestige);
    res.json(transformed);
  });

  // GET /api/blind-audition/roles
  // Returns preset role descriptions for the demo
  app.get('/api/blind-audition/roles', (_req, res) => {
    res.json({
      roles: [
        {
          id: 'senior-pm',
          label: 'Senior Product Manager — Consumer Growth',
          description: `Senior Product Manager — Consumer Growth

We're looking for a PM who has shipped features that moved real metrics for a consumer product used by everyday people. What matters:
- Has owned a product area end-to-end, not just contributed to one
- Can point to something they shipped and tell you exactly why it worked
- Comfortable with ambiguity — our roadmap changes when the data changes
- Understands users at a human level, not just a funnel level
- Bonus: experience with retention, engagement, or activation loops`,
        },
        {
          id: 'senior-backend',
          label: 'Senior Backend Engineer — Payments Infrastructure',
          description: `Senior Backend Engineer — Payments Infrastructure

We're building financial infrastructure that handles millions of transactions daily. We need engineers who can own hard problems:
- Production-grade distributed systems experience
- Python, Go, or Java in a high-scale environment
- Event-driven architecture (Kafka or similar)
- Financial systems, ledger reconciliation, or payment processing a plus
- Strong opinions about reliability, observability, and audit trails`,
        },
        {
          id: 'senior-frontend',
          label: 'Senior Frontend Engineer — Consumer Product',
          description: `Senior Frontend Engineer — Consumer Product

We're hiring a frontend engineer who thinks in user experiences, not components. The bar:
- React and TypeScript in production at consumer scale
- Has shipped products with real users, not just internal tools
- Strong instincts for UX — pushes back when the design is broken
- Experience with complex state management and offline-first patterns
- Bonus: design system work, React Native experience`,
        },
        {
          id: 'ml-engineer',
          label: 'ML Engineer — Production AI Systems',
          description: `ML Engineer — Production AI Systems

We're looking for an ML engineer who cares about models that actually ship. Not research. Production.
- Has deployed ML models that are running in production
- Comfortable with the full stack: training, evaluation, deployment, monitoring
- MLOps experience — feature pipelines, model serving, drift detection
- PyTorch or TensorFlow in a production environment
- Bonus: regulated industry experience (healthcare, fintech, legal)`,
        },
      ],
    });
  });

  return httpServer;
}
