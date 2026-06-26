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
import type { TimelineItem, WorkspaceStep } from "./types";

const languageStorageKey = "stella-comp-language";
const debugEnabled =
  process.env.NEXT_PUBLIC_DEPLOY_STAGE === "staging" ||
  process.env.NEXT_PUBLIC_APP_ENV === "staging";

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
    resultReferencePreviewUrl,
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
  const referencePreviewUrl = resultReferencePreviewUrl ?? activeItem?.previewUrl ?? null;

  const jobTimeline = useMemo<TimelineItem[]>(
    () =>
      currentStep === "source"
        ? [
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
            {
              label: copy.timeline.sourceOutput,
              value: resultLabel === "tiff" ? copy.timeline.tiffReady : copy.timeline.waiting,
              tone: resultLabel === "tiff" ? "active" : "muted",
            },
          ]
        : [
            {
              label: copy.timeline.selectedFrames,
              value: copy.hero.frames(items.length),
              tone: items.length > 0 ? "active" : "muted",
            },
            {
              label: copy.timeline.previewGeneration,
              value: copy.timeline.ready(readyCount),
              tone: readyCount > 0 ? "active" : "muted",
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
          ],
    [
      clientCompositeStatus,
      copy,
      currentStep,
      items.length,
      language,
      rawCompositeStatus,
      readyCount,
      resultLabel,
    ],
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

  const handleStartSource = useCallback(() => {
    if (!canOpenSourceStep) {
      return;
    }

    setCurrentStep("source");
    if (rawCompositeStatus === "idle") {
      void runRawComposite();
    }
  }, [canOpenSourceStep, rawCompositeStatus, runRawComposite]);

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
              debugEnabled={debugEnabled}
              isJobBusy={isJobBusy}
              job={job}
              jobError={jobError}
              language={language}
              previewBytes={previewBytes}
              rawCompositeProgress={rawCompositeProgress}
              rawCompositeStatus={rawCompositeStatus}
              resultLabel={resultLabel}
              runComposite={runComposite}
              runRawComposite={runRawComposite}
              showRawAction={false}
              sourceBytes={sourceBytes}
              stepActions={
                <>
                  <button
                    type="button"
                    className="secondary-action step-back-action"
                    onClick={() => setCurrentStep("upload")}
                  >
                    {copy.steps.backToUpload}
                  </button>
                  <button
                    type="button"
                    className="primary-action step-forward-action"
                    disabled={!canOpenSourceStep}
                    onClick={handleStartSource}
                  >
                    {copy.steps.startSource}
                  </button>
                </>
              }
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
              phase="preview"
              resultLabel={resultLabel}
              previewUrl={resultPreviewUrl}
              referencePreviewUrl={referencePreviewUrl}
            />
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
              debugEnabled={debugEnabled}
              isJobBusy={isJobBusy}
              job={job}
              jobError={jobError}
              language={language}
              previewBytes={previewBytes}
              rawCompositeProgress={rawCompositeProgress}
              rawCompositeStatus={rawCompositeStatus}
              resultLabel={resultLabel}
              runComposite={runComposite}
              runRawComposite={runRawComposite}
              showPreviewAction={false}
              sourceBytes={sourceBytes}
              stepActions={
                <button
                  type="button"
                  className="secondary-action step-back-action"
                  onClick={() => setCurrentStep("preview")}
                >
                  {copy.steps.backToPreview}
                </button>
              }
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
              phase="source"
              resultLabel={resultLabel}
              previewUrl={resultPreviewUrl}
              referencePreviewUrl={referencePreviewUrl}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
