import type { ChangeEvent } from "react";
import type { SourceExportFormat } from "../model/types";
import { clientCompositeStatusText, rawCompositeStatusText } from "../model/i18n";
import { classNames, formatBytes } from "../model/utils";
import { debugEnabled, useStackingWorkspace } from "../state/StackingWorkspaceContext";
import workspaceStyles from "../StackingWorkspace.module.css";
import sharedStyles from "./shared.module.css";
import styles from "./JobStatusPanel.module.css";

type JobStatusPanelProps = {
  phase: "preview" | "source";
};

export function JobStatusPanel({ phase }: JobStatusPanelProps) {
  const {
    alignmentMethod,
    canOpenSourceStep,
    canRunJob,
    clientCompositeStatus,
    clientWarnings,
    compressionRatio,
    copy,
    excludedFrameCount,
    frameCount,
    isJobBusy,
    job,
    jobError,
    language,
    previewBytes,
    rawCompositeProgress,
    rawCompositeStatus,
    resultLabel,
    runRawComposite,
    setCurrentStep,
    setSourceExportFormat,
    sourceBytes,
    sourceExportFormat,
    startSource,
    transformModel,
    uploadError,
    uploadSummary,
    usedFrameCount,
  } = useStackingWorkspace();
  const isPreviewPhase = phase === "preview";
  const sourceExportEditable = isPreviewPhase;

  const otherWarningCount = clientWarnings.filter(
    (warning) => warning.code !== "TRANSFORM_ESTIMATE_FAILED",
  ).length;
  const visibleWarnings = [
    excludedFrameCount > 0 ? copy.execution.transformEstimateFailedWarning(excludedFrameCount) : null,
    otherWarningCount > 0 ? copy.execution.alignmentWarningSummary(otherWarningCount) : null,
  ].filter((warning): warning is string => Boolean(warning));
  const debugRows = debugEnabled
    ? [
        [copy.debug.previewPayload, `${formatBytes(previewBytes)} / ${formatBytes(sourceBytes)}`],
        [copy.debug.compression, compressionRatio > 0 ? `${(compressionRatio * 100).toFixed(1)}%` : "-"],
        [copy.debug.uploaded, uploadSummary ? `${uploadSummary.uploadedCount}` : "-"],
        [copy.debug.alignmentJob, job ? `${job.jobId} (${job.status})` : "-"],
        [copy.debug.clientStatus, clientCompositeStatusText(clientCompositeStatus, language)],
        [copy.debug.rawStatus, rawCompositeStatusText(rawCompositeStatus, language)],
        [copy.debug.alignmentMethod, alignmentMethod],
        [copy.debug.transformModel, transformModel],
        [copy.debug.output, resultLabel ?? "-"],
        [copy.debug.warnings, `${clientWarnings.length}`],
        [
          copy.debug.warningDetails,
          clientWarnings.length
            ? clientWarnings.map((warning) => `${warning.code}: ${warning.message}`).join(" / ")
            : "-",
        ],
      ]
    : [];

  return (
    <section className={classNames(sharedStyles.panel, workspaceStyles["panel-jobs"], styles["panel-jobs"])}>
      <header className={sharedStyles["panel-header"]}>
        <div>
          <p className={sharedStyles["panel-kicker"]}>{copy.execution.kicker}</p>
          <h2>{copy.execution.title}</h2>
        </div>
      </header>
      <div className={classNames(styles["source-export-control"], styles["execution-summary"])}>
        <div className={sharedStyles["readonly-field"]}>
          <span>{copy.execution.alignmentMethod}</span>
          <strong>{copy.execution.alignmentMethods[alignmentMethod]}</strong>
        </div>
        <div className={sharedStyles["readonly-field"]}>
          <span>{copy.execution.transformModel}</span>
          <strong>{copy.execution.transformModels[transformModel]}</strong>
        </div>
        <div className={sharedStyles["readonly-field"]}>
          <span>{copy.execution.usedFrames}</span>
          <strong>{copy.execution.usedFramesSummary(usedFrameCount, frameCount)}</strong>
        </div>
      </div>
      <div className={styles["source-export-control"]}>
        {sourceExportEditable ? (
          <label className={sharedStyles.field}>
            <span>{copy.execution.outputFormat}</span>
            <select
              value={sourceExportFormat}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setSourceExportFormat(event.currentTarget.value as SourceExportFormat)
              }
            >
              <option value="tiff">{copy.execution.outputFormats.tiff}</option>
              <option value="png">{copy.execution.outputFormats.png}</option>
              <option value="jpeg">{copy.execution.outputFormats.jpeg}</option>
            </select>
          </label>
        ) : (
          <div className={sharedStyles["readonly-field"]}>
            <span>{copy.execution.outputFormat}</span>
            <strong>{copy.execution.outputFormats[sourceExportFormat]}</strong>
          </div>
        )}
      </div>
      {uploadError ? <p className={sharedStyles["inline-error"]}>{uploadError}</p> : null}
      {jobError ? <p className={sharedStyles["inline-error"]}>{jobError}</p> : null}
      {job?.status === "failed" && job.error ? <p className={sharedStyles["inline-error"]}>{job.error}</p> : null}
      {visibleWarnings.length ? (
        <div className={styles["warning-list"]} aria-label={copy.execution.warningsLabel}>
          {visibleWarnings.map((warning, index) => (
            <p key={index}>
              <strong>{copy.execution.warningsLabel}</strong>
              <span>{warning}</span>
            </p>
          ))}
        </div>
      ) : null}
      {debugEnabled ? (
        <div className={styles["debug-panel"]} aria-label={copy.debug.title}>
          <h3>{copy.debug.title}</h3>
          <dl>
            {debugRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {rawCompositeProgress ? (
            <p>
              {copy.debug.rawProgress}: {rawCompositeProgress.current} / {rawCompositeProgress.total}{" "}
              ({rawCompositeProgress.label})
            </p>
          ) : null}
          {clientWarnings.length ? (
            <p>
              {copy.debug.warningCodes}: {clientWarnings.map((warning) => warning.code).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={sharedStyles["panel-step-actions"]}>
        {isPreviewPhase ? (
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
              onClick={startSource}
            >
              {copy.steps.startSource}
            </button>
          </>
        ) : (
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
        )}
      </div>
    </section>
  );
}
