"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type PropsWithChildren,
  type RefObject,
  type SetStateAction,
} from "react";
import type {
  JobSummary,
  PreviewUploadSummary,
  ProcessingWarning,
} from "../api/uploadApi";
import { useCompositeJob } from "../hooks/useCompositeJob";
import { usePreviewUpload } from "../hooks/usePreviewUpload";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { useUnsavedWorkGuard } from "../hooks/useUnsavedWorkGuard";
import { uploadCopy, type Language, type UploadCopy } from "../model/i18n";
import type {
  AlignmentMethod,
  ClientCompositeStatus,
  CompositeProgress,
  QueueItem,
  RawCompositeStatus,
  SourceExportFormat,
  TransformModel,
  WorkspaceStep,
} from "../model/types";
import { languageStorageKey, useStackingStore } from "./stackingStore";

export const debugEnabled =
  process.env.NEXT_PUBLIC_DEPLOY_STAGE === "staging" ||
  process.env.NEXT_PUBLIC_APP_ENV === "staging";

type StackingWorkspaceContextValue = {
  activeId: string | null;
  activeItem?: QueueItem;
  alignmentMethod: AlignmentMethod;
  canOpenSourceStep: boolean;
  canRunJob: boolean;
  canStartPreview: boolean;
  clearQueue: () => void;
  clientCompositeStatus: ClientCompositeStatus;
  clientWarnings: ProcessingWarning[];
  compressionRatio: number;
  copy: UploadCopy;
  currentStep: WorkspaceStep;
  enqueueFiles: (fileList: FileList | null) => void;
  excludedFrameCount: number;
  frameCount: number;
  handleSelectFrames: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  isJobBusy: boolean;
  items: QueueItem[];
  job: JobSummary | null;
  jobError: string | null;
  language: Language;
  previewBytes: number;
  rawCompositeProgress: CompositeProgress | null;
  rawCompositeStatus: RawCompositeStatus;
  referencePreviewUrl: string | null;
  resultDownloadFileName: string | null;
  resultDownloadUrl: string | null;
  resultLabel: SourceExportFormat | null;
  resultPreviewUrl: string | null;
  runRawComposite: () => void;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  setAlignmentMethod: (method: AlignmentMethod) => void;
  setCurrentStep: (step: WorkspaceStep) => void;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  setLanguage: (language: Language) => void;
  setSourceExportFormat: (format: SourceExportFormat) => void;
  setTransformModel: (model: TransformModel) => void;
  sourceBytes: number;
  sourceExportFormat: SourceExportFormat;
  startPreview: () => void;
  startSource: () => void;
  transformModel: TransformModel;
  uploadError: string | null;
  uploadSummary: PreviewUploadSummary | null;
  usedFrameCount: number;
};

const StackingWorkspaceContext = createContext<StackingWorkspaceContextValue | null>(null);

export function StackingWorkspaceProvider({ children }: PropsWithChildren) {
  const {
    alignmentMethod,
    currentStep,
    language,
    setAlignmentMethod: setStoreAlignmentMethod,
    setCurrentStep,
    setLanguage,
    setSourceExportFormat,
    setTransformModel: setStoreTransformModel,
    sourceExportFormat,
    transformModel,
  } = useStackingStore();
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

  const handleSelectFrames = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const setAlignmentMethod = useCallback(
    (method: AlignmentMethod) => {
      if (method === alignmentMethod) {
        return;
      }

      setStoreAlignmentMethod(method);
      setCurrentStep("upload");
      clearJobStateRef.current(false);
    },
    [alignmentMethod, setCurrentStep, setStoreAlignmentMethod],
  );

  const setTransformModel = useCallback(
    (model: TransformModel) => {
      if (model === transformModel) {
        return;
      }

      setStoreTransformModel(model);
      setCurrentStep("upload");
      clearJobStateRef.current(false);
    },
    [setCurrentStep, setStoreTransformModel, transformModel],
  );

  const startPreview = useCallback(() => {
    if (!canStartPreview) {
      return;
    }

    setCurrentStep("preview");
    void runComposite();
  }, [canStartPreview, runComposite, setCurrentStep]);

  const startSource = useCallback(() => {
    if (!canOpenSourceStep) {
      return;
    }

    setCurrentStep("source");
    if (rawCompositeStatus === "idle" || resultLabel !== sourceExportFormat) {
      void runRawComposite();
    }
  }, [
    canOpenSourceStep,
    rawCompositeStatus,
    resultLabel,
    runRawComposite,
    setCurrentStep,
    sourceExportFormat,
  ]);

  const value = useMemo<StackingWorkspaceContextValue>(
    () => ({
      activeId,
      activeItem,
      alignmentMethod,
      canOpenSourceStep,
      canRunJob,
      canStartPreview,
      clearQueue,
      clientCompositeStatus,
      clientWarnings,
      compressionRatio,
      copy,
      currentStep,
      enqueueFiles,
      excludedFrameCount,
      frameCount: items.length,
      handleSelectFrames,
      inputRef,
      isDragging,
      isJobBusy,
      items,
      job,
      jobError,
      language,
      previewBytes,
      rawCompositeProgress,
      rawCompositeStatus,
      referencePreviewUrl,
      resultDownloadFileName,
      resultDownloadUrl,
      resultLabel,
      resultPreviewUrl,
      runRawComposite,
      setActiveId,
      setAlignmentMethod,
      setCurrentStep,
      setIsDragging,
      setLanguage,
      setSourceExportFormat,
      setTransformModel,
      sourceBytes,
      sourceExportFormat,
      startPreview,
      startSource,
      transformModel,
      uploadError,
      uploadSummary,
      usedFrameCount,
    }),
    [
      activeId,
      activeItem,
      alignmentMethod,
      canOpenSourceStep,
      canRunJob,
      canStartPreview,
      clearQueue,
      clientCompositeStatus,
      clientWarnings,
      compressionRatio,
      copy,
      currentStep,
      enqueueFiles,
      excludedFrameCount,
      handleSelectFrames,
      isDragging,
      isJobBusy,
      items,
      job,
      jobError,
      language,
      previewBytes,
      rawCompositeProgress,
      rawCompositeStatus,
      referencePreviewUrl,
      resultDownloadFileName,
      resultDownloadUrl,
      resultLabel,
      resultPreviewUrl,
      runRawComposite,
      setActiveId,
      setAlignmentMethod,
      setCurrentStep,
      setIsDragging,
      setLanguage,
      setSourceExportFormat,
      setTransformModel,
      sourceBytes,
      sourceExportFormat,
      startPreview,
      startSource,
      transformModel,
      uploadError,
      uploadSummary,
      usedFrameCount,
    ],
  );

  return (
    <StackingWorkspaceContext.Provider value={value}>
      {children}
    </StackingWorkspaceContext.Provider>
  );
}

export function useStackingWorkspace() {
  const value = useContext(StackingWorkspaceContext);
  if (!value) {
    throw new Error("useStackingWorkspace must be used inside StackingWorkspaceProvider");
  }
  return value;
}
