import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { estimatePreviewAlignments } from "../api/uploadApi";
import type {
  ImageTransform,
  JobSummary,
  PreviewAlignmentSummary,
  ProcessingWarning,
  PreviewUploadSummary,
} from "../api/uploadApi";
import type { UploadCopy } from "../model/i18n";
import type {
  ClientCompositeStatus,
  CompositeProgress,
  CompositeOutput,
  AlignmentMethod,
  QueueItem,
  RawCompositeStatus,
  SourceExportFormat,
  TransformModel,
} from "../model/types";
import { stackPreviewImages } from "../processing/clientStacking";
import { stackSourceImages } from "../processing/rawStacking";

type UseCompositeJobOptions = {
  activeId: string | null;
  canRunJob: boolean;
  copy: UploadCopy;
  alignmentMethod: AlignmentMethod;
  transformModel: TransformModel;
  items: QueueItem[];
  sourceExportFormat: SourceExportFormat;
  uploadPreviews: () => Promise<PreviewUploadSummary | null>;
  uploadSummary: PreviewUploadSummary | null;
  uploadedItemIdsRef: RefObject<string[]>;
};

export function useCompositeJob({
  activeId,
  alignmentMethod,
  transformModel,
  canRunJob,
  copy,
  items,
  sourceExportFormat,
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
  const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null);
  const [resultReferencePreviewUrl, setResultReferencePreviewUrl] = useState<string | null>(null);
  const [resultDownloadUrl, setResultDownloadUrl] = useState<string | null>(null);
  const [resultDownloadFileName, setResultDownloadFileName] = useState<string | null>(null);
  const [resultLabel, setResultLabel] = useState<CompositeOutput["label"] | null>(null);
  const [lastAlignment, setLastAlignment] = useState<PreviewAlignmentSummary | null>(null);
  const [excludedImageIndexes, setExcludedImageIndexes] = useState<number[]>([]);
  const resultPreviewUrlRef = useRef<string | null>(null);
  const resultReferencePreviewUrlRef = useRef<string | null>(null);
  const resultDownloadUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (resultPreviewUrlRef.current) {
        URL.revokeObjectURL(resultPreviewUrlRef.current);
      }
      if (resultReferencePreviewUrlRef.current) {
        URL.revokeObjectURL(resultReferencePreviewUrlRef.current);
      }
      if (resultDownloadUrlRef.current) {
        URL.revokeObjectURL(resultDownloadUrlRef.current);
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
    setExcludedImageIndexes([]);
    if (resultPreviewUrlRef.current) {
      URL.revokeObjectURL(resultPreviewUrlRef.current);
      resultPreviewUrlRef.current = null;
    }
    if (resultReferencePreviewUrlRef.current) {
      URL.revokeObjectURL(resultReferencePreviewUrlRef.current);
      resultReferencePreviewUrlRef.current = null;
    }
    if (resultDownloadUrlRef.current) {
      URL.revokeObjectURL(resultDownloadUrlRef.current);
      resultDownloadUrlRef.current = null;
    }
    setResultPreviewUrl(null);
    setResultReferencePreviewUrl(null);
    setResultDownloadUrl(null);
    setResultDownloadFileName(null);
    setResultLabel(null);
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

  const publishResult = useCallback((output: CompositeOutput) => {
    if (resultPreviewUrlRef.current) {
      URL.revokeObjectURL(resultPreviewUrlRef.current);
    }
    if (resultReferencePreviewUrlRef.current) {
      URL.revokeObjectURL(resultReferencePreviewUrlRef.current);
    }
    if (resultDownloadUrlRef.current) {
      URL.revokeObjectURL(resultDownloadUrlRef.current);
    }
    const nextPreviewUrl = URL.createObjectURL(output.previewBlob);
    const nextReferencePreviewUrl = output.referencePreviewBlob
      ? URL.createObjectURL(output.referencePreviewBlob)
      : null;
    const nextDownloadUrl = URL.createObjectURL(output.downloadBlob);
    resultPreviewUrlRef.current = nextPreviewUrl;
    resultReferencePreviewUrlRef.current = nextReferencePreviewUrl;
    resultDownloadUrlRef.current = nextDownloadUrl;
    setResultPreviewUrl(nextPreviewUrl);
    setResultReferencePreviewUrl(nextReferencePreviewUrl);
    setResultDownloadUrl(nextDownloadUrl);
    setResultDownloadFileName(output.downloadFileName);
    setResultLabel(output.label);
  }, []);

  const estimateAlignment = useCallback(
    async (summary: PreviewUploadSummary, baseImageIndex: number) => {
      const alignment = await estimatePreviewAlignments(
        summary.sessionId,
        baseImageIndex,
        alignmentMethod,
        transformModel,
      );
      setLastAlignment(alignment);
      setClientWarnings(alignment.warnings ?? []);
      setExcludedImageIndexes(failedTransformIndexes(alignment.transforms, baseImageIndex));
      return alignment;
    },
    [alignmentMethod, transformModel],
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
      const result = await stackPreviewImages({
        items,
        itemIds: uploadedItemIdsRef.current,
        excludedImageIndexes: new Set(failedTransformIndexes(alignment.transforms, baseImageIndex)),
        transforms: alignment.transforms,
        baseImageIndex,
      });

      publishResult(result);
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
      if (
        lastAlignment?.sessionId === summary.sessionId &&
        lastAlignment.alignmentMethod === alignmentMethod &&
        lastAlignment.transformModel === transformModel
      ) {
        transforms = lastAlignment.transforms;
        setExcludedImageIndexes(failedTransformIndexes(transforms, baseImageIndex));
      } else {
        setClientCompositeStatus("estimating");
        const alignment = await estimateAlignment(summary, baseImageIndex);
        transforms = alignment.transforms;
        setClientCompositeStatus("idle");
      }
      const excludedIndexes = failedTransformIndexes(transforms, baseImageIndex);

      setRawCompositeStatus("developing");
      const result = await stackSourceImages({
        exportFormat: sourceExportFormat,
        excludedImageIndexes: new Set(excludedIndexes),
        items,
        itemIds: uploadedItemIdsRef.current,
        onProgress: setRawCompositeProgress,
        transforms,
        baseImageIndex,
      });

      publishResult(result);
      setRawCompositeStatus("completed");
      setRawCompositeProgress(null);
    } catch (error) {
      setRawCompositeStatus("failed");
      setRawCompositeProgress(null);
      setJobError(error instanceof Error ? error.message : copy.queueNotes.rawCompositeFailed);
    }
  }, [
    baseIndexForJob,
    alignmentMethod,
    transformModel,
    canRunJob,
    copy,
    estimateAlignment,
    isJobBusy,
    items,
    lastAlignment,
    publishResult,
    sourceExportFormat,
    uploadPreviews,
    uploadSummary,
    uploadedItemIdsRef,
  ]);

  return {
    clearJobState,
    clientCompositeStatus,
    clientWarnings,
    excludedFrameCount: excludedImageIndexes.length,
    isJobBusy,
    job,
    jobError,
    rawCompositeProgress,
    rawCompositeStatus,
    resultDownloadFileName,
    resultDownloadUrl,
    resultLabel,
    resultReferencePreviewUrl,
    resultPreviewUrl,
    runComposite,
    runRawComposite,
    usedFrameCount: Math.max(items.length - excludedImageIndexes.length, 0),
  };
}

function failedTransformIndexes(transforms: ImageTransform[], baseImageIndex: number) {
  return transforms
    .filter((transform) => !transform.estimated && transform.imageIndex !== baseImageIndex)
    .map((transform) => transform.imageIndex);
}
