"use client";

import { HeroMetrics } from "./components/HeroMetrics";
import { JobStatusPanel } from "./components/JobStatusPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { ResultPanel } from "./components/ResultPanel";
import { UploadQueuePanel } from "./components/UploadQueuePanel";
import {
  StackingWorkspaceProvider,
  useStackingWorkspace,
} from "./state/StackingWorkspaceContext";
import { classNames } from "./model/utils";
import styles from "./StackingWorkspace.module.css";

export function StackingWorkspace() {
  return (
    <StackingWorkspaceProvider>
      <StackingWorkspaceLayout />
    </StackingWorkspaceProvider>
  );
}

function StackingWorkspaceLayout() {
  const { currentStep } = useStackingWorkspace();

  return (
    <main className={styles["page-shell"]}>
      <HeroMetrics />

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
            <UploadQueuePanel />
            <PreviewPanel />
          </>
        ) : null}

        {currentStep === "preview" ? (
          <>
            <JobStatusPanel phase="preview" />
            <ResultPanel phase="preview" />
          </>
        ) : null}

        {currentStep === "source" ? (
          <>
            <JobStatusPanel phase="source" />
            <ResultPanel phase="source" />
          </>
        ) : null}
      </section>
    </main>
  );
}
