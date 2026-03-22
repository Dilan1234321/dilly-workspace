# Aplivio (MVP)

Next.js app: college list with **illustrative** odds, **saved list**, **AI admissions analysis** (strengths / gaps / action plan per saved school), **rule-based action plan**, **essay rubric** + optional **OpenAI** coaching, **deadline timeline**, **session + SQLite** storage, and **privacy / methodology** pages.

## Setup

```bash
cd aplivio
cp env.example .env
npm install
npm run db:push
npm run dev
```

Default URL: **`http://localhost:3011`**. To use another port for one run:

```bash
PORT=3020 npm run dev
```

**Port already in use (`EADDRINUSE`):** free it (macOS) or pick a new `PORT` as above.

```bash
lsof -ti :3011 | xargs kill
# if it refuses:
lsof -ti :3011 | xargs kill -9
```

- **Database:** `DATABASE_URL` defaults to `file:./prisma/dev.db` (see `env.example`). The file is gitignored.
- **Sessions:** Anonymous `HttpOnly` cookie + `Session` row (profile JSON + saved college ids + disclaimer timestamp).
- **Migration:** Old **localStorage** keys (`aplivio_student_profile_v1`, `aplivio_saved_colleges_v1`) are merged once into the server then cleared.

## Optional AI essay coach

Add to `.env` or `.env.local`:

```env
OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini
```

Without a key, the rubric still works in the browser; the coach button shows a short notice.

## Production

SQLite does not suit serverless multi-instance hosts. Point `DATABASE_URL` at **PostgreSQL** (e.g. Neon, Supabase) and run `prisma db push` or migrations in CI.

## Data

- `src/data/colleges.json` — demo schools; replace with licensed / official pipelines for production.

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Dev server (default port **3011**, override with `PORT`) |
| `npm run build` | Production build |
| `npm run db:push` | Apply `schema.prisma` to the local DB |
| `npm run db:studio` | Prisma Studio |
