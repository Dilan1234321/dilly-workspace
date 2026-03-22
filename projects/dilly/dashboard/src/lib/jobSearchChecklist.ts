/**
 * Job search checklist on Get Hired: same item ids across stages (localStorage),
 * titles + hints shift with how far along the user is (apps, interviews, scores).
 */

export type JobSearchChecklistStage = "exploring" | "applying" | "interviewing";

export type JobSearchChecklistPhase = {
  id: string;
  title: string;
  blurb: string;
  items: { id: string; title: string; hint: string }[];
};

type HabitsLite = {
  applied_count?: number;
  applications_this_month?: number;
  milestones?: { first_application?: boolean; first_interview?: boolean };
} | null;

type NudgesLite = {
  app_funnel?: { interviews?: number };
} | null;

type AuditLite = { final_score?: number } | null | undefined;

/** Order: interviewing > applying > exploring */
export function deriveJobSearchChecklistStage(input: {
  habits: HabitsLite;
  proactiveNudges: NudgesLite;
  displayAudit: AuditLite;
}): JobSearchChecklistStage {
  const interviews = input.proactiveNudges?.app_funnel?.interviews ?? 0;
  if (input.habits?.milestones?.first_interview || interviews > 0) return "interviewing";
  if (input.habits?.milestones?.first_application) return "applying";
  const applied = input.habits?.applied_count ?? 0;
  if (applied >= 1) return "applying";
  const thisMonth = input.habits?.applications_this_month ?? 0;
  if (thisMonth >= 1) return "applying";
  const fc = input.displayAudit?.final_score;
  if (typeof fc === "number" && fc >= 70) return "applying";
  return "exploring";
}

export function jobSearchChecklistStageSubtitle(stage: JobSearchChecklistStage): string {
  switch (stage) {
    case "exploring":
      return "Early search — foundation first";
    case "applying":
      return "Actively applying — pipeline & follow-through";
    case "interviewing":
      return "Interviews in play — depth & momentum";
    default:
      return "";
  }
}

