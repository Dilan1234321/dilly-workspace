import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import pkg from "pg";
const { Pool } = pkg;
import https from "node:https";
import http from "node:http";

// ── Live Postgres connection to production RDS ─────────────────────────────
const DB_PASSWORD = process.env.DILLY_DB_PASSWORD || "TedsyBoy2025!!$())($))!!$("; // injected or fallback
const pool = new Pool({
  host: process.env.DILLY_DB_HOST || "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com",
  database: "dilly",
  user: "dilly_admin",
  password: DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

// ── Candidate emails — the three real Dilly users ─────────────────────────
const CANDIDATE_EMAILS = [
  "dilan.kochhar@spartans.ut.edu",
  "hamza.qureshi0420@gmail.com",
  "gabrielvcruz06@gmail.com",
];

// Displayed names and display aliases (blind mode)
const CANDIDATE_META: Record<string, { displayName: string; revealName: string }> = {
  "dilan.kochhar@spartans.ut.edu": { displayName: "Candidate A", revealName: "Dilan Kochhar" },
  "hamza.qureshi0420@gmail.com":   { displayName: "Candidate B", revealName: "Hamza Qureshi" },
  "gabrielvcruz06@gmail.com":      { displayName: "Candidate C", revealName: "Gabriel Cruz" },
};

// ── Pull live data from DB ─────────────────────────────────────────────────

async function getLiveProfile(email: string): Promise<any> {
  const client = await pool.connect();
  try {
    // Students row: name, major, track, dilly_narrative
    const studentRes = await client.query(
      `SELECT name, major, track, career_goal, dilly_narrative
       FROM students WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    const student = studentRes.rows[0] || {};

    // Users row: full_name, major, track as fallback
    const userRes = await client.query(
      `SELECT full_name, major, track, profile_json
       FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    const user = userRes.rows[0] || {};

    // All profile_facts — live, ordered newest first
    const factsRes = await client.query(
      `SELECT category, label, value, source, confidence, created_at
       FROM profile_facts WHERE LOWER(email) = LOWER($1)
       ORDER BY created_at DESC LIMIT 400`,
      [email]
    );
    const facts = factsRes.rows;

    const meta = CANDIDATE_META[email.toLowerCase()] || { displayName: email, revealName: email };

    // Derive display fields
    const name = student.name || user.full_name || meta.revealName;
    const major = student.major || user.major || "Unknown";
    const track = student.track || user.track || "Unknown";
    const narrative = student.dilly_narrative || null;

    return {
      email,
      ...meta,
      name,
      major,
      track,
      narrative,
      factCount: facts.length,
      facts,
    };
  } finally {
    client.release();
  }
}

// ── Category label for display ─────────────────────────────────────────────
function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    achievement: "Achievement", project_detail: "Project", project: "Project",
    skill_unlisted: "Skill", skill: "Skill", personality: "Personality",
    strength: "Strength", soft_skill: "Soft skill", motivation: "Motivation",
    goal: "Goal", life_context: "Background", challenge: "Challenge",
    hobby: "Hobby", education: "Education", career_interest: "Interest",
    location_pref: "Location", target_company: "Target co",
  };
  return map[cat] || cat;
}

// ── Score a single fact against the JD ───────────────────────────────────
// Returns both the numeric strength and a short human-readable reason
// ("matched: typescript, full stack") so the client can render why Dilly
// weighted a particular fact for this specific role. Keeping the two return
// values together means scoreCandidate and "top fact matches" can't drift.
function scoreFactForRole(fact: any, lowerRole: string): { strength: number; reasons: string[] } {
  const factText = `${fact.category} ${fact.label} ${fact.value}`.toLowerCase();
  let strength = 0;
  const reasons: string[] = [];

  if (fact.category === "achievement") {
    strength += 4;
    reasons.push("achievement signal");
  }
  if (["project_detail", "project"].includes(fact.category) &&
      (lowerRole.includes("engineer") || lowerRole.includes("data") || lowerRole.includes("build"))) {
    strength += 8;
    reasons.push("shipped project evidence");
  }

  const skillKws = ["python", "typescript", "javascript", "react", "data", "sql", "c programming", "full stack", "fullstack", "backend"];
  for (const kw of skillKws) {
    if (factText.includes(kw) && lowerRole.includes(kw)) {
      strength += 5;
      reasons.push(`${kw} keyword`);
    }
  }
  if ((factText.includes("founder") || factText.includes("freelance") || factText.includes("entrepreneur")) &&
      (lowerRole.includes("startup") || lowerRole.includes("founding") || lowerRole.includes("generalist"))) {
    strength += 12;
    reasons.push("founding-team shape");
  }
  if ((factText.includes("memory management") || factText.includes(" c ") || factText.includes("systems")) &&
      lowerRole.includes("system")) {
    strength += 12;
    reasons.push("systems-level depth");
  }
  if ((factText.includes("model") || factText.includes("predict") || factText.includes("data")) &&
      lowerRole.includes("data")) {
    strength += 8;
    reasons.push("data-work signal");
  }

  return { strength, reasons };
}

// ── Score candidate for a role ─────────────────────────────────────────────
function scoreCandidate(profile: any, roleText: string): number {
  const lower = roleText.toLowerCase();
  let score = 0;

  // Richer profile = stronger signal
  score += Math.min(profile.factCount * 2, 40);

  for (const fact of (profile.facts || [])) {
    score += scoreFactForRole(fact, lower).strength;
  }

  const trackLower = (profile.track || "").toLowerCase();
  if (trackLower.includes("data") && lower.includes("data")) score += 15;
  if (trackLower.includes("software") && (lower.includes("engineer") || lower.includes("system"))) score += 15;

  return score;
}

// ── Top fact matches for THIS role ─────────────────────────────────────────
// Same scoring function as scoreCandidate, but surfaces the individual facts
// that contributed most. The client uses this to render a "why Dilly ranked
// this candidate here, for this role" block on each card — turns an opaque
// ranking into a visible evidence map.
function topMatchesForRole(profile: any, roleText: string, limit = 3): Array<{
  label: string;
  value: string;
  category: string;
  strength: number;
  reason: string;
}> {
  const lower = roleText.toLowerCase();
  const scored = (profile.facts || [])
    .map((f: any) => {
      const { strength, reasons } = scoreFactForRole(f, lower);
      return {
        label: f.label,
        value: f.value,
        category: f.category,
        strength,
        reason: reasons.length > 0 ? `matched: ${reasons.join(", ")}` : "",
      };
    })
    .filter((m: any) => m.strength > 0)
    .sort((a: any, b: any) => b.strength - a.strength)
    .slice(0, limit);
  return scored;
}

// ── Build payload for the frontend ─────────────────────────────────────────
function buildPayload(profile: any, roleText: string): any {
  const score = scoreCandidate(profile, roleText);
  const fitLabel =
    score >= 50 ? "Strong fit" :
    score >= 20 ? "Solid signal" :
    profile.factCount === 0 ? "No profile yet" : "Early profile";

  const depthNote =
    profile.factCount === 0
      ? "No conversations with Dilly yet."
      : profile.factCount < 5
      ? `${profile.factCount} fact${profile.factCount === 1 ? "" : "s"} from ${Math.ceil(profile.factCount / 3)} conversation(s) with Dilly.`
      : `${profile.factCount} facts built across conversations with Dilly.`;

  const achievements = profile.facts.filter((f: any) => f.category === "achievement");
  const projects = profile.facts.filter((f: any) => ["project_detail", "project"].includes(f.category));
  const skills = profile.facts.filter((f: any) => ["skill_unlisted", "skill"].includes(f.category)).map((f: any) => f.label);

  // Build Dilly narrative — live from DB if available, otherwise synthesize
  const dillyNarrative = profile.narrative || synthesizeNarrative(profile);

  return {
    id: profile.email.split("@")[0].replace(/\./g, "-"),
    email: profile.email,
    displayName: profile.displayName,
    revealName: profile.revealName,
    track: profile.track,
    major: profile.major,
    factCount: profile.factCount,
    dillyNarrative,
    fitLabel,
    score,
    depthNote,
    achievements: achievements.map((f: any) => ({ label: f.label, value: f.value })),
    projects: projects.map((f: any) => ({ label: f.label, value: f.value })),
    skills,
    allFacts: profile.facts.map((f: any) => ({ ...f, categoryLabel: categoryLabel(f.category) })),
    topMatches: topMatchesForRole(profile, roleText, 3),
    liveFromDB: true,
  };
}

// Fallback narrative when students table has none
function synthesizeNarrative(profile: any): string {
  if (profile.factCount === 0) {
    return `${profile.revealName} is a ${profile.major} student who has not yet had a full conversation with Dilly. No profile built yet.`;
  }
  const achievements = profile.facts
    .filter((f: any) => f.category === "achievement")
    .slice(0, 2)
    .map((f: any) => f.label)
    .join(", ");
  const skills = profile.facts
    .filter((f: any) => ["skill_unlisted", "skill"].includes(f.category))
    .slice(0, 3)
    .map((f: any) => f.label)
    .join(", ");
  return [
    `${profile.revealName} is a ${profile.major} student on the ${profile.track} track.`,
    achievements ? `Dilly has captured: ${achievements}.` : "",
    skills ? `Skills mentioned in conversation: ${skills}.` : "",
    `${profile.factCount} facts extracted so far.`,
  ].filter(Boolean).join(" ");
}

// ── Preset roles ──────────────────────────────────────────────────────────
const PRESET_ROLES = [
  {
    id: "fullstack-startup",
    label: "Full-Stack Engineer at an Early-Stage Startup",
    description: `Full-Stack Engineer — Early Stage Startup\n\nWe need someone who can ship, not someone who needs hand-holding.\n- Has built real things in production\n- TypeScript, React, Python or similar\n- Works independently without a defined spec\n- Bias toward action and finishing\n- Bonus: freelance, client work, or side projects with real results`,
  },
  {
    id: "data-analyst",
    label: "Data Analyst — Business Intelligence",
    description: `Data Analyst — Business Intelligence\n\nWe need someone who finds the story in raw data.\n- Python or SQL for analysis\n- Experience with real datasets and predictive modeling\n- Can explain findings to non-technical stakeholders\n- Curious-first mindset\n- Bonus: regression, ML, or visualization work`,
  },
  {
    id: "software-engineer",
    label: "Software Engineer — Systems & Backend",
    description: `Software Engineer — Systems and Backend\n\nWe build infrastructure that matters.\n- Low-level systems: memory management, performance\n- C, C++, Rust, Go, or similar\n- Understands trade-offs between abstraction and control\n- Curious about how things actually work`,
  },
  {
    id: "founding-generalist",
    label: "Founding Team Member — Generalist",
    description: `Founding Team Member — Generalist\n\nBuilding from zero. No defined role.\n- Has built something from scratch without resources\n- Multiple hats: product, engineering, ops, sales\n- Track record of finishing things, not just starting them\n- Bonus: led people, built community, or dealt with real adversity`,
  },
];

// ── Fire-and-forget: notify Dilly API of recruiter interest ──────────────────
const DILLY_API_URL = process.env.DILLY_API_URL || "https://api.trydilly.com";
const DILLY_INTERNAL_KEY = process.env.DILLY_INTERNAL_KEY || "";

function notifyDillyOfInterest(payload: {
  candidate_email: string;
  candidate_name: string;
  recruiter_name: string;
  recruiter_company: string;
  recruiter_email: string | null;
  role_label: string;
  intro_message: string;
}): void {
  if (!DILLY_INTERNAL_KEY) {
    console.warn("[notify] DILLY_INTERNAL_KEY not set — skipping notification");
    return;
  }
  const body = JSON.stringify(payload);
  const url = new URL("/internal/recruiter-interest/notify", DILLY_API_URL);
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-Internal-Key": DILLY_INTERNAL_KEY,
    },
  };
  const req = lib.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      console.log(`[notify] Dilly interest notification: ${res.statusCode} — ${data.slice(0, 120)}`);
    });
  });
  req.on("error", (e) => {
    console.warn(`[notify] Dilly interest notification failed: ${e.message}`);
  });
  req.write(body);
  req.end();
}

