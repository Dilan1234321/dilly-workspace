"use client";

export function CertificationsHero({ track }: { track: string }) {
  return (
    <header style={{ marginTop: 20, marginBottom: 14 }}>
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--green)",
          marginBottom: 8,
        }}
      >
        Build score · {track} track
      </p>
      <h1
        style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "var(--t1)",
          lineHeight: 1.2,
          marginBottom: 10,
        }}
      >
        Your fastest path to a stronger{" "}
        <span style={{ color: "var(--te-gold)" }}>Build</span> score.
      </h1>
      <p style={{ fontSize: 13, fontWeight: 400, color: "var(--t2)", lineHeight: 1.65, marginBottom: 0 }}>
        These aren&apos;t random certifications. Dilly picked each one because it fills a specific gap in your profile that recruiters are looking for right now.
      </p>
    </header>
  );
}
