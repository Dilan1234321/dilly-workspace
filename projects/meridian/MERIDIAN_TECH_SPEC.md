# VANTAGE_TECH_SPEC.md

## 1. Attribute Map Schema
The `Attribute Map` is a high-fidelity JSON representation of a candidate's latent potential, moving beyond keywords into behavioral and technical synthesis.

```json
{
  "candidate_id": "uuid",
  "identity": {
    "name": "string",
    "prestige_score": 0.0, 
    "velocity_index": 0.0 
  },
  "attributes": {
    "technical_depth": {
      "languages": [{"name": "string", "proficiency": 0.9}],
      "architecture_score": 0.85,
      "stack_diversity": ["string"],
      "oss_contribution_weight": 0.0
    },
    "leadership_signal": {
      "board_positions": 0,
      "organizational_complexity": "scale_1_to_10",
      "peer_influence_delta": 0.0
    },
    "grit_and_relentlessness": {
      "commitment_density": 0.9,
      "difficulty_baseline": "high",
      "side_hustle_velocity": 0.8,
      "raw_output_metric": "loc/commits/deployments"
    }
  },
  "raw_signals": {
    "github_summary": "string",
    "linkedin_summary": "string"
  }
}
```

## 2. LinkedIn Scraper Architecture
To ensure high-tier reliability and avoid rate-limiting or bans, we utilize a **Hybrid-Agentic Scraping Engine**.

### Core Components:
- **Stealth Playwright Layer**: Uses `playwright-extra` with `stealth` plugin to emulate human browsing behavior (mouse jitters, varied scroll speeds).
- **Session Management**: Securely handles cookie persistence via local storage to minimize login frequency.
- **Proxy Rotation**: Integrates residential proxies to rotate egress IPs on every 5th profile scrape.
- **Data Extraction**:
  - `Profile Parser`: Extracts Experience, Education, and Volunteer segments.
  - `Post/Activity Scraper`: Captures recent 'thought leadership' or 'engagement' signals to feed into the Grit score.

## 3. LLM-Scoring Logic: The 'Relentless Builder' Algorithm
Turning raw text into a '% Match' for complex, high-prestige queries.

### The Pipeline:
1. **Contextual Enrichment**: 
   - GitHub data is processed to identify *project complexity* and *consistency*. (e.g., Is the code production-ready? Are there daily commits over 6 months?)
   - LinkedIn data is processed to identify *trajectory*. (e.g., Moving from Member to President in <1 year.)
2. **The Prompt Engineering Layer**:
   - We feed the LLM a 'Persona definition' of a 'Relentless Builder' (defined as: high output, low supervision, multi-disciplinary execution).
   - The LLM performs a **Chain-of-Thought (CoT)** evaluation of the Attribute Map against the definition.
3. **Scoring Formula**:
   - `Grit Score (40%)` + `Technical Competence (30%)` + `Leadership Trajectory (30%)` = **Vantage Match %**.
4. **Validation**: A cross-check step looks for 'Signal Noise' (e.g., empty repos or buzzword-stuffed profiles) and applies a penalty multiplier.
