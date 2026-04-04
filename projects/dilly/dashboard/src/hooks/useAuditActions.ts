import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useToast } from "@/hooks/useToast";
import { stashAuditForReportHandoff } from "@/lib/dillyUtils";
import { hapticLight } from "@/lib/haptics";
import type { AuditV2 } from "@/types/dilly";

export function useAuditActions(latestAuditRef: React.MutableRefObject<AuditV2 | null>) {
  const router = useRouter();
  const { toast } = useToast();
  const {
    audit,
    savedAuditForCenter,
    viewingAudit,
    auditHistory,
  } = useAuditScore();

  /** Stash full audit when available so `/audit/[id]` paints immediately (no skeleton). */
  const navigateToAuditReport = useCallback(
    (auditId: string, explicitFullAudit?: AuditV2 | null) => {
      const idStr = String(auditId || "").trim();
      if (!idStr) return;
      let toStash: AuditV2 | undefined;
      if (explicitFullAudit && String(explicitFullAudit.id || "").trim() === idStr && explicitFullAudit.scores) {
        toStash = explicitFullAudit;
      } else {
        const candidates = [viewingAudit, latestAuditRef.current, audit, savedAuditForCenter];
        const found = candidates.find((a) => a && String(a.id || "").trim() === idStr && a.scores);
        toStash = found ?? undefined;
      }
      if (toStash) stashAuditForReportHandoff(toStash);
      router.push(`/audit/${encodeURIComponent(idStr)}`);
    },
    [viewingAudit, audit, savedAuditForCenter, router, latestAuditRef],
  );

  const replaceToAuditReport = useCallback(
    (auditId: string, explicitFullAudit?: AuditV2 | null) => {
      const idStr = String(auditId || "").trim();
      if (!idStr) return;
      let toStash: AuditV2 | undefined;
      if (explicitFullAudit && String(explicitFullAudit.id || "").trim() === idStr && explicitFullAudit.scores) {
        toStash = explicitFullAudit;
      } else {
        const candidates = [viewingAudit, latestAuditRef.current, audit, savedAuditForCenter];
        const found = candidates.find((a) => a && String(a.id || "").trim() === idStr && a.scores);
        toStash = found ?? undefined;
      }
      if (toStash) stashAuditForReportHandoff(toStash);
      router.replace(`/audit/${encodeURIComponent(idStr)}`);
    },
    [viewingAudit, audit, savedAuditForCenter, router, latestAuditRef],
  );

  /** Full audit report lives at `/audit/[id]` — use everywhere we used to open the inline report. */
  const goToStandaloneFullAuditReport = useCallback(
    (explicitId?: string | null) => {
      const id =
        explicitId?.trim() ||
        (() => {
          const da = viewingAudit ?? latestAuditRef.current ?? audit ?? savedAuditForCenter;
          return (da?.id || auditHistory[0]?.id || "").trim();
        })();
      if (!id) {
        toast("No saved report on file yet.", "error");
        return;
      }
      hapticLight();
      navigateToAuditReport(id);
    },
    [viewingAudit, audit, savedAuditForCenter, auditHistory, navigateToAuditReport, toast, latestAuditRef],
  );

  return {
    navigateToAuditReport,
    replaceToAuditReport,
    goToStandaloneFullAuditReport,
  };
}
