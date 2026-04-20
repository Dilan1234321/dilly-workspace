import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  sendVerificationCode,
  verifyCode,
  patchProfile,
} from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { INDUSTRIES } from "@/lib/industries";

/**
 * Skill Lab sign-up — the fastest path to a *legitimate* Dilly profile.
 *
 * Three screens, zero resume upload:
 *   1. name + email + user type (.edu enables student path)
 *   2. 6-digit code verification (creates the Dilly user + profile row)
 *   3. one-shot profile form: role (or major), main goal
 *
 * Step 3 PATCHes /profile on the Dilly backend, which is the same endpoint
 * the mobile app uses, so the created profile is indistinguishable from
 * one started inside the Dilly app itself.
 */

type Step = "start" | "code" | "profile" | "done";

// ──────────────────────────────────────────────────────────────────────────
// Server actions
// ──────────────────────────────────────────────────────────────────────────

async function handleStart(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const userType = String(formData.get("user_type") ?? "general") as "student" | "general";
  const next = String(formData.get("next") ?? "/");
  if (!name || !email) {
    redirect(`/sign-up?error=missing&next=${encodeURIComponent(next)}`);
  }

  const res = await sendVerificationCode(email, userType);
  if (!res.ok) {
    redirect(`/sign-up?error=send&next=${encodeURIComponent(next)}`);
  }
  const q = new URLSearchParams({
    email,
    name,
    next,
    t: userType === "student" ? "s" : "g",
    step: "code",
  });
  redirect(`/sign-up?${q.toString()}`);
}

async function handleVerify(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "/");
  const ut = String(formData.get("t") ?? "g");

  if (!email || !code) {
    redirect(`/sign-up?step=code&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&t=${ut}&error=missing&next=${encodeURIComponent(next)}`);
  }

  const token = await verifyCode(email, code);
  if (!token) {
    redirect(`/sign-up?step=code&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&t=${ut}&error=invalid&next=${encodeURIComponent(next)}`);
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  // Hop to the profile step with the name pre-loaded — the backend already
  // has a profile row from verify-code, we just decorate it.
  const q = new URLSearchParams({ name, next, t: ut, step: "profile" });
  redirect(`/sign-up?${q.toString()}`);
}

