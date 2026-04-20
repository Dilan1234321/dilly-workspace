import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sendVerificationCode, verifyCode } from "@/lib/api";

// Dilly auth = email + 6-digit code. Same flow whether you're new or returning;
// the backend creates the profile on first verification. We keep /sign-in and
// /sign-up as two routes (for friendlier marketing links) but they render the
// same two-step form with different copy.

async function handleSendCode(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const userType = String(formData.get("user_type") ?? "general") as "student" | "general";
  const next = String(formData.get("next") ?? "/");
  if (!email) redirect(`/sign-in?error=missing&next=${encodeURIComponent(next)}`);

  const res = await sendVerificationCode(email, userType);
  if (!res.ok) {
    redirect(`/sign-in?error=send&next=${encodeURIComponent(next)}`);
  }
  const q = new URLSearchParams({ email, next });
  if (userType === "student") q.set("t", "s");
  redirect(`/sign-in?${q.toString()}&step=code`);
}

async function handleVerifyCode(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "/");
  if (!email || !code) {
    redirect(`/sign-in?step=code&email=${encodeURIComponent(email)}&error=missing&next=${encodeURIComponent(next)}`);
  }

  const token = await verifyCode(email, code);
  if (!token) {
    redirect(`/sign-in?step=code&email=${encodeURIComponent(email)}&error=invalid&next=${encodeURIComponent(next)}`);
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next);
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; step?: string; email?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next ?? "/";
  const step = sp.step === "code" ? "code" : "email";
  const emailPrefill = sp.email ?? "";
  const isStudent = sp.t === "s";

  return (
    <div className="mx-auto max-w-md pt-10">
      <h1 className="text-2xl font-semibold">
        {step === "email" ? "Sign in or create an account" : "Check your email"}
      </h1>
      <p className="mt-2 text-sm text-[color:var(--color-muted)]">
        {step === "email"
          ? "One login works across Skill Lab and the full Dilly app. No password — we email you a code."
          : `We sent a 6-digit code to ${emailPrefill}. It expires in a few minutes.`}
      </p>

      {sp.error === "send" && (
        <ErrorNote>We couldn&apos;t send the email. Try again in a minute.</ErrorNote>
      )}
      {sp.error === "invalid" && (
        <ErrorNote>That code didn&apos;t work. Double-check or request a new one.</ErrorNote>
      )}
      {sp.error === "missing" && (
        <ErrorNote>Fill in all the fields.</ErrorNote>
      )}

      {step === "email" ? (
        <form action={handleSendCode} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field name="email" type="email" label="Email" autoComplete="email" required defaultValue={emailPrefill} />
          <fieldset className="rounded-lg border border-[color:var(--color-border)] p-3">
            <legend className="px-1 text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
              I&apos;m a…
            </legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="user_type" value="student" defaultChecked={isStudent} />
                College student (.edu email)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="user_type" value="general" defaultChecked={!isStudent} />
                Anyone else
              </label>
            </div>
          </fieldset>
          <button type="submit" className="btn btn-primary w-full">Email me a code</button>
        </form>
      ) : (
        <form action={handleVerifyCode} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={emailPrefill} />
          <Field
            name="code"
            type="text"
            label="6-digit code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]*"
            required
          />
          <button type="submit" className="btn btn-primary w-full">Continue</button>
          <div className="text-center text-xs text-[color:var(--color-muted)]">
            Didn&apos;t get it?{" "}
            <Link
              href={`/sign-in?next=${encodeURIComponent(next)}`}
              className="underline hover:text-white"
            >
              Start over
            </Link>
            .
          </div>
        </form>
      )}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-200">
      {children}
    </div>
  );
}

function Field(props: {
  name: string;
  type: string;
  label: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text";
  pattern?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
        {props.label}
      </span>
      <input
        name={props.name}
        type={props.type}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        pattern={props.pattern}
        required={props.required}
        defaultValue={props.defaultValue}
        className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)]"
      />
    </label>
  );
}
