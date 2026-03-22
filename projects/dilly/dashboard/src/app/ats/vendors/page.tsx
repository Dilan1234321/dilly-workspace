"use client";

import { ATSColorHeader, ATSEmptyState, ATSStagger, ATSVendorCard, DillyStrip } from "@/components/ats";
import { useATSResult } from "@/hooks/useATSResult";

export default function ATSVendorsPage() {
  const { atsResult } = useATSResult();
  if (!atsResult) {
    return (
      <ATSStagger>
        <ATSColorHeader
          eyebrow="Vendors"
          title="Vendor Compatibility"
          subtitle="See how your resume is likely to parse across major ATS vendors."
        />
        <ATSEmptyState title="No vendor simulation yet" />
      </ATSStagger>
    );
  }
  return (
    <ATSStagger>
      <ATSColorHeader
        eyebrow="Vendors"
        title="Vendor Compatibility"
        subtitle="See how your resume is likely to parse across major ATS vendors."
      />
      {atsResult.vendors.map((vendor) => (
        <ATSVendorCard
          key={vendor.name}
          name={vendor.name}
          score={vendor.score}
          status={vendor.status}
          companies={vendor.companies}
        />
      ))}
      <DillyStrip text={atsResult.dilly_vendor_commentary} />
    </ATSStagger>
  );
}

