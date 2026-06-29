"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HeroMetrics } from "./components/HeroMetrics";
import { JobStatusPanel } from "./components/JobStatusPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { ResultPanel } from "./components/ResultPanel";
import { UploadQueuePanel } from "./components/UploadQueuePanel";
import { useCompositeJob } from "./hooks/useCompositeJob";
import { usePreviewUpload } from "./hooks/usePreviewUpload";
import { useUploadQueue } from "./hooks/useUploadQueue";
import { useUnsavedWorkGuard } from "./hooks/useUnsavedWorkGuard";
import {
  defaultLanguage,
  languages,
  type Language,
  uploadCopy,
} from "./model/i18n";
import { classNames } from "./model/utils";
import type { AlignmentMethod, SourceExportFormat, TransformModel, WorkspaceStep } from "./model/types";
import sharedStyles from "./components/shared.module.css";
import styles from "./StackingWorkspace.module.css";

const languageStorageKey = "stella-comp-language";
const debugEnabled =
  process.env.NEXT_PUBLIC_DEPLOY_STAGE === "staging" ||
  process.env.NEXT_PUBLIC_APP_ENV === "staging";

export function StackingWorkspace() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") {
      return defaultLanguage;
    }

    const storedLanguage = window.localStorage.getItem(languageStorageKey);
    return languages.includes(storedLanguage as Language) ? (storedLanguage as Language) : defaultLanguage;
  });
  const [currentStep, setCurrentStep] = useState<WorkspaceStep>("upload");
  const [alignmentMethod, setAlignmentMethod] = useState<AlignmentMethod>("stars");
  const [transformModel, setTransformModel] = useState<TransformModel>("affine");
  const [sourceExportFormat, setSourceExportFormat] = useState<SourceExportFormat>("tiff");
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
    excludedFrameCount,
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
    usedFrameCount,
  } = useCompositeJob({
    activeId,
    alignmentMethod,
    transformModel,
    canRunJob,
    copy,
    items,
    sourceExportFormat,
    uploadPreviews: uploadPreviewsAndClearJob,
    uploadSummary,
    uploadedItemIdsRef,
  });

  clearJobStateRef.current = clearJobState;

  const canStartPreview = canRunJob && !isJobBusy;
  const canOpenSourceStep = clientCompositeStatus === "completed" && Boolean(resultPreviewUrl);
  const referencePreviewUrl = resultReferencePreviewUrl ?? activeItem?.previewUrl ?? null;
  const hasSelectedFrames = items.length > 0;

  useUnsavedWorkGuard({
    enabled: hasSelectedFrames,
    message: copy.navigation.leaveConfirm,
  });

  function handleSelectFrames() {
    inputRef.current?.click();
  }

  const handleSetAlignmentMethod = useCallback(
    (method: AlignmentMethod) => {
      if (method === alignmentMethod) {
        return;
      }

      setAlignmentMethod(method);
      setCurrentStep("upload");
      clearJobStateRef.current(false);
    },
    [alignmentMethod],
  );

  const handleSetTransformModel = useCallback(
    (model: TransformModel) => {
      if (model === transformModel) {
        return;
      }

      setTransformModel(model);
      setCurrentStep("upload");
      clearJobStateRef.current(false);
    },
    [transformModel],
  );

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
    if (rawCompositeStatus === "idle" || resultLabel !== sourceExportFormat) {
      void runRawComposite();
    }
  }, [canOpenSourceStep, rawCompositeStatus, resultLabel, runRawComposite, sourceExportFormat]);

  return (
    <main className={styles["page-shell"]}>
      <HeroMetrics
        copy={copy}
        currentStep={currentStep}
        language={language}
        setLanguage={setLanguage}
      />

      <section
        className={classNames(
          styles["workspace-grid"],
          currentStep === "upload" && styles["workspace-step-upload"],
          currentStep === "preview" && styles["workspace-step-preview"],
          currentStep === "source" && styles["workspace-step-source"],
        )}
      >
        {currentStep === "upload" ? (
          <>
            <UploadQueuePanel
              activeItem={activeItem}
              alignmentMethod={alignmentMethod}
              transformModel={transformModel}
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
              setAlignmentMethod={handleSetAlignmentMethod}
              setTransformModel={handleSetTransformModel}
              setActiveId={setActiveId}
              setIsDragging={setIsDragging}
            />

            <PreviewPanel activeItem={activeItem} copy={copy} />
          </>
        ) : null}

        {currentStep === "preview" ? (
          <>
            <JobStatusPanel
              alignmentMethod={alignmentMethod}
              transformModel={transformModel}
              compressionRatio={compressionRatio}
              clientCompositeStatus={clientCompositeStatus}
              clientWarnings={clientWarnings}
              copy={copy}
              debugEnabled={debugEnabled}
              excludedFrameCount={excludedFrameCount}
              frameCount={items.length}
              job={job}
              jobError={jobError}
              language={language}
              previewBytes={previewBytes}
              rawCompositeProgress={rawCompositeProgress}
              rawCompositeStatus={rawCompositeStatus}
              resultLabel={resultLabel}
              setSourceExportFormat={setSourceExportFormat}
              sourceExportEditable
              showSourceExportFormat
              sourceBytes={sourceBytes}
              sourceExportFormat={sourceExportFormat}
              stepActions={
                <>
                  <button
                    type="button"
                    className={classNames(sharedStyles["secondary-action"], sharedStyles["step-back-action"])}
                    onClick={() => setCurrentStep("upload")}
                  >
                    {copy.steps.backToUpload}
                  </button>
                  <button
                    type="button"
                    className={classNames(sharedStyles["primary-action"], sharedStyles["step-forward-action"])}
                    disabled={!canOpenSourceStep}
                    onClick={handleStartSource}
                  >
                    {copy.steps.startSource}
                  </button>
                </>
              }
              uploadError={uploadError}
              uploadSummary={uploadSummary}
              usedFrameCount={usedFrameCount}
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
              rawCompositeProgress={rawCompositeProgress}
              rawCompositeStatus={rawCompositeStatus}
              referencePreviewUrl={referencePreviewUrl}
            />
          </>
        ) : null}

        {currentStep === "source" ? (
          <>
            <JobStatusPanel
              alignmentMethod={alignmentMethod}
              transformModel={transformModel}
              compressionRatio={compressionRatio}
              clientCompositeStatus={clientCompositeStatus}
              clientWarnings={clientWarnings}
              copy={copy}
              debugEnabled={debugEnabled}
              excludedFrameCount={excludedFrameCount}
              frameCount={items.length}
              job={job}
              jobError={jobError}
              language={language}
              previewBytes={previewBytes}
              rawCompositeProgress={rawCompositeProgress}
              rawCompositeStatus={rawCompositeStatus}
              resultLabel={resultLabel}
              setSourceExportFormat={setSourceExportFormat}
              showSourceExportFormat
              sourceBytes={sourceBytes}
              sourceExportFormat={sourceExportFormat}
              stepActions={
                <>
                  <button
                    type="button"
                    className={classNames(sharedStyles["secondary-action"], sharedStyles["step-back-action"])}
                    onClick={() => setCurrentStep("preview")}
                  >
                    {copy.steps.backToPreview}
                  </button>
                  <button
                    type="button"
                    className={sharedStyles["primary-action"]}
                    disabled={!canRunJob || isJobBusy}
                    onClick={runRawComposite}
                  >
                    {copy.execution.runRawStack}
                  </button>
                </>
              }
              uploadError={uploadError}
              uploadSummary={uploadSummary}
              usedFrameCount={usedFrameCount}
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
              rawCompositeProgress={rawCompositeProgress}
              rawCompositeStatus={rawCompositeStatus}
              referencePreviewUrl={referencePreviewUrl}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
