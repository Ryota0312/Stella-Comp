import type { ClientCompositeStatus, RawCompositeStatus, TimelineItem } from "../types";
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
  isJobBusy: boolean;
  job: JobSummary | null;
  jobError: string | null;
  language: Language;
  previewBytes: number;
  rawCompositeStatus: RawCompositeStatus;
  runComposite: () => Promise<void>;
  runRawComposite: () => Promise<void>;
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
  isJobBusy,
  job,
  jobError,
  language,
  previewBytes,
  rawCompositeStatus,
  runComposite,
  runRawComposite,
  sourceBytes,
  timeline,
  uploadError,
  uploadSummary,
}: JobStatusPanelProps) {
  return (
    <section className="panel panel-jobs">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">{copy.execution.kicker}</p>
          <h2>{copy.execution.title}</h2>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="primary-action"
            disabled={!canRunJob || isJobBusy}
            onClick={runComposite}
          >
            {uploadSummary ? copy.execution.runClientStack : copy.execution.uploadAndStack}
          </button>
          <button
            type="button"
            className="secondary-action"
            disabled={!canRunJob || isJobBusy}
            onClick={runRawComposite}
          >
            {copy.execution.runRawStack}
          </button>
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
      <div className="progress-block">
        <div className="progress-header">
          <span>{copy.execution.previewPayload}</span>
          <strong>
            {formatBytes(previewBytes)} / {formatBytes(sourceBytes)}
          </strong>
        </div>
        <div className="progress-bar" aria-hidden="true">
          <div
            className="progress-value"
            style={{ width: `${Math.min(compressionRatio * 100, 100)}%` }}
          />
        </div>
      </div>
      {uploadError ? <p className="inline-error">{uploadError}</p> : null}
      {uploadSummary ? (
        <p className="inline-success">
          {copy.execution.uploadedSummary(
            uploadSummary.uploadedCount,
            formatBytes(uploadSummary.uploadedBytes),
          )}
        </p>
      ) : null}
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
    </section>
  );
}
