/**
 * Application Blitz Workflow
 *
 * A durable workflow that helps a student batch-apply to multiple companies:
 * 1. Fetches matched jobs based on student profile
 * 2. Filters by student preferences
 * 3. Creates application entries for each
 * 4. Adds deadlines for follow-ups
 * 5. Returns a summary
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function applicationBlitzWorkflow(
  authToken: string,
  options: {
    maxApplications?: number;
    industry?: string;
    minMatchScore?: number;
  } = {},
) {
  "use workflow";

  const maxApps = options.maxApplications || 10;
  const minMatch = options.minMatchScore || 70;

  // Step 1: Fetch matching jobs
  const jobs = await fetchMatchingJobs(authToken, options.industry, minMatch) as Array<Record<string, unknown>>;

  if (jobs.length === 0) {
    return {
      status: "no_matches",
      message: "No matching jobs found. Try broadening your criteria.",
    };
  }

  // Step 2: Create application entries
  const applications = await createApplicationEntries(
    authToken,
    jobs.slice(0, maxApps),
  );

  // Step 3: Add follow-up deadlines (14 days from now)
  const deadlines = await addFollowUpDeadlines(authToken, applications);

  return {
    status: "completed",
    applications_created: applications.length,
    deadlines_added: deadlines.length,
    companies: applications.map((a) => a.company),
  };
}

// --- Steps ---

async function fetchMatchingJobs(
  authToken: string,
  industry: string | undefined,
  minMatch: number,
) {
  "use step";

  const params = new URLSearchParams();
  if (industry) params.set("industry", industry);
  params.set("min_match", String(minMatch));
  params.set("limit", "20");

  const res = await fetch(`${API_BASE}/jobs/matched?${params}`, {
    headers: { Authorization: `Bearer ${authToken}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data as Record<string, unknown>).jobs || [];
}

async function createApplicationEntries(
  authToken: string,
  jobs: Array<Record<string, unknown>>,
) {
  "use step";

  const created: Array<{ company: string; role: string }> = [];

  for (const job of jobs) {
    const company = String(job.company || job.company_name || "");
    const role = String(job.title || job.role || "");
    if (!company || !role) continue;

    try {
      const res = await fetch(`${API_BASE}/voice/execute-action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "CREATE_APPLICATION",
          data: {
            company,
            role,
            status: "saved",
            url: String(job.url || job.apply_url || ""),
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const result = await res.json();
        if (!result.skipped) created.push({ company, role });
      }
    } catch {
      // Continue with remaining jobs
    }
  }

  return created;
}

async function addFollowUpDeadlines(
  authToken: string,
  applications: Array<{ company: string; role: string }>,
) {
  "use step";

  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + 14);
  const dateStr = followUpDate.toISOString().split("T")[0];

  const added: string[] = [];

  for (const app of applications) {
    try {
      const res = await fetch(`${API_BASE}/voice/execute-action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "CREATE_DEADLINE",
          data: {
            label: `Follow up: ${app.company} (${app.role})`,
            date: dateStr,
            type: "deadline",
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) added.push(app.company);
    } catch {
      // Continue
    }
  }

  return added;
}
