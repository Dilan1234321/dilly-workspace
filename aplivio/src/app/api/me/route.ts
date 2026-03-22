import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeProfile, parseSavedIds } from "@/lib/profileJson";
import { DEFAULT_PROFILE } from "@/types/student";

export const runtime = "nodejs";

const COOKIE = "aplivio_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

const studentProfileSchema = z.object({
  name: z.string().max(200),
  gpaUnweighted: z.number().min(0).max(4),
  gpaWeighted: z.number().min(0).max(5.5).optional(),
  sat: z.number().min(400).max(1600).optional(),
  act: z.number().min(1).max(36).optional(),
  apCourseIds: z.array(z.string().max(64)).max(40),
  advancedCourses: z.number().min(0).max(24),
  extracurricularStrength: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  extracurricularsDescription: z.string().max(8000),
  workExperienceDescription: z.string().max(8000),
  honorsAndAwardsDescription: z.string().max(8000),
  additionalInfo: z.string().max(8000),
  intendedMajor: z.string().max(200),
  homeState: z.string().max(2).optional(),
});

const patchSchema = z
  .object({
    profile: studentProfileSchema.optional(),
    savedCollegeIds: z.array(z.string().max(64)).max(80).optional(),
    disclaimerAccepted: z.boolean().optional(),
  })
  .strict();

function cookieOpts() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

async function createSessionResponse() {
  const session = await prisma.session.create({
    data: {
      profile: DEFAULT_PROFILE as unknown as Prisma.InputJsonValue,
      savedCollegeIds: [] as unknown as Prisma.InputJsonValue,
    },
  });
  const res = NextResponse.json({
    profile: normalizeProfile(session.profile),
    savedCollegeIds: parseSavedIds(session.savedCollegeIds),
    disclaimerAcceptedAt: session.disclaimerAcceptedAt?.toISOString() ?? null,
  });
  res.cookies.set(COOKIE, session.id, cookieOpts());
  return res;
}

export async function GET() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) return createSessionResponse();

  const session = await prisma.session.findUnique({ where: { id: sid } });
  if (!session) {
    const res = await createSessionResponse();
    return res;
  }

  return NextResponse.json({
    profile: normalizeProfile(session.profile),
    savedCollegeIds: parseSavedIds(session.savedCollegeIds),
    disclaimerAcceptedAt: session.disclaimerAcceptedAt?.toISOString() ?? null,
  });
}

export async function PATCH(req: Request) {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  let session = await prisma.session.findUnique({ where: { id: sid } });
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { profile: incoming, savedCollegeIds, disclaimerAccepted } = parsed.data;

  const currentProfile = normalizeProfile(session.profile);
  const nextProfile = incoming ? incoming : currentProfile;
  const nextIds = savedCollegeIds !== undefined ? savedCollegeIds : parseSavedIds(session.savedCollegeIds);

  const update: Prisma.SessionUpdateInput = {
    profile: nextProfile as unknown as Prisma.InputJsonValue,
    savedCollegeIds: nextIds as unknown as Prisma.InputJsonValue,
  };

  if (disclaimerAccepted === true) {
    update.disclaimerAcceptedAt = new Date();
  }

  session = await prisma.session.update({
    where: { id: session.id },
    data: update,
  });

  return NextResponse.json({
    profile: normalizeProfile(session.profile),
    savedCollegeIds: parseSavedIds(session.savedCollegeIds),
    disclaimerAcceptedAt: session.disclaimerAcceptedAt?.toISOString() ?? null,
  });
}
