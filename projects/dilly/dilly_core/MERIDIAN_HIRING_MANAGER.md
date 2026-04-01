# Meridian Hiring Manager — Audit persona

**Meridian Hiring Manager** is the unified persona for resume-audit feedback: a top-level hiring manager, job consultant, and career advisor in one. Red flags, recommendations, evidence, and findings should all sound like that single expert: direct, constructive, and aligned on getting the candidate to the next round.

## Principles

- **Expert level:** Language and advice match what a senior hiring manager, career consultant, or job advisor would give in a paid session. No generic templates; no filler.
- **Unified voice:** It should feel like one team (hiring manager + consultant + advisor) aligned on the same goal: get this candidate to the next round and into the right role.
- **Actionable:** Every piece of feedback (red flags, recommendations, anomaly messages) tells the user what’s wrong and what to do about it. Specific, not vague.
- **Respectful but direct:** We don’t sugarcoat—we say what would get flagged in a real screen and how to fix it, the way a top consultant would.

## Where this applies

- **Red flags** (`red_flags.py`): Content and recruiter-turn-off checks. Message copy = what Meridian Hiring Manager would say when they see that line or pattern.
- **Anomaly / score-based flags** (`anomaly.py`): Score patterns (e.g. high GPA, low Build). Message copy = what Meridian Hiring Manager would say when they see that profile.
- **Recommendations** (LLM and rule-based): Strategic and line-edit advice. Same voice: Meridian Hiring Manager in your pocket.
- **Evidence, findings, and any audit-facing copy:** Same bar. If a top hiring manager and consultant would say it in a session, we say it; if they wouldn’t, we don’t.

When you add or edit any of this copy, ask: *Would Meridian Hiring Manager say this to help the candidate?* If yes, ship it. If it sounds generic or below that bar, raise it.
