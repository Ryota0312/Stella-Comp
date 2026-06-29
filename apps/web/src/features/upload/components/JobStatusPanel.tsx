import type { ChangeEvent, ReactNode } from "react";
import type {
  ClientCompositeStatus,
  CompositeProgress,
  AlignmentMethod,
  RawCompositeStatus,
  SourceExportFormat,
  TransformModel,
} from "../types";
import type { JobSummary, PreviewUploadSummary, ProcessingWarning } from "../uploadApi";
import {
  clientCompositeStatusText,
  rawCompositeStatusText,
  type Language,
  type UploadCopy,
} from "../i18n";
import { formatBytes } from "../utils";

type JobStatusPanelProps = {
  alignmentMethod: AlignmentMethod;
  transformModel: TransformModel;
  compressionRatio: number;
  clientCompositeStatus: ClientCompositeStatus;
  clientWarnings: ProcessingWarning[];
  copy: UploadCopy;
  debugEnabled: boolean;
  excludedFrameCount: number;
  frameCount: number;
  job: JobSummary | null;
  jobError: string | null;
  language: Language;
  previewBytes: number;
  rawCompositeProgress: CompositeProgress | null;
  rawCompositeStatus: RawCompositeStatus;
  resultLabel: SourceExportFormat | null;
  setSourceExportFormat?: (format: SourceExportFormat) => void;
  stepActions?: ReactNode;
  sourceExportEditable?: boolean;
  showSourceExportFormat?: boolean;
  sourceBytes: number;
  sourceExportFormat?: SourceExportFormat;
  uploadError: string | null;
  uploadSummary: PreviewUploadSummary | null;
  usedFrameCount: number;
};

export function JobStatusPanel({
  alignmentMethod,
  transformModel,
  compressionRatio,
  clientCompositeStatus,
  clientWarnings,
  copy,
  debugEnabled,
  excludedFrameCount,
  frameCount,
  job,
  jobError,
  language,
  previewBytes,
  rawCompositeProgress,
  rawCompositeStatus,
  resultLabel,
  setSourceExportFormat,
  stepActions,
  sourceExportEditable = false,
  showSourceExportFormat = false,
  sourceBytes,
  sourceExportFormat = "tiff",
  uploadError,
  uploadSummary,
  usedFrameCount,
}: JobStatusPanelProps) {
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
    <section className="panel panel-jobs">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">{copy.execution.kicker}</p>
          <h2>{copy.execution.title}</h2>
        </div>
      </header>
      <div className="source-export-control execution-summary">
        <div className="readonly-field">
          <span>{copy.execution.alignmentMethod}</span>
          <strong>{copy.execution.alignmentMethods[alignmentMethod]}</strong>
        </div>
        <div className="readonly-field">
          <span>{copy.execution.transformModel}</span>
          <strong>{copy.execution.transformModels[transformModel]}</strong>
        </div>
        <div className="readonly-field">
          <span>{copy.execution.usedFrames}</span>
          <strong>{copy.execution.usedFramesSummary(usedFrameCount, frameCount)}</strong>
        </div>
      </div>
      {showSourceExportFormat ? (
        <div className="source-export-control">
          {sourceExportEditable ? (
            <label className="field">
              <span>{copy.execution.outputFormat}</span>
              <select
                value={sourceExportFormat}
                disabled={!setSourceExportFormat}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setSourceExportFormat?.(event.currentTarget.value as SourceExportFormat)
                }
              >
                <option value="tiff">{copy.execution.outputFormats.tiff}</option>
                <option value="png">{copy.execution.outputFormats.png}</option>
                <option value="jpeg">{copy.execution.outputFormats.jpeg}</option>
              </select>
            </label>
          ) : (
            <div className="readonly-field">
              <span>{copy.execution.outputFormat}</span>
              <strong>{copy.execution.outputFormats[sourceExportFormat]}</strong>
            </div>
          )}
        </div>
      ) : null}
      {uploadError ? <p className="inline-error">{uploadError}</p> : null}
      {jobError ? <p className="inline-error">{jobError}</p> : null}
      {job?.status === "failed" && job.error ? <p className="inline-error">{job.error}</p> : null}
      {visibleWarnings.length ? (
        <div className="warning-list" aria-label={copy.execution.warningsLabel}>
          {visibleWarnings.map((warning, index) => (
            <p key={index}>
              <strong>{copy.execution.warningsLabel}</strong>
              <span>{warning}</span>
            </p>
          ))}
        </div>
      ) : null}
      {debugEnabled ? (
        <div className="debug-panel" aria-label={copy.debug.title}>
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
      {stepActions ? <div className="panel-step-actions">{stepActions}</div> : null}
    </section>
  );
}
