import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { stackPreviewImages } from "../clientStacking";
import type { ClientCompositeStatus, QueueItem } from "../types";
import {
  estimatePreviewAlignments,
  type JobSummary,
  type ProcessingWarning,
  type PreviewUploadSummary,
} from "../uploadApi";

type UseCompositeJobOptions = {
  activeId: string | null;
  canRunJob: boolean;
  items: QueueItem[];
  uploadPreviews: () => Promise<PreviewUploadSummary | null>;
  uploadSummary: PreviewUploadSummary | null;
  uploadedItemIdsRef: RefObject<string[]>;
};

export function useCompositeJob({
  activeId,
  canRunJob,
  items,
  uploadPreviews,
  uploadSummary,
  uploadedItemIdsRef,
}: UseCompositeJobOptions) {
  const [job, setJob] = useState<JobSummary | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [clientCompositeStatus, setClientCompositeStatus] =
    useState<ClientCompositeStatus>("idle");
  const [clientWarnings, setClientWarnings] = useState<ProcessingWarning[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
    };
  }, []);

  const clearJobState = useCallback((preserveStarting = false) => {
    setJob(null);
    setJobError(null);
    if (!preserveStarting) {
      setClientCompositeStatus("idle");
    }
    setClientWarnings([]);
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResultUrl(null);
  }, []);

  const baseIndexForJob = useCallback(() => {
    const activeIndex = uploadedItemIdsRef.current.findIndex((id) => id === activeId);
    return activeIndex >= 0 ? activeIndex : 0;
  }, [activeId, uploadedItemIdsRef]);

  const isJobBusy =
    clientCompositeStatus === "uploading" ||
    clientCompositeStatus === "estimating" ||
    clientCompositeStatus === "stacking";

  const runComposite = useCallback(async () => {
    if (isJobBusy || !canRunJob) {
      return;
    }

    setJobError(null);
    setJob(null);
    setClientWarnings([]);
    setClientCompositeStatus(uploadSummary ? "estimating" : "uploading");

    try {
      const summary = uploadSummary ?? (await uploadPreviews());
      if (!summary) {
        setClientCompositeStatus("idle");
        return;
      }

      const baseImageIndex = baseIndexForJob();
      setClientCompositeStatus("estimating");
      const alignment = await estimatePreviewAlignments(summary.sessionId, baseImageIndex);
      setClientWarnings(alignment.warnings ?? []);

      setClientCompositeStatus("stacking");
      const resultBlob = await stackPreviewImages({
        items,
        itemIds: uploadedItemIdsRef.current,
        transforms: alignment.transforms,
        baseImageIndex,
      });

      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
      const nextResultUrl = URL.createObjectURL(resultBlob);
      resultUrlRef.current = nextResultUrl;
      setResultUrl(nextResultUrl);
      setClientCompositeStatus("completed");
    } catch (error) {
      setClientCompositeStatus("failed");
      setJobError(error instanceof Error ? error.message : "Client-side composite failed");
    }
  }, [
    baseIndexForJob,
    canRunJob,
    isJobBusy,
    items,
    uploadPreviews,
    uploadSummary,
    uploadedItemIdsRef,
  ]);

  return {
    clearJobState,
    clientCompositeStatus,
    clientWarnings,
    isJobBusy,
    job,
    jobError,
    resultUrl,
    runComposite,
  };
}
