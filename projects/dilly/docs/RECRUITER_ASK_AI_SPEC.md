# Recruiter Ask AI — Consultant-Style Assistant

## Overview

The Ask AI component lets recruiters ask natural-language questions about a candidate. The AI acts as a talent scout that analyzes Smart, Grit, and Build data—**evidence-based**, not hallucinatory.

## Architecture

### Data Flow

1. **Context injection** — Backend builds a context block from:
   - **Cleaned profile** — `dilly_profile_txt` (full text: identity, resume, education, experience)
   - **Smart/Grit/Build evidence** — `evidence_quotes` from latest audit (verbatim resume quotes)
   - **Structured experience** — Role-ranked for the current JD when `role_description` is provided
   - **JD-to-evidence map** — When role is set, green/yellow/red requirements + evidence
   - **Scores** — Smart, Grit, Build, Meridian take

2. **System persona** — Instructs the model to:
   - Be evidence-based; never invent facts
   - Use technical descriptions and evidence quotes to validate work when no GitHub link exists
   - Cite specific evidence when answering
   - Say "not enough information" when context is insufficient

3. **Streaming** — SSE from FastAPI; frontend consumes via `fetch` + `ReadableStream`.

### API

- **POST** `/recruiter/candidates/{candidate_id}/ask`
- **Body:** `{ question: string, role_description?: string }`
- **Headers:** `X-Recruiter-API-Key`
- **Response:** `text/event-stream` — `data: {"text": "chunk"}\n\n` … `data: [DONE]\n\n`

### Quick Action Queries

- "How do they handle technical ambiguity?"
- "What is the biggest risk in hiring this candidate for this JD?"
- "Generate 3 custom interview questions based on their Build gaps."

## Prompt Template (Evidence-Based)

```
You are an expert recruiter assistant for Meridian. Your job is to find evidence of high-performance traits in candidates. You must be EVIDENCE-BASED: only cite information that appears in the provided context. Never invent or assume facts.

Rules:
- If a student doesn't have a GitHub link for a project, look at their technical descriptions and Smart/Grit/Build evidence quotes to validate their logic and work ethic.
- Cite specific evidence when answering (e.g. "From their KVR Properties experience: '...'").
- If the context doesn't contain enough information to answer, say so clearly. Do not hallucinate.
- Be concise and recruiter-scannable. Use bullets when listing multiple points.
- Focus on Smart (analytical rigor, technical depth), Grit (persistence, ownership), and Build (shipping, impact) dimensions.

=== CANDIDATE PROFILE (Cleaned) ===
[profile_txt]

=== SMART / GRIT / BUILD EVIDENCE (verbatim from resume) ===
SMART: [quote]
GRIT: [quote]
BUILD: [quote]

=== SCORES ===
Smart: X, Grit: Y, Build: Z
Meridian take: [if present]

=== STRUCTURED EXPERIENCE (role-ranked) ===
[entries with fit_reason and bullets]

=== JD-TO-EVIDENCE MAP ===
[requirement → evidence when role_description provided]

=== ROLE DESCRIPTION (current search) ===
[when recruiter searched with a JD]
```

## Files

- **API:** `projects/meridian/api/routers/recruiter.py` — `_ASK_AI_SYSTEM_PROMPT`, `_build_ask_ai_context`, `_stream_ask_ai`, `POST /candidates/{id}/ask`
- **Component:** `projects/meridian/dashboard/src/components/recruiter/AskAIChat.tsx`
- **Styles:** `projects/meridian/dashboard/src/app/recruiter/recruiter-talent.css` — `.te-ask-ai*`

## Dependencies

- `OPENAI_API_KEY` — Required for LLM calls
- `MERIDIAN_LLM_MODEL` — Optional; defaults to `gpt-4o` for Ask AI (strong model for recruiter analysis)