const COPY = {
  story: {
    titles: {
      exploring: "Lock your story",
      applying: "Sharpen your story while you apply",
      interviewing: "Align story, resume, and interview answers",
    },
    blurbs: {
      exploring: "Recruiters should see one sharp target—not a generic student resume.",
      applying: "You've started applying—keep one clear through-line so every version points at the same North Star.",
      interviewing: "Interviewers compare notes with your materials; consistency beats a perfect buzzword list.",
    },
    items: [
      {
        id: "js_target_sentence",
        titles: {
          exploring: "Name your target out loud",
          applying: "Target sentence matches your applications",
          interviewing: "Tight answers for “what you want”",
        },
        hints: {
          exploring:
            "One sentence: role family + field + city or remote. Repeat it until it feels natural when someone asks what you want.",
          applying:
            "Compare your sentence to a few job posts you actually applied to—tweak verbs and scope so it matches what you submit.",
          interviewing:
            "Practice a 15-second and a 60-second version; borrow phrasing from firms where you're in process.",
        },
      },
      {
        id: "js_resume_stack",
        titles: {
          exploring: "Master resume + one tailored file",
          applying: "Tailor fast—same base, smart swaps",
          interviewing: "Resume matches what you'll say out loud",
        },
        hints: {
          exploring:
            "Keep a base resume; duplicate and tweak headline + top bullets for the role type you’re applying to most.",
          applying:
            "One master file; before each app swap headline + ~2 bullets. Time-box tailoring so you still ship volume.",
          interviewing:
            "Cut anything you can't defend with a story—panels will go deep on what’s on the page.",
        },
      },
      {
        id: "js_linkedin_align",
        titles: {
          exploring: "LinkedIn matches that story",
          applying: "LinkedIn backs up your inbox",
          interviewing: "LinkedIn matches your live conversations",
        },
        hints: {
          exploring:
            "Headline = the role you want, not only your school. About leads with direction; experience echoes your resume.",
          applying:
            "Recruiters cross-check DMs and apps; headline should echo the roles you're pursuing this month.",
          interviewing:
            "Subtle alignment with firms you're talking to—same narrative, no spammy keyword stuffing.",
        },
      },
      {
        id: "js_proof_link",
        titles: {
          exploring: "Proof you can link",
          applying: "Proof links pass the click test",
          interviewing: "Proof ready to screenshare",
        },
        hints: {
          exploring:
            "Portfolio, GitHub, writing sample, or key project—whatever your track expects—URL on resume and profile.",
          applying:
            "Open every link in a private window—no broken repos, permission walls, or empty profiles before a screen.",
          interviewing:
            "Have portfolio/repo loaded; one crisp sentence each on your role and impact when they ask to look.",
        },
      },
    ],
  },
  pipeline: {
    titles: {
      exploring: "Run your pipeline",
      applying: "Grow and fix the pipeline",
      interviewing: "Balance apps with active processes",
    },
    blurbs: {
      exploring: "Volume without chaos: every app logged, every strong lead has a next step.",
      applying: "If replies are thin, mix in safer bets and tighten first-screen fit—not only more dream logos.",
      interviewing: "Keep a few irons in the fire until you sign; momentum on open threads often beats new cold applies.",
    },
    items: [
      {
        id: "js_target_mix",
        titles: {
          exploring: "10+ targets with tiers",
          applying: "Refresh your target mix",
          interviewing: "Pipeline for plan B (and C)",
        },
        hints: {
          exploring:
            "Mix of reach, match, and safer bets—not only dream logos. Put deadlines on your calendar where they exist.",
          applying:
            "If ghosting stings, add match/safer tiers and compare which titles get responses—double down there.",
          interviewing:
            "Until you have an offer, keep 3–5 quality apps moving so you don't negotiate with zero alternatives.",
        },
      },
      {
        id: "js_tracker",
        titles: {
          exploring: "Application tracker in use",
          applying: "Tracker = source of truth",
          interviewing: "Stage every active process",
        },
        hints: {
          exploring:
            "Each row: date sent, role, portal/link, and a follow-up date (try 7–10 days if you hear nothing).",
          applying:
            "Columns for last touch and next action—no row sits without a dated follow-up or a closed reason.",
          interviewing:
            "Track round, next date, and interviewer themes—superday and panels need different prep notes.",
        },
      },
      {
        id: "js_warm_conversations",
        titles: {
          exploring: "Three live conversations booked",
          applying: "Warm intros alongside volume",
          interviewing: "Gratitude and specificity after screens",
        },
        hints: {
          exploring:
            "Alumni chat, recruiter screen, referral call, or career fair follow-up—on the calendar, not “someday.”",
          applying:
            "Aim for one referral or alum thread for every handful of portal apps—warmth converts faster than spray-and-pray.",
          interviewing:
            "Thank-you within 24h with one line that references what they said—not a generic template.",
        },
      },
      {
        id: "js_job_alerts",
        titles: {
          exploring: "Alerts match your keywords",
          applying: "Alerts mirror what’s working",
          interviewing: "Alerts for the next window",
        },
        hints: {
          exploring:
            "At least two saved searches or alerts that use the same words as your target sentence—not “internship” alone.",
          applying:
            "Steal phrasing from posts that got you replies—even nos teach you which titles and skills to watch.",
          interviewing:
            "Save next-season or return-offer style alerts so you’re not starting from zero after this cycle.",
        },
      },
    ],
  },
  convert: {
    titles: {
      exploring: "Turn silence into momentum",
      applying: "Break silence with better follow-up",
      interviewing: "Close rounds with depth",
    },
    blurbs: {
      exploring: "Follow-up, prep, and stories so interviews feel rehearsed—not improvised.",
      applying: "Polite persistence plus stronger stories beats waiting in silence.",
      interviewing: "Round-specific prep and questions signal you’re serious about the seat, not just the logo.",
    },
    items: [
      {
        id: "js_follow_up_sent",
        titles: {
          exploring: "One real follow-up sent",
          applying: "Follow-up with receipts",
          interviewing: "Follow up after each round",
        },
        hints: {
          exploring:
            "Polite nudge on an application you care about, with the role + date you applied in the first line.",
          applying:
            "Lead with role + date applied + one specific fit line—keep it under ~120 words and easy to forward.",
          interviewing:
            "Same thread, new value: clarify something you loved or share a tight work sample link if appropriate.",
        },
      },
      {
        id: "js_star_stories",
        titles: {
          exploring: "Four STAR stories with numbers",
          applying: "STAR bank from real applications",
          interviewing: "Round-specific STAR set",
        },
        hints: {
          exploring:
            "Situation, task, action, result—each with a metric or concrete outcome. Use them in forms and interviews.",
          applying:
            "Mine bullets you used in apps; map each story to JD themes you keep seeing in your targets.",
          interviewing:
            "Add or sharpen stories for leadership, conflict, and ambiguity—practice out loud under 90 seconds each.",
        },
      },
      {
        id: "js_company_brief",
        titles: {
          exploring: "Brief for your next conversation",
          applying: "Brief before every screen",
          interviewing: "Brief for panel + next round",
        },
        hints: {
          exploring:
            "What they sell, who they serve, one recent headline, and why you + why them in three bullets.",
          applying:
            "~10 minutes before each call: product, customer, news, and why you—same note for first and second rounds.",
          interviewing:
            "Know who’s in the next round, what they optimize for, and one tailored question per person.",
        },
      },
      {
        id: "js_your_questions",
        titles: {
          exploring: "Three questions you’ll ask them",
          applying: "Questions that show judgment",
          interviewing: "Questions through offer stage",
        },
        hints: {
          exploring:
            "About the team, how success is measured, and next steps—not questions Google could answer in ten seconds.",
          applying:
            "Ask about success metrics, team shape, and decision timeline—skip anything on the careers page footer.",
          interviewing:
            "Write down comp, start date, team placement, and growth before the call so you don’t improvise under pressure.",
        },
      },
    ],
  },
} as const;

export function getJobSearchChecklistPhases(stage: JobSearchChecklistStage): JobSearchChecklistPhase[] {
  const s = stage;
  return [
    {
      id: "story",
      title: COPY.story.titles[s],
      blurb: COPY.story.blurbs[s],
      items: COPY.story.items.map((row) => ({
        id: row.id,
        title: row.titles[s],
        hint: row.hints[s],
      })),
    },
    {
      id: "pipeline",
      title: COPY.pipeline.titles[s],
      blurb: COPY.pipeline.blurbs[s],
      items: COPY.pipeline.items.map((row) => ({
        id: row.id,
        title: row.titles[s],
        hint: row.hints[s],
      })),
    },
    {
      id: "convert",
      title: COPY.convert.titles[s],
      blurb: COPY.convert.blurbs[s],
      items: COPY.convert.items.map((row) => ({
        id: row.id,
        title: row.titles[s],
        hint: row.hints[s],
      })),
    },
  ];
}
