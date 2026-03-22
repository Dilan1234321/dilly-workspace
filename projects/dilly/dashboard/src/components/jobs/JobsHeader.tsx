"use client";

type Props = {
  totalMatches: number;
  updatedLabel?: string | null;
  updatedOpacity?: number;
};

export function JobsHeader({ totalMatches, updatedLabel, updatedOpacity = 1 }: Props) {
  return (
    <header className="flex-shrink-0" style={{ padding: "44px 20px 10px" }}>
      <p
        className="uppercase font-bold mb-1"
        style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--t3)", marginBottom: 4, fontWeight: 700 }}
      >
        {totalMatches} matches for your profile
      </p>
      <h1 className="font-bold" style={{ fontSize: 18, fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.02em" }}>
        Your jobs.
      </h1>
      {updatedLabel ? (
        <p className="mt-1 text-[9px] transition-opacity duration-500" style={{ color: "var(--t3)", opacity: updatedOpacity }}>
          {updatedLabel}
        </p>
      ) : null}
    </header>
  );
}
