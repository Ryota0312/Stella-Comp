import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { stackPreviewImages } from "../clientStacking";
import type { UploadCopy } from "../i18n";
import { stackSourceImages } from "../rawStacking";
import type {
  ClientCompositeStatus,
  CompositeProgress,
  QueueItem,
  RawCompositeStatus,
} from "../types";
import {
  estimatePreviewAlignments,
  type ImageTransform,
  type JobSummary,
  type PreviewAlignmentSummary,
  type ProcessingWarning,
  type PreviewUploadSummary,
} from "../uploadApi";

type UseCompositeJobOptions = {
  activeId: string | null;
  canRunJob: boolean;
  copy: UploadCopy;
  items: QueueItem[];
  uploadPreviews: () => Promise<PreviewUploadSummary | null>;
  uploadSummary: PreviewUploadSummary | null;
  uploadedItemIdsRef: RefObject<string[]>;
};

export function useCompositeJob({
  activeId,
  canRunJob,
  copy,
  items,
  uploadPreviews,
  uploadSummary,
  uploadedItemIdsRef,
}: UseCompositeJobOptions) {
  const [job, setJob] = useState<JobSummary | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [clientCompositeStatus, setClientCompositeStatus] =
    useState<ClientCompositeStatus>("idle");
  const [rawCompositeStatus, setRawCompositeStatus] = useState<RawCompositeStatus>("idle");
  const [clientWarnings, setClientWarnings] = useState<ProcessingWarning[]>([]);
  const [rawCompositeProgress, setRawCompositeProgress] = useState<CompositeProgress | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [lastAlignment, setLastAlignment] = useState<PreviewAlignmentSummary | null>(null);
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
      setRawCompositeStatus("idle");
    }
    setRawCompositeProgress(null);
    setClientWarnings([]);
    setLastAlignment(null);
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
    clientCompositeStatus === "stacking" ||
    rawCompositeStatus === "developing" ||
    rawCompositeStatus === "stacking";

  const publishResult = useCallback((blob: Blob) => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
    }
    const nextResultUrl = URL.createObjectURL(blob);
    resultUrlRef.current = nextResultUrl;
    setResultUrl(nextResultUrl);
  }, []);

  const estimateAlignment = useCallback(
    async (summary: PreviewUploadSummary, baseImageIndex: number) => {
      const alignment = await estimatePreviewAlignments(summary.sessionId, baseImageIndex);
      setLastAlignment(alignment);
      setClientWarnings(alignment.warnings ?? []);
      return alignment;
    },
    [],
  );

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
      const alignment = await estimateAlignment(summary, baseImageIndex);

      setClientCompositeStatus("stacking");
      const resultBlob = await stackPreviewImages({
        items,
        itemIds: uploadedItemIdsRef.current,
        transforms: alignment.transforms,
        baseImageIndex,
      });

      publishResult(resultBlob);
      setClientCompositeStatus("completed");
    } catch (error) {
      setClientCompositeStatus("failed");
      setJobError(error instanceof Error ? error.message : copy.queueNotes.clientCompositeFailed);
    }
  }, [
    baseIndexForJob,
    canRunJob,
    copy,
    estimateAlignment,
    isJobBusy,
    items,
    publishResult,
    uploadPreviews,
    uploadSummary,
    uploadedItemIdsRef,
  ]);

  const runRawComposite = useCallback(async () => {
    if (isJobBusy || !canRunJob) {
      return;
    }

    setJobError(null);
    setJob(null);
    setRawCompositeStatus(uploadSummary || lastAlignment ? "developing" : "stacking");
    setRawCompositeProgress(null);

    try {
      const summary = uploadSummary ?? (await uploadPreviews());
      if (!summary) {
        setRawCompositeStatus("idle");
        return;
      }

      const baseImageIndex = baseIndexForJob();
      let transforms: ImageTransform[];
      if (lastAlignment?.sessionId === summary.sessionId) {
        transforms = lastAlignment.transforms;
      } else {
        setClientCompositeStatus("estimating");
        const alignment = await estimateAlignment(summary, baseImageIndex);
        transforms = alignment.transforms;
        setClientCompositeStatus("idle");
      }

      setRawCompositeStatus("developing");
      const resultBlob = await stackSourceImages({
        items,
        itemIds: uploadedItemIdsRef.current,
        onProgress: setRawCompositeProgress,
        transforms,
        baseImageIndex,
      });

      publishResult(resultBlob);
      setRawCompositeStatus("completed");
      setRawCompositeProgress(null);
    } catch (error) {
      setRawCompositeStatus("failed");
      setRawCompositeProgress(null);
      setJobError(error instanceof Error ? error.message : copy.queueNotes.rawCompositeFailed);
    }
  }, [
    baseIndexForJob,
    canRunJob,
    copy,
    estimateAlignment,
    isJobBusy,
    items,
    lastAlignment,
    publishResult,
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
    rawCompositeProgress,
    rawCompositeStatus,
    resultUrl,
    runComposite,
    runRawComposite,
  };
}
