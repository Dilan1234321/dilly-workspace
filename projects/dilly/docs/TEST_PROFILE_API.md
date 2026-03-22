# How to test the profile API

Two ways: run the test script (no server), or test manually with the API running (curl or dashboard).

---

## Option 1: Run the test script (no server needed)

From **workspace root**, with your Python environment active (venv where FastAPI is installed):

```bash
python projects/meridian/scripts/test_profile_api.py
```

Or:

```bash
python3 projects/meridian/scripts/test_profile_api.py
```

If you use a venv:

```bash
source path/to/meridian_venv/bin/activate   # or your venv path
python projects/meridian/scripts/test_profile_api.py
```

The script will:

1. Create a profile for `you@spartans.ut.edu` (if missing)
2. Create a session token
3. Call **GET /profile** → expect 200 and default profile
4. Call **PATCH /profile** with major, track, goals → expect 200 and updated profile
5. Call **GET /profile** again → confirm data persisted
6. Print the path to the profile file on disk (e.g. `memory/dilly_profiles/<id>/profile.json`)

If all steps pass, the profile API is working. You can open the printed file path to inspect the JSON.

---

## Option 2: Test with the API server running

### 1. Start the API

```bash
cd projects/meridian/api && uvicorn projects.dilly.api.main:app --reload --port 8000
```

(Or from workspace root with correct `PYTHONPATH`.)

### 2. Get a session token (magic link flow)

**a) Request a magic link**

```bash
curl -X POST http://localhost:8000/auth/send-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "you@spartans.ut.edu"}'
```

Response includes `"magic_token": "..."`. Copy that token.

**b) Verify (simulates clicking the link)**

```bash
curl "http://localhost:8000/auth/verify?token=PASTE_MAGIC_TOKEN_HERE"
```

Response includes `"token": "..."` — that’s your **session token** (Bearer). Copy it.

### 3. Call the profile endpoints

**GET profile**

```bash
curl -X GET http://localhost:8000/profile \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

You should get 200 and a JSON profile (email, verified, major, goals, etc.). First time after sign-in the profile is created automatically.

**PATCH profile (update)**

```bash
curl -X PATCH http://localhost:8000/profile \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"major": "International Business", "preProfessional": true, "track": "Pre-Health", "goals": ["internship", "aiming_med_school"]}'
```

You should get 200 and the updated profile JSON.

**GET profile again** (same as above) to confirm the updated data is persisted.

### 4. Check the file on disk

Profile is stored under:

```
memory/dilly_profiles/<16-char-hex>/
  profile.json
```

The `<16-char-hex>` is derived from the user’s email. You can list dirs in `memory/dilly_profiles/` and open `profile.json` in the folder that was just created/updated.

---

## Optional: Test from the dashboard

If the dashboard is already wired to the API:

1. Sign in with a .edu email (magic link).
2. Open browser DevTools → Network (or Console).
3. Run:

```js
fetch('/profile', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('meridian_auth_token') } }).then(r => r.json()).then(console.log)
```

(Adjust the key if your app stores the token under a different name, e.g. `meridian_auth_token`.)

You should see your profile JSON. To test PATCH from the console you can use the same `fetch` with `method: 'PATCH'`, `body: JSON.stringify({ major: '...', goals: [...] })`, and `headers: { 'Content-Type': 'application/json', ... }`.
