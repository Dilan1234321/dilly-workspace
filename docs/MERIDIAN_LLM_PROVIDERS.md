# Meridian LLM setup (OpenAI only)

The normalizer and auditor use **OpenAI** (or an OpenAI-compatible endpoint). Set `OPENAI_API_KEY` and optionally `MERIDIAN_LLM_MODEL`.

## Setup

1. Get an API key from [platform.openai.com](https://platform.openai.com).
2. Set in your environment (or `.env`):

```bash
MERIDIAN_USE_LLM=1
OPENAI_API_KEY=sk-xxxxxxxx
```

3. Default model is **gpt-4o**. Optional override:

```bash
MERIDIAN_LLM_MODEL=gpt-4o          # default
MERIDIAN_LLM_MODEL=gpt-4o-mini     # cheaper
```

4. For a custom base URL (e.g. Azure, proxy): set `OPENAI_BASE_URL` and `MERIDIAN_LLM_MODEL` as needed.

## Learning from each resume (auto-training)

Each resume you process improves the next one:

- **Normalizer:** Every successful normalization is appended to `projects/meridian/prompts/resume_normalizer_live.json`. The next resume gets the last few of these as extra few-shot examples (so formatting and section mapping improve as you upload more).
- **Auditor:** Every audit is appended to `projects/meridian/prompts/training_data.json` (by the API). The LLM auditor uses these as few-shot examples for scoring and recommendations.

No extra steps needed — just keep uploading. To turn off normalizer learning: `MERIDIAN_NORMALIZER_LIVE_LEARN=0`. Optional: `MERIDIAN_NORMALIZER_LIVE_MAX=30` (max stored), `MERIDIAN_NORMALIZER_LIVE_IN_PROMPT=3` (how many recent examples go into the next prompt).

## Dependencies

- `pip install openai`
- `pip install python-dotenv` (for loading `.env`)
