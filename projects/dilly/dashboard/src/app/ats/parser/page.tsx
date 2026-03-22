"use client";

import { ATSColorHeader, ATSContactRow, ATSEmptyState, ATSStagger, DillyStrip } from "@/components/ats";
import { useATSResult } from "@/hooks/useATSResult";

export default function ATSParserPage() {
  const { atsResult } = useATSResult();
  if (!atsResult) {
    return (
      <ATSStagger>
        <ATSColorHeader
          eyebrow="Parser"
          title="Parser View"
          subtitle="Review exactly what ATS systems extracted from your resume."
        />
        <ATSEmptyState title="No parser data yet" />
      </ATSStagger>
    );
  }
  return (
    <ATSStagger>
      <ATSColorHeader
        eyebrow="Parser"
        title="Parser View"
        subtitle="Review exactly what ATS systems extracted from your resume."
      />
      <section className="rounded-xl border p-3" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
        <h3 className="text-[12px] font-semibold mb-1" style={{ color: "var(--t1)" }}>Contact & Identity</h3>
        <ATSContactRow label="Name" value={atsResult.contact.name} />
        <ATSContactRow label="Email" value={atsResult.contact.email} />
        <ATSContactRow label="Phone" value={atsResult.contact.phone} />
        <ATSContactRow label="LinkedIn" value={atsResult.contact.linkedin} />
        <ATSContactRow label="Location" value={atsResult.contact.location} />
      </section>
      <section className="rounded-xl border p-3" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
        <h3 className="text-[12px] font-semibold mb-1" style={{ color: "var(--t1)" }}>Education</h3>
        <ATSContactRow label="University" value={atsResult.contact.university} />
        <ATSContactRow label="Major" value={atsResult.contact.major} />
        <ATSContactRow label="GPA" value={atsResult.contact.gpa} />
        <ATSContactRow label="Graduation" value={atsResult.contact.graduation} />
      </section>
      <section className="rounded-xl border p-3 space-y-2" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
        <h3 className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>Experience</h3>
        {atsResult.experience.length ? atsResult.experience.map((exp, idx) => (
          <article key={`${exp.company}-${idx}`} className="rounded-lg p-2.5" style={{ background: "var(--s3)" }}>
            <p className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>{exp.company}</p>
            <p className="text-[11px]" style={{ color: "var(--t2)" }}>{exp.role || "Role missing"}</p>
            <p className="text-[10px]" style={{ color: "var(--t3)" }}>{exp.start}{exp.end ? ` - ${exp.end}` : ""}</p>
            <p className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{exp.bullet_count} bullets parsed</p>
          </article>
        )) : (
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>No experience entries parsed yet.</p>
        )}
      </section>
      <DillyStrip text={atsResult.dilly_score_commentary} />
    </ATSStagger>
  );
}

