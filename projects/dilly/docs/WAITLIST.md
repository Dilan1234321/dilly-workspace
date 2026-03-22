# Waitlist signups

The marketing site "Join the waitlist" form POSTs to `POST /waitlist` on the Meridian API. Signups are stored in a single file you can open and edit.

## File location

**Path (from workspace root):** `memory/meridian_waitlist.txt`

The file is created on first signup. The API appends one line per signup.

## Format

One line per email, tab-separated:

```
email@university.edu	2026-03-16T20:30:00Z
another@school.edu	2026-03-16T21:15:00Z
```

- **Column 1:** email (lowercased)
- **Column 2:** UTC timestamp (ISO format)

You can open the file in any editor, sort it, dedupe by email, or import into a spreadsheet (split on tab).

## API

- **Endpoint:** `POST /waitlist`
- **Body:** `{ "email": "you@university.edu" }`
- **Rate limit:** 5 requests per minute per IP
- **CORS:** Allows `https://meridian-careers.com` and `https://www.meridian-careers.com`
