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
cd /path/to/workspace   # the folder that contains meridian_core/, projects/, SOUL.md, etc.

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

## Notes

- **Secrets:** `.env` and `*.env` are in `.gitignore`; don’t commit API keys. Copy `.env` by hand to your personal machine or use a secrets manager.
- **Resume PDFs:** `assets/resumes/` is tracked. If you want to avoid pushing large PDFs, add `assets/resumes/*.pdf` to `.gitignore` and run `git rm --cached assets/resumes/*.pdf` once.
