import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import fs from 'fs';
import path from 'path';

// Load real Dilly profiles
const REAL_PROFILES_PATH = path.resolve(process.cwd(), 'server/real_profiles.json');
let REAL_PROFILES: any[] = [];
try {
  REAL_PROFILES = JSON.parse(fs.readFileSync(REAL_PROFILES_PATH, 'utf-8'));
} catch (e) {
  console.error('Could not load real_profiles.json:', e);
}

// Preset roles for the demo — focused on roles these real candidates could plausibly fill
const PRESET_ROLES = [
  {
    id: 'fullstack-startup',
    label: 'Full-Stack Engineer at an Early-Stage Startup',
    description: `Full-Stack Engineer — Early Stage Startup

We are a seed-stage company building consumer software. We need someone who can ship, not someone who needs hand-holding. What we are looking for:
- Has built real things — products, clients, something in production
- Comfortable with TypeScript, React, Python or similar
- Can work independently without a defined spec
- Has a bias toward action and finishing
- Bonus: any entrepreneurial experience, client work, freelance, or side projects that generated real results`,
  },
  {
    id: 'data-analyst',
    label: 'Data Analyst — Business Intelligence',
    description: `Data Analyst — Business Intelligence

We need someone who can take raw data and find the story in it. Requirements:
- Python or SQL for data analysis
- Experience building models or analyses on real datasets
- Can explain findings to a non-technical audience
- Curiosity-first mindset — asks why before how
- Bonus: any predictive modeling, regression, or ML experience`,
  },
  {
    id: 'software-engineer',
    label: 'Software Engineer — Systems & Backend',
    description: `Software Engineer — Systems and Backend

We build infrastructure that matters. We want engineers who understand what is happening under the hood. What we care about:
- Comfortable with low-level systems concepts — memory management, performance
- Experience with C, C++, Rust, Go, or similar
- Understands trade-offs between abstraction and control
- Curious about how things actually work, not just that they work
- Bonus: any open-source contributions or personal systems projects`,
  },
  {
    id: 'entrepreneurial-generalist',
    label: 'Founding Team Member — Generalist',
    description: `Founding Team Member — Generalist

We are building from zero and need someone who can do whatever the company needs. This is not a defined role.
- Has built something from scratch, even without resources
- Comfortable wearing multiple hats — product, engineering, operations, sales
- Has dealt with real adversity and figured it out
- Has a track record of finishing things, not just starting them
- Bonus: experience leading people, managing external stakeholders, or building community`,
  },
];

// Score a real candidate for a role based on their facts and profile
function scoreCandidate(candidate: any, roleText: string): number {
  const lower = roleText.toLowerCase();
  let score = 0;

  // Score based on fact count — more Dilly usage = richer signal
  score += Math.min(candidate.factCount * 2, 30);

  // Score based on fact category relevance
  for (const fact of (candidate.facts || [])) {
    const factText = `${fact.category} ${fact.label} ${fact.value}`.toLowerCase();

    // Achievement category = strong signal for any startup role
    if (fact.category === 'achievement' && lower.includes('startup')) score += 8;
    if (fact.category === 'achievement') score += 4;

    // Project detail = strong for technical roles
    if (fact.category === 'project_detail' && (lower.includes('engineer') || lower.includes('data') || lower.includes('ml'))) score += 10;

    // Skill matches
    const skillKeywords = ['python', 'typescript', 'javascript', 'react', 'data', 'sql', 'ml', 'c programming', 'full stack', 'fullstack', 'backend', 'frontend'];
    for (const kw of skillKeywords) {
      if (factText.includes(kw) && lower.includes(kw)) score += 6;
    }

    // Entrepreneurship for founding team roles
    if (factText.includes('founder') || factText.includes('freelance') || factText.includes('entrepreneur')) {
      if (lower.includes('startup') || lower.includes('founding') || lower.includes('generalist')) score += 12;
    }

    // Systems/low-level for backend/systems roles
    if ((factText.includes('memory management') || factText.includes(' c ') || factText.includes('systems')) && lower.includes('system')) score += 12;

    // Data/modeling for data roles
    if ((factText.includes('model') || factText.includes('predict') || factText.includes('data')) && lower.includes('data')) score += 8;
  }

  // Track matching
  const trackLower = (candidate.track || '').toLowerCase();
  if (trackLower.includes('data') && lower.includes('data')) score += 15;
  if (trackLower.includes('software') && (lower.includes('engineer') || lower.includes('system'))) score += 15;
  if (trackLower.includes('cybersecurity') && lower.includes('security')) score += 15;

  return score;
}