async function handleProfile(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const major = String(formData.get("major") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const goal = String(formData.get("goal") ?? "").trim();
  const next = String(formData.get("next") ?? "/");
  const ut = String(formData.get("t") ?? "g");

  const payload: Record<string, unknown> = {};
  if (name) payload.name = name;
  if (ut === "s" && major) payload.major = major;
  if (ut !== "s" && role) payload.application_target = role;
  if (goal) payload.goals = [goal];

  // Fire-and-forget PATCH; even if it fails the account is usable.
  if (Object.keys(payload).length) {
    await patchProfile(payload).catch(() => null);
  }
  redirect(next);
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    step?: string;
    email?: string;
    name?: string;
    t?: string;
    error?: string;
    reason?: string;
  }>;
}) {
  const sp = await searchParams;
  const lang = await getLang();
  const next = sp.next ?? "/";
  const step: Step =
    sp.step === "code" ? "code" :
    sp.step === "profile" ? "profile" :
    "start";

  const emailPrefill = sp.email ?? "";
  const namePrefill = sp.name ?? "";
  const ut = sp.t ?? "g";

  const reasonCopy: Record<string, string> = {
    progress: "Save your streak, library, and watched history — free forever.",
    save: "Make an account so we can save that video to your library.",
  };
  const hint = sp.reason ? reasonCopy[sp.reason] : null;

  return (
    <div className="container-narrow pb-16 pt-14 sm:pt-20">
      <StepIndicator current={step} />

      {hint && step === "start" && (
        <div className="mt-6 rounded-lg border border-[color:var(--color-accent)]/30 bg-[color:var(--color-lavender)] p-3 text-sm text-[color:var(--color-accent)]">
          {hint}
        </div>
      )}

      {sp.error === "send" && <ErrorNote>{t(lang, "auth.err.send")}</ErrorNote>}
      {sp.error === "invalid" && <ErrorNote>{t(lang, "auth.err.invalid")}</ErrorNote>}
      {sp.error === "missing" && <ErrorNote>{t(lang, "auth.err.missing")}</ErrorNote>}

      {step === "start" && (
        <div className="mt-8">
          <div className="eyebrow">Create your Dilly account</div>
          <h1 className="editorial mt-3 text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            Free, for everyone. <span className="italic">20 seconds.</span>
          </h1>
          <p className="mt-4 text-[color:var(--color-muted)] sm:text-lg">
            One account across Skill Lab and the full Dilly app. We&apos;ll ask three
            quick things. No passwords, no resume, no spam.
          </p>

          <form action={handleStart} className="mt-8 space-y-5">
            <input type="hidden" name="next" value={next} />
            <Field
              name="name"
              type="text"
              label="Your name"
              placeholder="Alex Kim"
              autoComplete="name"
              defaultValue={namePrefill}
              required
            />
            <Field
              name="email"
              type="email"
              label="Email"
              placeholder="you@school.edu"
              autoComplete="email"
              defaultValue={emailPrefill}
              required
            />
            <fieldset className="card p-4">
              <legend className="eyebrow px-1">I&apos;m a…</legend>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <RadioTile name="user_type" value="student" defaultChecked={ut === "s"} label="College student" sub=".edu email required" />
                <RadioTile name="user_type" value="general" defaultChecked={ut !== "s"} label="Anyone else" sub="Any email" />
              </div>
            </fieldset>
            <button type="submit" className="btn btn-primary w-full py-3.5">
              Continue →
            </button>
            <p className="text-center text-xs text-[color:var(--color-dim)]">
              Already have a Dilly account?{" "}
              <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="underline hover:text-[color:var(--color-accent)]">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      )}

      {step === "code" && (
        <div className="mt-8">
          <div className="eyebrow">Step 2 of 3</div>
          <h1 className="editorial mt-3 text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            Check your email.
          </h1>
          <p className="mt-4 text-[color:var(--color-muted)] sm:text-lg">
            We sent a 6-digit code to <span className="font-semibold text-[color:var(--color-text)]">{emailPrefill}</span>. Expires in a few minutes.
          </p>

          <form action={handleVerify} className="mt-8 space-y-5">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="email" value={emailPrefill} />
            <input type="hidden" name="name" value={namePrefill} />
            <input type="hidden" name="t" value={ut} />
            <Field
              name="code"
              type="text"
              label="6-digit code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              required
            />
            <button type="submit" className="btn btn-primary w-full py-3.5">
              Verify & continue →
            </button>
            <p className="text-center text-xs text-[color:var(--color-dim)]">
              Didn&apos;t get it?{" "}
              <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="underline hover:text-[color:var(--color-accent)]">
                Start over
              </Link>
            </p>
          </form>
        </div>
      )}

      {step === "profile" && (
        <div className="mt-8">
          <div className="eyebrow">Step 3 of 3</div>
          <h1 className="editorial mt-3 text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            One last thing, {namePrefill.split(" ")[0] || "hey"}.
          </h1>
          <p className="mt-4 text-[color:var(--color-muted)] sm:text-lg">
            Helps us curate your library. Skip any field — you can edit later.
          </p>

          <form action={handleProfile} className="mt-8 space-y-5">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="name" value={namePrefill} />
            <input type="hidden" name="t" value={ut} />

            {ut === "s" ? (
              <Field
                name="major"
                type="text"
                label="What's your major?"
                placeholder="Data Science"
                autoComplete="off"
              />
            ) : (
              <label className="block">
                <span className="eyebrow block">What do you do?</span>
                <select
                  name="role"
                  defaultValue=""
                  className="mt-2 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3.5 py-3 text-base outline-none focus:border-[color:var(--color-accent)]"
                >
                  <option value="">— Pick your role —</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i.slug} value={i.name}>
                      {i.emoji} {i.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="eyebrow block">What&apos;s your goal?</span>
              <input
                name="goal"
                type="text"
                placeholder={
                  ut === "s"
                    ? "Land a data science internship"
                    : "Stay ahead of AI in my field"
                }
                className="mt-2 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3.5 py-3 text-base outline-none focus:border-[color:var(--color-accent)]"
              />
            </label>

            <div className="flex gap-3">
              <Link
                href={next}
                className="btn btn-ghost flex-1 py-3.5"
              >
                Skip
              </Link>
              <button type="submit" className="btn btn-primary flex-1 py-3.5">
                Finish →
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Small UI helpers
// ──────────────────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ["start", "code", "profile"];
  const currentIdx = steps.indexOf(current);
  return (
    <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-wider text-[color:var(--color-dim)]">
      {steps.map((s, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx;
        return (
          <span key={s} className="flex items-center gap-2">
            <span
              className={
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem] font-bold transition " +
                (active
                  ? "bg-[color:var(--color-accent)] text-white"
                  : done
                  ? "bg-[color:var(--color-accent)]/20 text-[color:var(--color-accent)]"
                  : "bg-[color:var(--color-border)] text-[color:var(--color-dim)]")
              }
            >
              {done ? "✓" : i + 1}
            </span>
            {i < steps.length - 1 && (
              <span
                className={
                  "h-px w-6 " +
                  (done ? "bg-[color:var(--color-accent)]" : "bg-[color:var(--color-border)]")
                }
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

function RadioTile({
  name,
  value,
  defaultChecked,
  label,
  sub,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  label: string;
  sub: string;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-[color:var(--color-border)] p-3 transition has-[:checked]:border-[color:var(--color-accent)] has-[:checked]:bg-[color:var(--color-lavender)]">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="accent-[color:var(--color-accent)]"
      />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[color:var(--color-text)]">{label}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{sub}</div>
      </div>
    </label>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-[color:var(--color-red)]/50 bg-[color:var(--color-red-bg)] p-3 text-sm text-[color:var(--color-red)]">
      {children}
    </div>
  );
}

function Field(props: {
  name: string;
  type: string;
  label: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text";
  pattern?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="eyebrow block">{props.label}</span>
      <input
        name={props.name}
        type={props.type}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        pattern={props.pattern}
        required={props.required}
        defaultValue={props.defaultValue}
        className="mt-2 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3.5 py-3 text-base text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]"
      />
    </label>
  );
}
