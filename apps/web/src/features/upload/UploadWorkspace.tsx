"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeroMetrics } from "./components/HeroMetrics";
import { JobStatusPanel } from "./components/JobStatusPanel";
import { PreviewPanel } from "./components/PreviewPanel";
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
import type { ResultRow, TimelineItem, WorkspaceStep } from "./types";

const languageStorageKey = "stella-comp-language";

export function UploadWorkspace() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") {
      return defaultLanguage;
    }

    const storedLanguage = window.localStorage.getItem(languageStorageKey);
    return languages.includes(storedLanguage as Language) ? (storedLanguage as Language) : defaultLanguage;
  });
  const [currentStep, setCurrentStep] = useState<WorkspaceStep>("upload");
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
      setCurrentStep("upload");
      resetUploadStateRef.current();
      clearJobStateRef.current(false);
    },
    onQueueCleared: () => {
      setCurrentStep("upload");
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
    rawCompositeProgress,
    rawCompositeStatus,
    resultDownloadFileName,
    resultDownloadUrl,
    resultLabel,
    resultPreviewUrl,
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

  const canStartPreview = canRunJob && !isJobBusy;
  const canOpenSourceStep = clientCompositeStatus === "completed" && Boolean(resultPreviewUrl);

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
        value: resultLabel
          ? resultLabel === "tiff"
            ? copy.resultRows.resultTiff
            : copy.resultRows.resultPreviewPng
          : copy.resultRows.notGenerated,
      },
      {
        label: copy.resultRows.stackStatus,
        value: clientCompositeStatusText(clientCompositeStatus, language),
      },
      { label: copy.resultRows.warnings, value: `${clientWarnings.length}` },
    ],
    [clientCompositeStatus, clientWarnings.length, copy, language, resultLabel],
  );

  function handleSelectFrames() {
    inputRef.current?.click();
  }

  const handleStartPreview = useCallback(() => {
    if (!canStartPreview) {
      return;
    }

    setCurrentStep("preview");
    void runComposite();
  }, [canStartPreview, runComposite]);

  return (
    <main className="page-shell">
      <HeroMetrics
        compressionRatio={compressionRatio}
        copy={copy}
        currentStep={currentStep}
        frameCount={items.length}
        language={language}
        previewBytes={previewBytes}
        setLanguage={setLanguage}
      />

      <section className={`workspace-grid workspace-step-${currentStep}`}>
        {currentStep === "upload" ? (
          <>
            <UploadQueuePanel
              activeItem={activeItem}
              canStartPreview={canStartPreview}
              clearQueue={clearQueue}
              copy={copy}
              enqueueFiles={enqueueFiles}
              inputRef={inputRef}
              isDragging={isDragging}
              items={items}
              language={language}
              onSelectFrames={handleSelectFrames}
              onStartPreview={handleStartPreview}
              setActiveId={setActiveId}
              setIsDragging={setIsDragging}
            />

            <PreviewPanel activeItem={activeItem} copy={copy} />
          </>
        ) : null}

        {currentStep === "preview" ? (
          <>
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
              rawCompositeProgress={rawCompositeProgress}
              rawCompositeStatus={rawCompositeStatus}
              runComposite={runComposite}
              runRawComposite={runRawComposite}
              showRawAction={false}
              sourceBytes={sourceBytes}
              timeline={jobTimeline}
              uploadError={uploadError}
              uploadSummary={uploadSummary}
            />

            <ResultPanel
              clientCompositeStatus={clientCompositeStatus}
              copy={copy}
              downloadFileName={resultDownloadFileName}
              downloadUrl={resultDownloadUrl}
              language={language}
              resultLabel={resultLabel}
              resultRows={resultRows}
              previewUrl={resultPreviewUrl}
            />

            <div className="step-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setCurrentStep("upload")}
              >
                {copy.steps.backToUpload}
              </button>
              <button
                type="button"
                className="primary-action"
                disabled={!canOpenSourceStep}
                onClick={() => setCurrentStep("source")}
              >
                {copy.steps.startSource}
              </button>
            </div>
          </>
        ) : null}

        {currentStep === "source" ? (
          <>
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
              rawCompositeProgress={rawCompositeProgress}
              rawCompositeStatus={rawCompositeStatus}
              runComposite={runComposite}
              runRawComposite={runRawComposite}
              showPreviewAction={false}
              sourceBytes={sourceBytes}
              timeline={jobTimeline}
              uploadError={uploadError}
              uploadSummary={uploadSummary}
            />

            <ResultPanel
              clientCompositeStatus={clientCompositeStatus}
              copy={copy}
              downloadFileName={resultDownloadFileName}
              downloadUrl={resultDownloadUrl}
              language={language}
              resultLabel={resultLabel}
              resultRows={resultRows}
              previewUrl={resultPreviewUrl}
            />

            <div className="step-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setCurrentStep("preview")}
              >
                {copy.steps.backToPreview}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
