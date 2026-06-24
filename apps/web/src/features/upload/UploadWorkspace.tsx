"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeroMetrics } from "./components/HeroMetrics";
import { JobStatusPanel } from "./components/JobStatusPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { PreviewSettingsPanel } from "./components/PreviewSettingsPanel";
import { ResultPanel } from "./components/ResultPanel";
import { UploadQueuePanel } from "./components/UploadQueuePanel";
import { useCompositeJob } from "./hooks/useCompositeJob";
import { usePreviewUpload } from "./hooks/usePreviewUpload";
import { useUploadQueue } from "./hooks/useUploadQueue";
import {
  clientCompositeStatusText,
  defaultLanguage,
  languages,
  rawCompositeStatusText,
  type Language,
  uploadCopy,
} from "./i18n";
import type { ResultRow, TimelineItem } from "./types";

const languageStorageKey = "stella-comp-language";

export function UploadWorkspace() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") {
      return defaultLanguage;
    }

    const storedLanguage = window.localStorage.getItem(languageStorageKey);
    return languages.includes(storedLanguage as Language) ? (storedLanguage as Language) : defaultLanguage;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const resetUploadStateRef = useRef<() => void>(() => undefined);
  const clearJobStateRef = useRef<(preserveStarting?: boolean) => void>(() => undefined);
  const copy = uploadCopy[language];

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
    document.documentElement.lang = language;
  }, [language]);

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
  } = usePreviewUpload({ copy, items, setItems });

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
    rawCompositeStatus,
    resultUrl,
    runComposite,
    runRawComposite,
  } = useCompositeJob({
    activeId,
    canRunJob,
    copy,
    items,
    uploadPreviews: uploadPreviewsAndClearJob,
    uploadSummary,
    uploadedItemIdsRef,
  });

  clearJobStateRef.current = clearJobState;

  const jobTimeline = useMemo<TimelineItem[]>(
    () => [
      {
        label: copy.timeline.selectedFrames,
        value: `${items.length}`,
        tone: items.length > 0 ? "active" : "muted",
      },
      {
        label: copy.timeline.previewGeneration,
        value: copy.timeline.ready(readyCount),
        tone: readyCount > 0 ? "active" : "muted",
      },
      {
        label: copy.timeline.rawExtraction,
        value:
          pendingRawCount > 0 ? copy.timeline.pending(pendingRawCount) : copy.timeline.noPendingRaw,
        tone: pendingRawCount > 0 ? "warn" : "muted",
      },
      {
        label: copy.timeline.previewUpload,
        value: uploadSummary
          ? copy.timeline.uploaded(uploadSummary.uploadedCount)
          : copy.timeline.notUploaded,
        tone: uploadSummary ? "active" : "muted",
      },
      {
        label: copy.timeline.clientStack,
        value: clientCompositeStatusText(clientCompositeStatus, language),
        tone:
          clientCompositeStatus === "failed"
            ? "warn"
            : clientCompositeStatus === "idle"
              ? "muted"
            : "active",
      },
      {
        label: copy.timeline.rawStack,
        value: rawCompositeStatusText(rawCompositeStatus, language),
        tone:
          rawCompositeStatus === "failed"
            ? "warn"
            : rawCompositeStatus === "idle"
              ? "muted"
              : "active",
      },
    ],
    [
      clientCompositeStatus,
      copy,
      items.length,
      language,
      pendingRawCount,
      rawCompositeStatus,
      readyCount,
      uploadSummary,
    ],
  );

  const resultRows = useMemo<ResultRow[]>(
    () => [
      {
        label: copy.resultRows.resultPng,
        value:
          clientCompositeStatus === "completed"
            ? copy.resultRows.generatedInBrowser
            : copy.resultRows.notGenerated,
      },
      {
        label: copy.resultRows.stackStatus,
        value: clientCompositeStatusText(clientCompositeStatus, language),
      },
      { label: copy.resultRows.warnings, value: `${clientWarnings.length}` },
    ],
    [clientCompositeStatus, clientWarnings.length, copy, language],
  );

  function handleSelectFrames() {
    inputRef.current?.click();
  }

  return (
    <main className="page-shell">
      <HeroMetrics
        compressionRatio={compressionRatio}
        copy={copy}
        frameCount={items.length}
        language={language}
        previewBytes={previewBytes}
        setLanguage={setLanguage}
      />

      <section className="workspace-grid">
        <UploadQueuePanel
          activeItem={activeItem}
          clearQueue={clearQueue}
          copy={copy}
          enqueueFiles={enqueueFiles}
          inputRef={inputRef}
          isDragging={isDragging}
          items={items}
          language={language}
          onSelectFrames={handleSelectFrames}
          setActiveId={setActiveId}
          setIsDragging={setIsDragging}
        />

        <PreviewSettingsPanel
          activeItem={activeItem}
          copy={copy}
          items={items}
          setActiveId={setActiveId}
        />

        <PreviewPanel
          activeItem={activeItem}
          copy={copy}
          uploadableCount={uploadableCount}
          uploadPreviews={uploadPreviewsAndClearJob}
        />

        <JobStatusPanel
          canRunJob={canRunJob}
          compressionRatio={compressionRatio}
          clientCompositeStatus={clientCompositeStatus}
          clientWarnings={clientWarnings}
          copy={copy}
          isJobBusy={isJobBusy}
          job={job}
          jobError={jobError}
          language={language}
          previewBytes={previewBytes}
          rawCompositeStatus={rawCompositeStatus}
          runComposite={runComposite}
          runRawComposite={runRawComposite}
          sourceBytes={sourceBytes}
          timeline={jobTimeline}
          uploadError={uploadError}
          uploadSummary={uploadSummary}
        />

        <ResultPanel
          clientCompositeStatus={clientCompositeStatus}
          copy={copy}
          language={language}
          resultRows={resultRows}
          resultUrl={resultUrl}
        />
      </section>
    </main>
  );
}
