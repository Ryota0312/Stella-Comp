"use client";

import { create } from "zustand";
import type { AlignmentMethod, SourceExportFormat, TransformModel, WorkspaceStep } from "../model/types";
import { defaultLanguage, languages, type Language } from "../model/i18n";

export const languageStorageKey = "stella-comp-language";

type StackingState = {
  alignmentMethod: AlignmentMethod;
  currentStep: WorkspaceStep;
  language: Language;
  sourceExportFormat: SourceExportFormat;
  transformModel: TransformModel;
  setAlignmentMethod: (method: AlignmentMethod) => void;
  setCurrentStep: (step: WorkspaceStep) => void;
  setLanguage: (language: Language) => void;
  setSourceExportFormat: (format: SourceExportFormat) => void;
  setTransformModel: (model: TransformModel) => void;
};

function initialLanguage(): Language {
  if (typeof window === "undefined") {
    return defaultLanguage;
  }

  const storedLanguage = window.localStorage.getItem(languageStorageKey);
  return languages.includes(storedLanguage as Language) ? (storedLanguage as Language) : defaultLanguage;
}

export const useStackingStore = create<StackingState>((set) => ({
  alignmentMethod: "stars",
  currentStep: "upload",
  language: initialLanguage(),
  sourceExportFormat: "tiff",
  transformModel: "affine",
  setAlignmentMethod: (alignmentMethod) => set({ alignmentMethod }),
  setCurrentStep: (currentStep) => set({ currentStep }),
  setLanguage: (language) => set({ language }),
  setSourceExportFormat: (sourceExportFormat) => set({ sourceExportFormat }),
  setTransformModel: (transformModel) => set({ transformModel }),
}));
