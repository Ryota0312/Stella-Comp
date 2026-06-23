"use client";

import { useCallback, useMemo, useRef } from "react";
import { HeroMetrics } from "./components/HeroMetrics";
import { JobStatusPanel } from "./components/JobStatusPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { PreviewSettingsPanel } from "./components/PreviewSettingsPanel";
import { ResultPanel } from "./components/ResultPanel";
import { UploadQueuePanel } from "./components/UploadQueuePanel";
import { useCompositeJob } from "./hooks/useCompositeJob";
import { usePreviewUpload } from "./hooks/usePreviewUpload";
import { useUploadQueue } from "./hooks/useUploadQueue";
import type { ResultRow, TimelineItem } from "./types";
import { clientCompositeStatusText } from "./utils";

export function UploadWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resetUploadStateRef = useRef<() => void>(() => undefined);
  const clearJobStateRef = useRef<(preserveStarting?: boolean) => void>(() => undefined);

  const {
    activeId,
    activeItem,
    clearQueue,
    compressionRatio,
    enqueueFiles,
    isDragging,
    items,
    pendingRawCount,
    previewBytes,
    readyCount,
    setActiveId,
    setIsDragging,
    setItems,
    sourceBytes,
  } = useUploadQueue({
    onQueueChanged: () => {
      resetUploadStateRef.current();
      clearJobStateRef.current(false);
    },
    onQueueCleared: () => {
      resetUploadStateRef.current();
      clearJobStateRef.current(false);
    },
  });

  const {
    resetUploadState,
    uploadError,
    uploadPreviews,
    uploadSummary,
    uploadableCount,
    uploadedItemIdsRef,
  } = usePreviewUpload({ items, setItems });

  resetUploadStateRef.current = resetUploadState;

  const canRunJob = uploadableCount > 0 || Boolean(uploadSummary?.uploadedCount);

  const uploadPreviewsAndClearJob = useCallback(() => {
    clearJobStateRef.current(true);
    return uploadPreviews();
  }, [uploadPreviews]);

  const {
    clearJobState,
    clientCompositeStatus,
    clientWarnings,
    isJobBusy,
    job,
    jobError,
    resultUrl,
    runComposite,
  } = useCompositeJob({
    activeId,
    canRunJob,
    items,
    uploadPreviews: uploadPreviewsAndClearJob,
    uploadSummary,
    uploadedItemIdsRef,
  });

  clearJobStateRef.current = clearJobState;

  const jobTimeline = useMemo<TimelineItem[]>(
    () => [
      {
        label: "Selected frames",
        value: `${items.length}`,
        tone: items.length > 0 ? "active" : "muted",
      },
      {
        label: "Preview generation",
        value: `${readyCount} ready`,
        tone: readyCount > 0 ? "active" : "muted",
      },
      {
        label: "RAW extraction",
        value: pendingRawCount > 0 ? `${pendingRawCount} pending` : "No pending RAW",
        tone: pendingRawCount > 0 ? "warn" : "muted",
      },
      {
        label: "Preview upload",
        value: uploadSummary ? `${uploadSummary.uploadedCount} uploaded` : "Not uploaded",
        tone: uploadSummary ? "active" : "muted",
      },
      {
        label: "Client stack",
        value: clientCompositeStatusText(clientCompositeStatus),
        tone:
          clientCompositeStatus === "failed"
            ? "warn"
            : clientCompositeStatus === "idle"
              ? "muted"
              : "active",
      },
    ],
    [clientCompositeStatus, items.length, pendingRawCount, readyCount, uploadSummary],
  );

  const resultRows = useMemo<ResultRow[]>(
    () => [
      {
        label: "Result PNG",
        value: clientCompositeStatus === "completed" ? "Generated in browser" : "Not generated",
      },
      { label: "Stack status", value: clientCompositeStatusText(clientCompositeStatus) },
      { label: "Warnings", value: `${clientWarnings.length}` },
    ],
    [clientCompositeStatus, clientWarnings.length],
  );

  function handleSelectFrames() {
    inputRef.current?.click();
  }

  return (
    <main className="page-shell">
      <HeroMetrics
        compressionRatio={compressionRatio}
        frameCount={items.length}
        previewBytes={previewBytes}
      />

      <section className="workspace-grid">
        <UploadQueuePanel
          activeItem={activeItem}
          clearQueue={clearQueue}
          enqueueFiles={enqueueFiles}
          inputRef={inputRef}
          isDragging={isDragging}
          items={items}
          onSelectFrames={handleSelectFrames}
          setActiveId={setActiveId}
          setIsDragging={setIsDragging}
        />

        <PreviewSettingsPanel activeItem={activeItem} items={items} setActiveId={setActiveId} />

        <PreviewPanel
          activeItem={activeItem}
          uploadableCount={uploadableCount}
          uploadPreviews={uploadPreviewsAndClearJob}
        />

        <JobStatusPanel
          canRunJob={canRunJob}
          compressionRatio={compressionRatio}
          clientCompositeStatus={clientCompositeStatus}
          clientWarnings={clientWarnings}
          isJobBusy={isJobBusy}
          job={job}
          jobError={jobError}
          previewBytes={previewBytes}
          runComposite={runComposite}
          sourceBytes={sourceBytes}
          timeline={jobTimeline}
          uploadError={uploadError}
          uploadSummary={uploadSummary}
        />

        <ResultPanel
          clientCompositeStatus={clientCompositeStatus}
          resultRows={resultRows}
          resultUrl={resultUrl}
        />
      </section>
    </main>
  );
}
