import { NextRequest, NextResponse } from 'next/server';

const MOCK_RESPONSES: Record<string, string> = {
  default: "Great question! Based on your profile, I'd focus on quantifying your impact — numbers make bullets memorable to recruiters. Want me to review a specific section of your resume?",
  build: "Your Build score reflects what you've actually shipped. The fastest way to raise it is to add a measurable project outcome — e.g., 'reduced query time by 40%' or 'used by 200+ students'. What project are you most proud of?",
  grit: "Grit captures leadership and persistence. Think about times you drove something from start to finish, led a team, or pushed through obstacles. Add those specifics to your bullets — recruiters notice.",
  smart: "Smart reflects your academic rigor and relevant coursework. If you've taken advanced stats, ML, or data engineering courses, make sure they're visible on your resume. Recruiters scan for signal fast.",
  resume: "Upload your resume in the Scores tab and I'll give you a full breakdown across Smart, Grit, and Build — with specific rewrites for each bullet. That's where the real gains are.",
  jobs: "Based on your scores, you're strongest for data analyst and analytics engineer roles at growth-stage companies. Cloudflare, Snowflake, and Databricks are all solid fits. Check the Jobs page for your full match list.",
  interview: "For a data role interview: prep SQL window functions, be ready for a 'tell me about a project' question (use STAR format), and have a question about the team's data stack. What company is the interview with?",
  salary: "For data analyst intern roles, typical comp is $25–40/hr depending on company tier. Big tech and finance skew higher. Once you have an offer, use it as leverage — most companies will at least match competing offers.",
};

function getMockResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('build')) return MOCK_RESPONSES.build;
  if (lower.includes('grit')) return MOCK_RESPONSES.grit;
  if (lower.includes('smart') || lower.includes('gpa') || lower.includes('academic')) return MOCK_RESPONSES.smart;
  if (lower.includes('resume') || lower.includes('cv') || lower.includes('bullet')) return MOCK_RESPONSES.resume;
  if (lower.includes('job') || lower.includes('match') || lower.includes('ready')) return MOCK_RESPONSES.jobs;
  if (lower.includes('interview') || lower.includes('prep') || lower.includes('question')) return MOCK_RESPONSES.interview;
  if (lower.includes('salary') || lower.includes('pay') || lower.includes('comp') || lower.includes('offer')) return MOCK_RESPONSES.salary;
  return MOCK_RESPONSES.default;
}

const SYSTEM_PROMPT = `You are Dilly, an AI career advisor built specifically for college students.
You help students improve their resumes, understand their career readiness scores (Smart, Grit, Build),
prepare for interviews, find internships and jobs, and navigate the job market.

Keep responses concise (2-4 sentences), specific, and actionable.
Avoid generic advice. Ask follow-up questions to give better guidance.
You know about Dilly's scoring system: Smart (academics/rigor), Grit (leadership/impact), Build (projects/shipped work).`;

export async function POST(req: NextRequest) {
  const { messages } = await req.json() as { messages: { role: string; content: string }[] };
  const lastMessage = messages[messages.length - 1]?.content ?? '';

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Mock mode
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    return NextResponse.json({ content: getMockResponse(lastMessage) });
  }

  // Real Claude call
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!resp.ok) {
    return NextResponse.json({ content: getMockResponse(lastMessage) });
  }

  const data = await resp.json() as { content: { type: string; text: string }[] };
  const content = data.content?.[0]?.text ?? getMockResponse(lastMessage);
  return NextResponse.json({ content });
}
