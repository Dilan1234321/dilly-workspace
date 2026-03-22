# Push this workspace to GitHub

This folder is a **standalone git repo** containing your Meridian + OpenClaw workspace. To put it on your personal computer and sync with GitHub:

## 1. On this machine (before you go)

Already done for you:
- Git repo initialized in this workspace
- `.gitignore` set (env, venvs, node_modules, __pycache__ excluded)
- Initial commit created

## 2. Create the repo on GitHub

1. Go to [github.com/new](https://github.com/new).
2. Choose a name (e.g. `meridian-workspace` or `openclaw-meridian`).
3. **Do not** add a README, .gitignore, or license (this repo already has them).
4. Click **Create repository**.

## 3. Add remote and push (from your personal computer)

After you **copy this whole workspace** to your personal computer (e.g. clone from GitHub once it’s pushed, or copy the folder via USB/cloud):

```bash
cd /path/to/workspace   # the folder that contains dilly_core/, projects/, SOUL.md, etc.

# If you haven’t pushed from this machine yet, add GitHub as remote and push:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and the repo name you chose.

## 4. On your personal computer (after cloning or copying)

```bash
cd /path/to/workspace
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git pull origin main   # if you already pushed from the other machine
# or just work and push:
git add -A && git commit -m "your message" && git push
```

## Work on your personal machine (same level as now)

Clone and run the API + dashboard so you can keep developing Meridian the same way.

### 1. Clone

```bash
cd ~   # or wherever you keep projects
git clone https://github.com/Dilan1234321/meridian-workspace.git
cd meridian-workspace
```

### 2. Python (API + Meridian core)

From the **repo root** (`meridian-workspace/`):

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install uvicorn fastapi pydantic pypdf python-multipart reportlab
pip install python-docx      # optional: for .docx in build_training_data
pip install openai          # optional: for LLM auditor
```

For the API to find `dilly_core`, run commands from the repo root (or add it to `PYTHONPATH`).

### 3. Env (API keys, LLM)

Create a `.env` in the repo root (not committed). Copy from your other machine or add:

```bash
# Optional: use LLM for audits
MERIDIAN_USE_LLM=1
OPENAI_API_KEY=sk-...
# Optional: custom model
# MERIDIAN_LLM_MODEL=gpt-4o
```

### 4. Run API (backend)

From repo root:

```bash
source .venv/bin/activate
uvicorn projects.dilly.api.main:app --host 0.0.0.0 --port 8000
```

Or: `./run_meridian_api.sh` (if `.venv` is in repo root).

### 5. Run dashboard (frontend)

In a **second terminal**, from repo root:

```bash
cd projects/meridian/dashboard
npm install
npm run dev
```

Open **http://localhost:3000**. It talks to the API at `http://localhost:8000` by default.

### 6. Same context you have now

- **SOUL.md**, **USER.md**, **AGENTS.md** — in the repo; read them each session.
- **memory/** — daily notes; in the repo.
- **MEMORY.md** — create in repo root for long-term memory (main session only); add to `.gitignore` if you don’t want it on GitHub.
- **Rubrics** — `projects/meridian/prompts/rubric_pre_health.md`, `rubric_builder.md` (in repo).
- **Training data** — `projects/meridian/prompts/training_data.json` (in repo; may be empty; regenerate with `python3 -m projects.dilly.scripts.build_training_data` after `pip install python-docx` if you have resumes in `assets/resumes/`).

### 7. Quick test

1. Start API (port 8000), then dashboard (port 3000).
2. Open http://localhost:3000, upload a PDF — you should get an audit (rule-based or LLM if `MERIDIAN_USE_LLM=1` and `OPENAI_API_KEY` set).

---

## Notes

- **Secrets:** `.env` and `*.env` are in `.gitignore`; don’t commit API keys. Copy `.env` by hand to your personal machine or use a secrets manager.
- **Resume PDFs:** `assets/resumes/` is tracked. If you want to avoid pushing large PDFs, add `assets/resumes/*.pdf` to `.gitignore` and run `git rm --cached assets/resumes/*.pdf` once.