// Build the Dilly narrative for a candidate based on their facts
function buildCandidatePayload(candidate: any, role: string): any {
  const facts = candidate.facts || [];
  const achievements = facts.filter((f: any) => f.category === 'achievement');
  const projects = facts.filter((f: any) => f.category === 'project_detail');
  const skills = facts.filter((f: any) => f.category === 'skill_unlisted');
  const personality = facts.filter((f: any) => ['personality', 'strength', 'soft_skill', 'motivation'].includes(f.category));
  const goals = facts.filter((f: any) => f.category === 'goal');
  const lifeContext = facts.filter((f: any) => f.category === 'life_context');

  // Build signal bullets from facts (what Dilly learned from conversations)
  const signalBullets: string[] = [];
  for (const f of [...achievements, ...projects].slice(0, 4)) {
    signalBullets.push(f.value);
  }

  // Build what Dilly knows narrative
  const whatDillyKnows: string[] = [];
  for (const f of facts.slice(0, 8)) {
    whatDillyKnows.push(`${f.label}: ${f.value}`);
  }

  // Determine fit label based on score
  const score = scoreCandidate(candidate, role);
  const fitLabel = score >= 40 ? 'Strong fit' : score >= 20 ? 'Solid signal' : 'Early profile';

  // Build profile depth note
  const depthNote = candidate.factCount === 0
    ? 'No conversations with Dilly yet. This profile is empty.'
    : candidate.factCount < 5
    ? `${candidate.factCount} facts extracted from ${Math.ceil(candidate.factCount / 3)} conversation(s) with Dilly.`
    : `${candidate.factCount} facts built across multiple conversations with Dilly over time.`;

  return {
    id: candidate.id,
    displayName: candidate.displayName,
    revealName: candidate.revealName,
    track: candidate.track,
    major: candidate.major,
    university: candidate.university,
    factCount: candidate.factCount,
    dillyNarrative: candidate.dillyNarrative,
    fitLabel,
    score,
    depthNote,
    signalBullets,
    whatDillyKnows,
    achievements: achievements.map((f: any) => ({ label: f.label, value: f.value })),
    projects: projects.map((f: any) => ({ label: f.label, value: f.value })),
    skills: skills.map((f: any) => f.label),
    personalitySignals: personality.map((f: any) => ({ label: f.label, value: f.value })),
    goals: goals.map((f: any) => f.value),
    lifeContext: lifeContext.map((f: any) => f.value),
    allFacts: facts,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, profiles: REAL_PROFILES.length });
  });

  // GET /api/blind-audition/roles
  app.get('/api/blind-audition/roles', (_req, res) => {
    res.json({ roles: PRESET_ROLES });
  });

  // POST /api/blind-audition/search
  // Returns all 3 real candidates scored for the given role
  app.post('/api/blind-audition/search', (req, res) => {
    const roleDescription = (req.body?.role_description || '').trim();

    const scored = REAL_PROFILES
      .map(p => ({
        ...buildCandidatePayload(p, roleDescription),
        _rawScore: scoreCandidate(p, roleDescription),
      }))
      .sort((a, b) => b._rawScore - a._rawScore);

    res.json({
      role_description: roleDescription,
      candidates: scored,
    });
  });

  // GET /api/blind-audition/candidate/:id
  app.get('/api/blind-audition/candidate/:id', (req, res) => {
    const profile = REAL_PROFILES.find(p => p.id === req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    res.json(buildCandidatePayload(profile, ''));
  });

  return httpServer;
}
