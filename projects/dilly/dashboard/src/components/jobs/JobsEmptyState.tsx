"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DillyAvatar } from "@/components/ats/DillyAvatar";
import { hapticLight } from "@/lib/haptics";

type Variant = "no_audit" | "filter_empty" | "all_applied" | "no_location" | "no_matches";

type Props = { variant: Variant };

export function JobsEmptyState({ variant }: Props) {
  const router = useRouter();

  const wrap = (children: ReactNode) => (
    <div
      className="flex flex-col items-center justify-center text-center flex-1 px-8 py-10"
      style={{ padding: "0 32px", flex: 1 }}
    >
      {children}
    </div>
  );

  if (variant === "no_audit") {
    return wrap(
      <>
        <div className="mb-3.5">
          <DillyAvatar size={40} />
        </div>
        <p className="mb-4" style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6, marginBottom: 16 }}>
          Upload your resume and I&apos;ll find the jobs you&apos;re actually competitive for.
        </p>
        <Link
          href="/onboarding/upload"
          onClick={() => hapticLight()}
          className="font-bold border-0 inline-block rounded-xl px-6 py-3"
          style={{ background: "var(--gold)", borderRadius: 12, padding: "12px 24px", fontSize: 13, fontWeight: 700, color: "#1a1400" }}
        >
          Upload resume →
        </Link>
      </>,
    );
  }

  if (variant === "no_location") {
    return wrap(
      <>
        <p className="mb-1.5" style={{ fontSize: 13, color: "var(--t2)" }}>
          Set where you want to work to see matched roles.
        </p>
        <p className="mb-3.5" style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14 }}>
          Add cities or choose domestic / international in your profile.
        </p>
        <button
          type="button"
          onClick={() => {
            hapticLight();
            router.push("/?tab=resources");
          }}
          className="text-[11px] font-semibold border-0 bg-transparent"
          style={{ color: "var(--blue)", fontWeight: 600 }}
        >
          Open Get Hired →
        </button>
      </>,
    );
  }

  if (variant === "no_matches") {
    return wrap(
      <>
        <div className="mb-3.5">
          <DillyAvatar size={40} />
        </div>
        <p className="mb-1.5" style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>
          No roles in our feed match your profile yet — that&apos;s normal early on, or when filters are tight.
        </p>
        <p className="mb-3.5" style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14, lineHeight: 1.5 }}>
          Broaden where you&apos;ll work, run a fresh audit on your resume, or ask Dilly to expand your search.
        </p>
        <div className="flex flex-col gap-2 w-full max-w-[280px]">
          <Link
            href="/voice?context=expand_job_search"
            onClick={() => hapticLight()}
            className="font-bold border-0 inline-block rounded-xl px-6 py-3 text-center"
            style={{ background: "var(--gold)", borderRadius: 12, padding: "12px 24px", fontSize: 13, fontWeight: 700, color: "#1a1400" }}
          >
            Expand search with Dilly →
          </Link>
          <button
            type="button"
            onClick={() => {
              hapticLight();
              router.push("/settings");
            }}
            className="text-[11px] font-semibold border-0 bg-transparent py-2"
            style={{ color: "var(--blue)", fontWeight: 600 }}
          >
            Location & profile →
          </button>
        </div>
      </>,
    );
  }

  if (variant === "filter_empty") {
    return wrap(
      <>
        <p className="mb-1.5" style={{ fontSize: 13, color: "var(--t2)" }}>
          No jobs match that filter right now.
        </p>
        <p className="mb-3.5" style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14 }}>
          Try &apos;All&apos; or run a new audit to update your profile.
        </p>
        <Link
          href="/audit/new"
          onClick={() => hapticLight()}
          className="text-[11px] font-semibold"
          style={{ color: "var(--blue)", fontWeight: 600 }}
        >
          Run new audit →
        </Link>
      </>,
    );
  }

  /* all_applied */
  return wrap(
    <>
      <div className="mb-3.5">
        <DillyAvatar size={40} />
      </div>
      <p className="mb-1.5" style={{ fontSize: 13, color: "var(--t2)" }}>
        You&apos;ve applied to everything here.
      </p>
      <p className="mb-3.5" style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14 }}>
        Let Dilly find more roles for you.
      </p>
      <Link
        href="/voice?context=expand_job_search"
        onClick={() => hapticLight()}
        className="font-bold border-0 inline-block rounded-xl px-6 py-3"
        style={{ background: "var(--gold)", borderRadius: 12, padding: "12px 24px", fontSize: 13, fontWeight: 700, color: "#1a1400" }}
      >
        Expand my search →
      </Link>
    </>,
  );
}