// ── Ensure recruiter_interests table exists ───────────────────────────────
async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS recruiter_interests (
        id SERIAL PRIMARY KEY,
        recruiter_name TEXT NOT NULL,
        recruiter_company TEXT NOT NULL,
        recruiter_email TEXT,
        candidate_email TEXT NOT NULL,
        candidate_display_name TEXT NOT NULL,
        role_label TEXT NOT NULL,
        role_description TEXT,
        unlocked_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }
}
ensureSchema().catch(console.error);

// ── Routes ────────────────────────────────────────────────────────────────
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  app.get("/api/health", async (_req, res) => {
    try {
      const r = await pool.query("SELECT COUNT(*) as cnt FROM profile_facts WHERE email = ANY($1)", [CANDIDATE_EMAILS]);
      res.json({ ok: true, live: true, totalFacts: parseInt(r.rows[0].cnt) });
    } catch (e: any) {
      res.json({ ok: true, live: false, error: e.message });
    }
  });

  app.get("/api/blind-audition/roles", (_req, res) => {
    res.json({ roles: PRESET_ROLES });
  });

  // POST /api/blind-audition/search — pulls LIVE data from RDS every time
  app.post("/api/blind-audition/search", async (req, res) => {
    const roleDescription = (req.body?.role_description || "").trim();
    try {
      const profiles = await Promise.all(CANDIDATE_EMAILS.map(getLiveProfile));
      const scored = profiles
        .map(p => buildPayload(p, roleDescription))
        .sort((a, b) => b.score - a.score);
      res.json({ role_description: roleDescription, candidates: scored, liveFromDB: true });
    } catch (e: any) {
      console.error("search error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/blind-audition/candidate/:email — single candidate, live
  app.get("/api/blind-audition/candidate/:id", async (req, res) => {
    // id is email with @ replaced by - (dilan-kochhar-spartans-ut-edu) — find by prefix match
    const target = CANDIDATE_EMAILS.find(e =>
      e.split("@")[0].replace(/\./g, "-") === req.params.id
    );
    if (!target) return res.status(404).json({ error: "Candidate not found" });
    try {
      const profile = await getLiveProfile(target);
      res.json(buildPayload(profile, ""));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/blind-audition/interest — recruiter expresses interest, unlocks contact
  app.post("/api/blind-audition/interest", async (req, res) => {
    const { recruiter_name, recruiter_company, recruiter_email, candidate_email, candidate_display_name, role_label, role_description } = req.body || {};
    if (!recruiter_name || !recruiter_company || !candidate_email) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    // Verify candidate is in our list
    const validCandidate = CANDIDATE_EMAILS.find(e => e.toLowerCase() === candidate_email.toLowerCase());
    if (!validCandidate) return res.status(404).json({ error: "Candidate not found" });

    const client = await pool.connect();
    try {
      // Record interest
      await client.query(
        `INSERT INTO recruiter_interests
         (recruiter_name, recruiter_company, recruiter_email, candidate_email, candidate_display_name, role_label, role_description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [recruiter_name, recruiter_company, recruiter_email || null, validCandidate,
         candidate_display_name || "", role_label || "", role_description || ""]
      );

      // Fetch candidate contact info
      const profile = await getLiveProfile(validCandidate);

      // Build Dilly intro message
      const intro = buildIntroMessage({
        recruiterName: recruiter_name,
        recruiterCompany: recruiter_company,
        candidateName: profile.name,
        roleLabel: role_label,
        narrative: profile.dilly_narrative || profile.narrative || "",
      });

      // Fire-and-forget: notify the Dilly ecosystem
      notifyDillyOfInterest({
        candidate_email: validCandidate,
        candidate_name: profile.name,
        recruiter_name: recruiter_name,
        recruiter_company: recruiter_company,
        recruiter_email: recruiter_email || null,
        role_label: role_label || "",
        intro_message: intro,
      });

      // Tell the client whether the notification was actually attempted. The
      // notifyDillyOfInterest() helper silently no-ops when DILLY_INTERNAL_KEY
      // is missing — without surfacing that, the recruiter gets a success
      // screen even when the candidate will never hear from Dilly.
      const notificationAttempted = Boolean(DILLY_INTERNAL_KEY);

      res.json({
        ok: true,
        candidate: {
          name: profile.name,
          email: validCandidate,
          major: profile.major,
          track: profile.track,
        },
        intro_message: intro,
        notification: {
          attempted: notificationAttempted,
          channel: notificationAttempted ? "dilly_api" : null,
        },
      });
    } catch (e: any) {
      console.error("interest error:", e);
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // GET /api/blind-audition/interests — recruiter's saved interests (by email)
  app.get("/api/blind-audition/interests", async (req, res) => {
    const { recruiter_email } = req.query as any;
    if (!recruiter_email) return res.json({ interests: [] });
    const client = await pool.connect();
    try {
      const r = await client.query(
        `SELECT * FROM recruiter_interests WHERE recruiter_email = $1 ORDER BY unlocked_at DESC LIMIT 50`,
        [recruiter_email]
      );
      res.json({ interests: r.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  return httpServer;
}

// ── Build recruiter intro message ────────────────────────────────────────────────────
function buildIntroMessage({
  recruiterName,
  recruiterCompany,
  candidateName,
  roleLabel,
  narrative,
}: {
  recruiterName: string;
  recruiterCompany: string;
  candidateName: string;
  roleLabel: string;
  narrative: string;
}): string {
  const firstName = candidateName.split(" ")[0];
  const shortNarrative = narrative.length > 200 ? narrative.slice(0, 197) + "..." : narrative;
  return `Hi ${firstName},

My name is ${recruiterName}, and I work at ${recruiterCompany}.

I came across your profile through Dilly. I was looking for candidates for a ${roleLabel} role, and your profile stood out. Here is what Dilly surfaced about you:

"${shortNarrative}"

I would love to set up a quick conversation to learn more about you and what you are working on.

Let me know if you are open to it.

${recruiterName}
${recruiterCompany}`;
}
