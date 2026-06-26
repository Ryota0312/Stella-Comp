import type { ReactNode } from "react";
import type {
  ClientCompositeStatus,
  CompositeProgress,
  RawCompositeStatus,
  TimelineItem,
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
  canRunJob: boolean;
  compressionRatio: number;
  clientCompositeStatus: ClientCompositeStatus;
  clientWarnings: ProcessingWarning[];
  copy: UploadCopy;
  debugEnabled: boolean;
  isJobBusy: boolean;
  job: JobSummary | null;
  jobError: string | null;
  language: Language;
  previewBytes: number;
  rawCompositeProgress: CompositeProgress | null;
  rawCompositeStatus: RawCompositeStatus;
  resultLabel: "png" | "tiff" | null;
  runComposite: () => Promise<void>;
  runRawComposite: () => Promise<void>;
  stepActions?: ReactNode;
  showPreviewAction?: boolean;
  showRawAction?: boolean;
  sourceBytes: number;
  timeline: TimelineItem[];
  uploadError: string | null;
  uploadSummary: PreviewUploadSummary | null;
};

export function JobStatusPanel({
  canRunJob,
  compressionRatio,
  clientCompositeStatus,
  clientWarnings,
  copy,
  debugEnabled,
  isJobBusy,
  job,
  jobError,
  language,
  previewBytes,
  rawCompositeProgress,
  rawCompositeStatus,
  resultLabel,
  runComposite,
  runRawComposite,
  stepActions,
  showPreviewAction = true,
  showRawAction = true,
  sourceBytes,
  timeline,
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
        <div className="action-row">
          {showPreviewAction ? (
            <button
              type="button"
              className="primary-action"
              disabled={!canRunJob || isJobBusy}
              onClick={runComposite}
            >
              {uploadSummary ? copy.execution.runClientStack : copy.execution.uploadAndStack}
            </button>
          ) : null}
          {showRawAction ? (
            <button
              type="button"
              className="secondary-action"
              disabled={!canRunJob || isJobBusy}
              onClick={runRawComposite}
            >
              {copy.execution.runRawStack}
            </button>
          ) : null}
        </div>
      </header>
      <div className="timeline">
        {timeline.map((item) => (
          <div className="timeline-row" key={item.label}>
            <span>{item.label}</span>
            <span className={`timeline-state timeline-${item.tone}`}>{item.value}</span>
          </div>
        ))}
      </div>
      {uploadError ? <p className="inline-error">{uploadError}</p> : null}
      {jobError ? <p className="inline-error">{jobError}</p> : null}
      {clientCompositeStatus !== "idle" && clientCompositeStatus !== "failed" ? (
        <p className="inline-success">
          {clientCompositeStatusText(clientCompositeStatus, language)}
        </p>
      ) : null}
      {rawCompositeStatus !== "idle" && rawCompositeStatus !== "failed" ? (
        <p className="inline-success">
          {copy.execution.rawStackStatus}: {rawCompositeStatusText(rawCompositeStatus, language)}
        </p>
      ) : null}
      {rawCompositeProgress ? (
        <div
          className="progress-block"
          role="progressbar"
          aria-label={copy.execution.rawProgressLabel}
          aria-valuemin={0}
          aria-valuemax={rawCompositeProgress.total}
          aria-valuenow={rawCompositeProgress.current}
        >
          <div className="progress-header">
            <span>{copy.execution.rawProgressLabel}</span>
            <strong>
              {rawCompositeProgress.current} / {rawCompositeProgress.total}
            </strong>
          </div>
          <div className="progress-bar" aria-hidden="true">
            <div
              className="progress-value"
              style={{
                width: `${Math.min(
                  (rawCompositeProgress.current / rawCompositeProgress.total) * 100,
                  100,
                )}%`,
              }}
            />
          </div>
          <p className="progress-detail">
            {rawCompositeStatusText(rawCompositeStatus, language)}: {rawCompositeProgress.label}
          </p>
        </div>
      ) : null}
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
      {stepActions ? <div className="job-step-actions">{stepActions}</div> : null}
    </section>
  );
}
