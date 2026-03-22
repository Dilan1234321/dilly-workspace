# Dilly — student app

Student-facing Next.js app. **Separate** from the internal testing dashboard in `projects/dilly/dashboard` (do not modify that app from here).

## Dev

| App | Directory | Dev URL |
|-----|-----------|---------|
| Internal dashboard / audit QA | `projects/dilly/dashboard` | [http://localhost:3000](http://localhost:3000) |
| **This student app** | `projects/dilly/student` | [http://localhost:3001](http://localhost:3001) |

Both use the same FastAPI backend. Set the API base URL locally:

```bash
cp env.local.example .env.local
# edit if your API is not http://localhost:8000
```

```bash
npm install
npm run dev
```

`npm run dev` binds **port 3001** (see `package.json`).

## API

- New student flows call **new** endpoints (auth, `POST /audit/run`, etc.) as they are added to `projects/dilly/api`.
- CORS: default API config already allows `http://localhost:3001`. If you override `CORS_ORIGINS` in production, **add** the student app’s production origin to that list (do not drop existing dashboard origins).

## Stack

Next.js 14 (App Router), TypeScript, Tailwind — scaffolded with `create-next-app@14`.
