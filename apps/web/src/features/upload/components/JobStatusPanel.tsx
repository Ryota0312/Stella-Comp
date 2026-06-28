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
};

export function JobStatusPanel({
  alignmentMethod,
  transformModel,
  compressionRatio,
  clientCompositeStatus,
  clientWarnings,
  copy,
  debugEnabled,
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
}: JobStatusPanelProps) {
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
          <span>{copy.timeline.selectedFrames}</span>
          <strong>{copy.hero.frames(frameCount)}</strong>
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
      {clientWarnings.length ? (
        <div className="warning-list" aria-label={copy.execution.warningsLabel}>
          {clientWarnings.map((warning, index) => (
            <p key={`${warning.code}-${index}`}>
              <strong>{warning.code}</strong>
              <span>{warning.message}</span>
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
